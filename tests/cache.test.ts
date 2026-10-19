import { describe, expect, it } from 'vitest'
import { CACHE_KEY, readCache, writeCache, type KeyValueStorage } from '../src/cache'

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

const entry = {
  wallets: { value: [{ currency: 'CNY', balance: '12.5' }], bonusWallets: [{ currency: 'CNY', balance: '0.5' }] },
  fetchedAt: 1700000000000,
}

describe('balance cache', () => {
  it('round-trips a snapshot', () => {
    const storage = memoryStorage()
    expect(writeCache(storage, entry)).toBe(true)
    expect(storage.data[CACHE_KEY]).toBeDefined()
    expect(readCache(storage)).toEqual(entry)
  })

  it('uses the documented key', () => {
    const storage = memoryStorage()
    writeCache(storage, entry)
    expect(Object.keys(storage.data)).toEqual([CACHE_KEY])
    expect(CACHE_KEY).toBe('@local/dsh-balance/cache/v1')
  })

  it('treats a broken or foreign entry as absent', () => {
    expect(readCache(memoryStorage({ [CACHE_KEY]: '{not json' }))).toBeUndefined()
    expect(readCache(memoryStorage({ [CACHE_KEY]: JSON.stringify({ wallets: entry.wallets }) }))).toBeUndefined()
    expect(readCache(memoryStorage({ [CACHE_KEY]: JSON.stringify({ fetchedAt: 1, wallets: { value: [] } }) }))).toBeUndefined()
    expect(readCache(memoryStorage({ [CACHE_KEY]: JSON.stringify({ fetchedAt: 1, wallets: { value: [], bonusWallets: [] }, extra: true }) }))).toBeDefined()
    expect(readCache(memoryStorage())).toBeUndefined()
    expect(readCache(undefined)).toBeUndefined()
  })

  it('drops malformed wallets but keeps valid ones', () => {
    const storage = memoryStorage({
      [CACHE_KEY]: JSON.stringify({
        fetchedAt: 1,
        wallets: { value: [{ currency: 'CNY', balance: '1' }, { currency: 1, balance: 2 }], bonusWallets: [] },
      }),
    })
    expect(readCache(storage)?.wallets.value).toEqual([{ currency: 'CNY', balance: '1' }])
  })

  it('ignores storage failures', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readCache(throwing)).toBeUndefined()
    expect(writeCache(throwing, entry)).toBe(false)
  })
})
