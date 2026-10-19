/**
 * Durable balance cache.
 *
 * The row renders the cached numbers immediately on a cold start and refreshes
 * in the background, so the sidebar never flashes an empty placeholder while a
 * request is in flight. Entries never expire on their own: the relative
 * timestamp tells the user how fresh they are.
 */
import type { WalletSet } from './balance'

/** localStorage key holding the cached wallet snapshot. */
export const CACHE_KEY = '@local/dsh-balance/cache/v1'

/** One cached wallet snapshot. */
export interface BalanceCacheEntry {
  wallets: WalletSet
  /** Epoch milliseconds of the request that produced the values. */
  fetchedAt: number
}

/** The slice of the Storage API the cache needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage when the renderer exposes it, otherwise nothing. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    const storage = globalThis.localStorage
    if (storage === undefined || storage === null) return undefined
    if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return undefined
    return storage
  } catch {
    return undefined
  }
}

/**
 * Read and validate the cached snapshot.
 *
 * Any malformed entry is treated as absent; a broken cache must never break the
 * sidebar.
 *
 * @param storage - storage backend, or nothing when unavailable.
 * @param key - cache key, overridable for tests.
 * @returns the cached entry, or `undefined`.
 */
export function readCache(
  storage: KeyValueStorage | undefined,
  key: string = CACHE_KEY,
): BalanceCacheEntry | undefined {
  if (storage === undefined) return undefined
  let text: string | null
  try {
    text = storage.getItem(key)
  } catch {
    return undefined
  }
  if (text === null || text.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const candidate = parsed as { wallets?: unknown; fetchedAt?: unknown }
  const fetchedAt = candidate.fetchedAt
  const wallets = candidate.wallets
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return undefined
  if (wallets === null || wallets === undefined || typeof wallets !== 'object') return undefined
  const walletSet = wallets as { value?: unknown; bonusWallets?: unknown }
  if (!Array.isArray(walletSet.value) || !Array.isArray(walletSet.bonusWallets)) return undefined
  const clean = (list: unknown[]): { currency: string; balance: string }[] => {
    const wallets: { currency: string; balance: string }[] = []
    for (const entry of list) {
      if (entry === null || typeof entry !== 'object') continue
      const wallet = entry as { currency?: unknown; balance?: unknown }
      if (typeof wallet.currency !== 'string' || typeof wallet.balance !== 'string') continue
      wallets.push({ currency: wallet.currency, balance: wallet.balance })
    }
    return wallets
  }
  return {
    wallets: { value: clean(walletSet.value), bonusWallets: clean(walletSet.bonusWallets) },
    fetchedAt,
  }
}

/**
 * Persist one snapshot, ignoring storage failures (quota, privacy mode).
 *
 * @param storage - storage backend, or nothing.
 * @param entry - snapshot to persist.
 * @param key - cache key, overridable for tests.
 * @returns true when the write succeeded.
 */
export function writeCache(
  storage: KeyValueStorage | undefined,
  entry: BalanceCacheEntry,
  key: string = CACHE_KEY,
): boolean {
  if (storage === undefined) return false
  try {
    storage.setItem(key, JSON.stringify({ wallets: entry.wallets, fetchedAt: entry.fetchedAt }))
    return true
  } catch {
    return false
  }
}
