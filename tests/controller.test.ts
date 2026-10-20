import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BalanceController } from '../src/controller'
import type { ClientContext } from '../src/types'

/** Startup outcome the fake account Remote returns for one attempt. */
type Outcome = 'ready' | 'failed' | 'null' | 'reject'

interface Harness {
  ctx: ClientContext
  /** Timestamps of every `getBalance` call. */
  balanceCalls: number[]
  focusHandlers: Set<() => void>
  visibilityHandlers: Set<() => void>
  /** Effect cleanups registered through `ctx.effect`. */
  cleanups: (() => void)[]
}

/**
 * Build a Cordis-like Client context around a scripted account Remote.
 *
 * @param outcomes - one outcome per balance read, the last one repeats.
 */
function createHarness(outcomes: Outcome[]): Harness {
  const balanceCalls: number[] = []
  const focusHandlers = new Set<() => void>()
  const visibilityHandlers = new Set<() => void>()
  const cleanups: (() => void)[] = []
  let read = 0

  const nextOutcome = (): Outcome => {
    const outcome = outcomes[Math.min(read, outcomes.length - 1)] ?? 'failed'
    read += 1
    return outcome
  }

  const windowStub = {
    addEventListener: (type: string, listener: () => void): void => {
      if (type === 'focus') focusHandlers.add(listener)
    },
    removeEventListener: (type: string, listener: () => void): void => {
      if (type === 'focus') focusHandlers.delete(listener)
    },
  }
  const documentStub = {
    visibilityState: 'visible',
    addEventListener: (type: string, listener: () => void): void => {
      if (type === 'visibilitychange') visibilityHandlers.add(listener)
    },
    removeEventListener: (type: string, listener: () => void): void => {
      if (type === 'visibilitychange') visibilityHandlers.delete(listener)
    },
  }
  ;(globalThis as Record<string, unknown>).window = windowStub
  ;(globalThis as Record<string, unknown>).document = documentStub

  const readyValue = {
    status: 'ready' as const,
    value: [{ currency: 'CNY', balance: '12.5' }],
    bonusWallets: [],
  }

  const ctx = {
    effect: (callback: () => void | (() => void)): (() => void) => {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => {}
    },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
      getSnapshot: () => ({ active: 'zh-CN', revision: 1 }),
    },
    slots: {
      inject: () => () => {},
      register: () => () => {},
    },
    configForms: {
      get: () => ({
        getSnapshot: () => ({
          status: 'ready',
          // Polling off keeps the fake timers deterministic; the startup path is what is under test.
          value: { pollingEnabled: false, pollingIntervalMs: 60000, warnThresholdCny: 10, dangerThresholdCny: 1 },
          writable: true,
        }),
        subscribe: () => () => {},
        set: () => true,
        mutate: () => true,
      }),
    },
    remote: {
      $on: () => () => {},
      account: {
        getBalance: () => {
          balanceCalls.push(Date.now())
          const outcome = nextOutcome()
          if (outcome === 'reject') return Promise.reject(new Error('boom'))
          if (outcome === 'null') return Promise.resolve({ ok: true, value: null })
          if (outcome === 'failed') return Promise.resolve({ ok: true, value: { status: 'failed' } })
          return Promise.resolve({ ok: true, value: readyValue })
        },
        getState: () => Promise.resolve({ ok: true, value: { status: 'credential-stored' } }),
        watch: async function* () {},
      },
    },
  } as unknown as ClientContext

  return { ctx, balanceCalls, focusHandlers, visibilityHandlers, cleanups }
}

/** Let pending promise chains inside one request settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
})

describe('BalanceController.attach', () => {
  it('is idempotent: a second attach registers nothing extra', async () => {
    const harness = createHarness(['ready'])
    const controller = new BalanceController(harness.ctx)

    const detachFirst = controller.attach()
    const detachSecond = controller.attach()

    expect(harness.focusHandlers.size).toBe(1)
    expect(harness.visibilityHandlers.size).toBe(1)
    await settle()
    expect(harness.balanceCalls.length).toBe(1)

    detachFirst()
    detachSecond()
    expect(harness.focusHandlers.size).toBe(0)
    expect(harness.visibilityHandlers.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reads once on activation and does not retry a ready startup read', async () => {
    const harness = createHarness(['ready'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)
    expect(controller.getSnapshot().refreshing).toBe(false)
    expect(controller.getSnapshot().wallets?.value[0]?.balance).toBe('12.5')

    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.balanceCalls.length).toBe(1)
    detach()
  })

  it('retries a failing startup read at 1s / 2s / 4s and stops when ready', async () => {
    const harness = createHarness(['failed', 'failed', 'ready'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)
    expect(controller.getSnapshot().refreshing).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    expect(harness.balanceCalls.length).toBe(2)
    expect(controller.getSnapshot().refreshing).toBe(true)

    await vi.advanceTimersByTimeAsync(2000)
    expect(harness.balanceCalls.length).toBe(3)
    expect(controller.getSnapshot().refreshing).toBe(false)
    expect(controller.getSnapshot().wallets).not.toBeNull()

    await vi.advanceTimersByTimeAsync(8000)
    expect(harness.balanceCalls.length).toBe(3)
    detach()
  })

  it('gives up after three retries and clears the refreshing flag', async () => {
    const harness = createHarness(['failed'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000)
    expect(harness.balanceCalls.length).toBe(4)
    expect(controller.getSnapshot().refreshing).toBe(false)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(harness.balanceCalls.length).toBe(4)
    detach()
  })

  it('treats a signed-out startup read as a failure and keeps retrying', async () => {
    const harness = createHarness(['null', 'ready'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(harness.balanceCalls.length).toBe(2)
    expect(controller.getSnapshot().signedOut).toBe(false)
    detach()
  })

  it('cancels queued startup retries when a manual refresh succeeds', async () => {
    const harness = createHarness(['failed', 'ready'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)
    controller.refreshNow()
    await settle()
    expect(harness.balanceCalls.length).toBe(2)
    expect(controller.getSnapshot().refreshing).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.balanceCalls.length).toBe(2)
    detach()
  })

  it('never retries failures from non-startup triggers', async () => {
    const harness = createHarness(['ready', 'failed'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)

    // The 20s focus throttle must have elapsed before the focus trigger.
    await vi.advanceTimersByTimeAsync(20_000)
    const focus = [...harness.focusHandlers][0]
    expect(focus).toBeDefined()
    focus?.()
    await settle()
    expect(harness.balanceCalls.length).toBe(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.balanceCalls.length).toBe(2)
    detach()
  })

  it('clears the startup retry timer on detach', async () => {
    const harness = createHarness(['failed'])
    const controller = new BalanceController(harness.ctx)
    const detach = controller.attach()

    await settle()
    expect(harness.balanceCalls.length).toBe(1)
    // One retry timer plus the poll timer are pending.
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2)

    detach()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.balanceCalls.length).toBe(1)
  })
})