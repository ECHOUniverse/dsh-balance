/**
 * Minimal local type surface for the browser module system and the Client
 * plugin context.
 *
 * The repository intentionally does not depend on any `@deepseek-ai/*` package
 * for types (they are only resolvable inside an installed Harness), so the two
 * contracts this bundle touches are declared narrowly here. Runtime values come
 * from the browser module table and from the Cordis context; nothing here is
 * imported at runtime.
 */

/** One lazy factory registration handed to the module loader. */
export interface ModuleLoaderEntry {
  /** Package name that owns the factory; serves as its module id. */
  id: string
  /** Factory receiving the synchronous module-table `require`. */
  factory: (require: (specifier: string) => unknown) => unknown
}

declare global {
  interface Window {
    /** Present in the Harness Web shell before any plugin bundle executes. */
    __ModuleLoader__?: {
      load: (entry: ModuleLoaderEntry) => void
    }
  }
}

/** Translate function bound to the plugin's locale namespace. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/** A value observable handed to slot components by the Host. */
export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Loose Cordis Client context: only the members this bundle uses. */
export interface ClientContext {
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
    getSnapshot(): { active?: string; revision?: number }
  }
  slots: {
    inject(slot: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  remote: {
    $on(event: string, listener: (...args: any[]) => void): () => void
    $stream?: (options: {
      name: string
      open: (signal: AbortSignal) => AsyncIterable<unknown>
      ended: (accepted: boolean) => Error
    }) => { [Symbol.asyncIterator](): AsyncIterator<unknown>; dispose(): Promise<void> }
    account: {
      getBalance(meta: AccountClientMeta): Promise<RemoteResult<BalanceResult>>
      getState(): Promise<RemoteResult<AccountState>>
      watch(signal: AbortSignal): AsyncIterable<unknown>
    }
  }
  configForms: {
    get(entryId: string): ConfigFormHandle
  }
  effect(callback: () => void | (() => void), label?: string): () => void
}

/** Identity of the requesting client, required by every account Remote call. */
export interface AccountClientMeta {
  version: string
  locale: string
  timezoneOffsetSeconds: number
}

/** Result envelope of every Remote call. */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error?: { message?: string; code?: string } }

/** Service-account state delivered by `account.getState`. */
export interface AccountState {
  status?: 'signed-out' | 'credential-stored'
  links?: { usageUrl?: string; topUpUrl?: string }
  attempt?: { phase?: string } | null
}

/** `null` when signed out, otherwise a ready or failed wallet read. */
export type BalanceResult =
  | null
  | { status: 'ready'; value: { currency: string; balance: string }[]; bonusWallets: { currency: string; balance: string }[] }
  | { status: 'failed' }

/** Configuration form snapshot exposed by `ctx.configForms.get(id)`. */
export interface ConfigSnapshot {
  status?: string
  value?: unknown
  writable?: boolean
  revision?: number
}

/** Configuration form handle exposed by `ctx.configForms.get(id)`. */
export interface ConfigFormHandle {
  /** Snapshot handed over by `plugins.row.config` (ConfigPageForm mode). */
  state?: ConfigSnapshot
  getSnapshot?: () => ConfigSnapshot
  subscribe?: (listener: () => void) => () => void
  set?: (field: string, value: unknown) => unknown
  mutate?: (operations: ConfigurationOperation[], revision?: number) => unknown
}

/** One settings write operation. */
export interface ConfigurationOperation {
  op: 'set' | 'unset'
  path: (string | number)[]
  value?: unknown
}

export {}