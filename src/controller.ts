/**
 * Balance state and refresh scheduling for the sidebar row.
 *
 * The controller owns every trigger, timer and Remote subscription, and is
 * attached to the **plugin lifecycle** (see `apply()` in `client.tsx`) rather
 * than to the row component: collapsing the sidebar unmounts the row, and the
 * startup read, focus refresh, turn-end refresh, poll and account stream must
 * keep working while it is hidden.
 *
 * The row itself only reads the snapshot and asks for forced refreshes.
 */
import type { WalletSet } from './balance'
import { browserStorage, readCache, writeCache, type KeyValueStorage } from './cache'
import { normalizeWalletSet } from './balance'
import { CLIENT_VERSION, FOCUS_THROTTLE_MS, REQUEST_TIMEOUT_MS, ROW_ID } from './constants'
import { DEFAULT_SETTINGS, normalizeSettings, type BalanceSettings } from './settings'
import { StartupRetrySequence } from './startup-retry'
import type {
  AccountClientMeta,
  AccountState,
  BalanceResult,
  ClientContext,
  RemoteResult,
} from './types'

/** Destinations taken from the account state. */
export interface AccountLinks {
  usageUrl?: string
  topUpUrl?: string
}

/** Everything the row renders from. */
export interface RowSnapshot {
  /** Latest wallet snapshot, `null` when signed out or never read. */
  wallets: WalletSet | null
  /** Epoch milliseconds of the read that produced `wallets`. */
  fetchedAt: number | null
  /** Whether the Host reports no signed-in account. */
  signedOut: boolean
  /** Last failure description, or `null`. */
  error: string | null
  /** Whether a read is in flight or a startup retry is queued. */
  refreshing: boolean
  /** Whether any read or cache restore has completed. */
  initialized: boolean
  /** Platform destinations for the tooltip actions. */
  links: AccountLinks
}

/** Extract a human-readable failure description from a Remote error or thrown value. */
export function describeFailure(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const candidate = value as { message?: unknown }
    if (typeof candidate.message === 'string' && candidate.message !== '') return candidate.message
  }
  return ''
}

/** Read the live plugin configuration, falling back to defaults when unserved. */
export function readConfig(ctx: ClientContext): BalanceSettings {
  try {
    const form = ctx.configForms.get(ROW_ID)
    const snapshot = typeof form?.getSnapshot === 'function' ? form.getSnapshot() : undefined
    return normalizeSettings(snapshot?.value)
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Balance state and refresh triggers.
 *
 * `attach()` is idempotent: the second call is a no-op so a duplicate lifecycle
 * effect cannot register a second set of listeners or a second startup read.
 */
export class BalanceController {
  private ctx: ClientContext
  private listeners = new Set<() => void>()
  private snapshot: RowSnapshot
  private attached = false
  private disposed = false
  private inFlight = false
  private pending = false
  private lastRequestAt = 0
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private cleanupStack: (() => void)[] = []
  private runningSessions = new Set<string>()
  /** Startup retry schedule, owned by this controller. */
  private startupRetry = new StartupRetrySequence()
  /** Pending startup retry timer, cleared on teardown and on success. */
  private startupRetryTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether the in-flight read is a startup attempt (only those retry). */
  private requestIsStartup = false
  /** Whether the queued follow-up read must continue the startup sequence. */
  private pendingStartup = false

  constructor(ctx: ClientContext) {
    this.ctx = ctx
    const cached = readCache(this.storage())
    this.snapshot = {
      wallets: cached?.wallets ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
      signedOut: false,
      error: null,
      refreshing: false,
      initialized: cached !== undefined,
      links: {},
    }
  }

  /** Subscribe to snapshot replacements. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Current snapshot (stable between mutations). */
  getSnapshot = (): RowSnapshot => this.snapshot

  /** Force a read, still sharing the in-flight/queued slot. */
  refreshNow(): void {
    this.request('manual')
  }

  /**
   * Start every trigger and the startup read. Bound to the plugin lifecycle.
   *
   * @returns the detach cleanup, used directly as the `ctx.effect` disposer.
   */
  attach(): () => void {
    if (this.disposed || this.attached) return () => {}
    this.attached = true
    if (typeof window !== 'undefined') {
      const onFocus = (): void => this.request('focus')
      window.addEventListener('focus', onFocus)
      this.cleanupStack.push(() => window.removeEventListener('focus', onFocus))
    }
    if (typeof document !== 'undefined') {
      const onVisibility = (): void => {
        if (document.visibilityState !== 'visible') return
        const settings = readConfig(this.ctx)
        if (!settings.pollingEnabled) return
        if (Date.now() - this.lastRequestAt < settings.pollingIntervalMs) return
        this.request('visibility')
      }
      document.addEventListener('visibilitychange', onVisibility)
      this.cleanupStack.push(() => document.removeEventListener('visibilitychange', onVisibility))
    }
    try {
      const off = this.ctx.remote.$on('api-session/status', (sessionId: string, running: boolean) => {
        if (running === true) {
          this.runningSessions.add(sessionId)
          return
        }
        if (this.runningSessions.delete(sessionId)) this.request('turn')
      })
      if (typeof off === 'function') this.cleanupStack.push(off)
    } catch {
      /* a deployment without forwarded session status simply polls */
    }
    this.openAccountStream()
    this.schedulePoll()
    this.beginStartup()
    return () => this.detach()
  }

  /** Stop triggers and timers; state and cache survive. */
  detach(): void {
    this.attached = false
    this.cancelStartupRetries()
    for (const cleanup of this.cleanupStack.splice(0)) {
      try {
        cleanup()
      } catch {
        /* cleanup is best effort */
      }
    }
    this.stopPoll()
  }

  /** Release everything; called when the plugin unloads. */
  dispose(): void {
    this.disposed = true
    this.detach()
    this.listeners.clear()
  }

  /** localStorage when available. */
  private storage(): KeyValueStorage | undefined {
    return browserStorage()
  }

  /** Identity of this client for account requests. */
  private clientMeta(): AccountClientMeta {
    let locale = 'zh-CN'
    try {
      const active = this.ctx.locale.getSnapshot()?.active
      if (typeof active === 'string' && active !== '') locale = active
    } catch {
      /* keep the default */
    }
    return {
      version: CLIENT_VERSION,
      locale,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
  }

  /** Publish a partial snapshot. */
  private update(patch: Partial<RowSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Open the startup retry sequence and fire its first read. */
  private beginStartup(): void {
    this.startupRetry.begin()
    this.request('startup', { startup: true })
  }

  /**
   * Schedule the next startup retry after one completed attempt.
   *
   * Only startup attempts reach this method, so other triggers never retry.
   * Scheduling happens after the attempt settled, never while it is in flight.
   *
   * @param ready - whether the attempt produced a ready snapshot.
   */
  private afterStartupAttempt(ready: boolean): void {
    const schedule = this.startupRetry.afterAttempt(ready)
    if (schedule === undefined) return
    this.startupRetryTimer = setTimeout(() => {
      this.startupRetryTimer = undefined
      if (this.disposed || !this.attached || !this.startupRetry.active) return
      if (this.inFlight) {
        // A different trigger already reads; continue the sequence afterwards
        // instead of racing the in-flight merge.
        this.pending = true
        this.pendingStartup = true
        return
      }
      this.request('startup-retry', { startup: true })
    }, schedule.delayMs)
  }

  /** Clear the queued startup retry, if any, and close the sequence. */
  private cancelStartupRetries(): void {
    this.startupRetry.cancel()
    if (this.startupRetryTimer === undefined) return
    clearTimeout(this.startupRetryTimer)
    this.startupRetryTimer = undefined
  }

  /**
   * Request one balance read.
   *
   * @param reason - trigger identity; only `focus` is throttled.
   * @param options - `startup` marks an attempt that participates in the startup
   *   retry sequence.
   */
  private request(reason: string, options: { startup?: boolean } = {}): void {
    if (this.disposed) return
    if (this.inFlight) {
      this.pending = true
      if (options.startup === true) this.pendingStartup = true
      return
    }
    const now = Date.now()
    if (reason === 'focus' && now - this.lastRequestAt < FOCUS_THROTTLE_MS) return
    this.lastRequestAt = now
    this.inFlight = true
    this.requestIsStartup = options.startup === true
    if (this.requestIsStartup || this.snapshot.initialized) this.update({ refreshing: true })
    void this.fetchOnce().then((ready) => {
      this.inFlight = false
      if (this.disposed) return
      const startup = this.requestIsStartup
      this.requestIsStartup = false
      this.update({ initialized: true })
      if (startup) this.afterStartupAttempt(ready)
      else if (ready) this.cancelStartupRetries()
      if (!this.startupRetry.active) this.update({ refreshing: false })
      const rerun = this.pending
      const rerunIsStartup = this.pendingStartup && this.startupRetry.active
      this.pending = false
      this.pendingStartup = false
      if (rerun) this.request(rerunIsStartup ? 'startup-queued' : 'queued', { startup: rerunIsStartup })
    })
  }

  /**
   * Execute one balance + account-state read under the client timeout.
   *
   * @returns whether the read produced a ready wallet snapshot.
   */
  private async fetchOnce(): Promise<boolean> {
    const remote = this.ctx.remote
    const meta = this.clientMeta()
    const [stateSettlement, balanceSettlement] = await Promise.allSettled([
      this.withTimeout(
        Promise.resolve().then(() =>
          typeof remote.account.getState === 'function' ? remote.account.getState() : undefined,
        ),
      ),
      this.withTimeout(Promise.resolve().then(() => remote.account.getBalance(meta))),
    ])
    if (this.disposed) return false
    if (stateSettlement.status === 'fulfilled') this.applyAccountValue(stateSettlement.value)
    if (balanceSettlement.status === 'rejected') {
      this.update({ error: describeFailure(balanceSettlement.reason) || 'request failed' })
      return false
    }
    const result = balanceSettlement.value as RemoteResult<BalanceResult> | undefined
    if (result === undefined || result === null || result.ok !== true) {
      const failure = result as { error?: unknown } | undefined
      this.update({ error: describeFailure(failure?.error) || describeFailure(result) || 'request failed' })
      return false
    }
    const value = result.value
    if (value === null) {
      this.update({ wallets: null, signedOut: true, error: null })
      return false
    }
    if (value.status === 'ready') {
      const wallets = normalizeWalletSet(value)
      const fetchedAt = Date.now()
      this.update({ wallets, fetchedAt, signedOut: false, error: null })
      if (wallets !== null) writeCache(this.storage(), { wallets, fetchedAt })
      return true
    }
    this.update({ signedOut: false, error: 'failed' })
    return false
  }

  /** Accept either a Remote result envelope or a raw account state value. */
  private applyAccountValue(value: unknown): void {
    let state: AccountState | undefined
    if (value !== null && typeof value === 'object') {
      const envelope = value as { ok?: unknown; value?: unknown; links?: unknown; status?: unknown }
      if (envelope.ok === true && envelope.value !== null && typeof envelope.value === 'object') {
        state = envelope.value as AccountState
      } else if (envelope.links !== undefined || envelope.status !== undefined) {
        state = value as AccountState
      }
    }
    if (state === undefined) return
    const links = state.links
    if (links === null || typeof links !== 'object') return
    const usageUrl = typeof links.usageUrl === 'string' ? links.usageUrl : undefined
    const topUpUrl = typeof links.topUpUrl === 'string' ? links.topUpUrl : undefined
    if (usageUrl !== this.snapshot.links.usageUrl || topUpUrl !== this.snapshot.links.topUpUrl) {
      this.update({ links: { usageUrl, topUpUrl } })
    }
  }

  /** Follow the account stream so a sign-in/out triggers a fresh read. */
  private openAccountStream(): void {
    const remote = this.ctx.remote
    if (typeof remote.$stream !== 'function' || typeof remote.account?.watch !== 'function') return
    try {
      const stream = remote.$stream({
        name: 'DeepSeek balance account stream',
        open: (signal: AbortSignal) => remote.account.watch(signal),
        ended: () => new Error('DeepSeek balance account stream ended'),
      })
      this.cleanupStack.push(() => {
        void stream.dispose().catch(() => {})
      })
      void (async () => {
        try {
          for await (const frame of stream as AsyncIterable<{ value?: unknown; accept?: () => void }>) {
            if (this.disposed || !this.attached) return
            this.applyAccountValue(frame?.value)
            try {
              frame?.accept?.()
            } catch {
              /* accepting is the stream's business */
            }
            this.request('account')
          }
        } catch {
          /* the poll keeps the value fresh when the stream is unavailable */
        }
      })()
    } catch {
      /* no account stream in this deployment */
    }
  }

  /** (Re)schedule the fallback poll using the live interval. */
  private schedulePoll(): void {
    this.stopPoll()
    if (this.disposed || !this.attached) return
    const { pollingIntervalMs } = readConfig(this.ctx)
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined
      try {
        const settings = readConfig(this.ctx)
        if (
          this.attached &&
          settings.pollingEnabled &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) {
          this.request('poll')
        }
      } finally {
        this.schedulePoll()
      }
    }, pollingIntervalMs)
  }

  /** Cancel the pending poll. */
  private stopPoll(): void {
    if (this.pollTimer === undefined) return
    clearTimeout(this.pollTimer)
    this.pollTimer = undefined
  }

  /** Race one request against the client timeout. */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }
}
