import { describe, expect, it } from 'vitest'
import { currencySymbol, mergeWallets, primaryCurrency } from '../src/balance'

describe('mergeWallets', () => {
  it('merges recharge and bonus balances per currency', () => {
    const totals = mergeWallets({
      value: [
        { currency: 'CNY', balance: '10.00' },
        { currency: 'USD', balance: '5.00' },
      ],
      bonusWallets: [{ currency: 'CNY', balance: '2.5' }],
    })
    expect(totals).toEqual([
      { currency: 'CNY', total: '12.5', recharge: '10', bonus: '2.5' },
      { currency: 'USD', total: '5', recharge: '5', bonus: '0' },
    ])
  })

  it('puts CNY first even when another currency appears first', () => {
    const totals = mergeWallets({
      value: [
        { currency: 'USD', balance: '1' },
        { currency: 'CNY', balance: '2' },
      ],
      bonusWallets: [],
    })
    expect(totals.map((total) => total.currency)).toEqual(['CNY', 'USD'])
    expect(primaryCurrency(totals)?.currency).toBe('CNY')
  })

  it('falls back to the first currency when CNY is absent', () => {
    const totals = mergeWallets({ value: [{ currency: 'USD', balance: '3' }], bonusWallets: [] })
    expect(primaryCurrency(totals)?.currency).toBe('USD')
    expect(primaryCurrency(totals)?.total).toBe('3')
  })

  it('returns nothing for empty, null or missing responses', () => {
    expect(mergeWallets(null)).toEqual([])
    expect(mergeWallets(undefined)).toEqual([])
    expect(mergeWallets({ value: [], bonusWallets: [] })).toEqual([])
    expect(primaryCurrency([])).toBeUndefined()
  })

  it('ignores malformed wallets instead of throwing', () => {
    const totals = mergeWallets({
      value: [
        { currency: 'CNY', balance: '1' },
        // @ts-expect-error malformed entries must be tolerated at runtime
        { currency: 42, balance: 'x' },
        // @ts-expect-error malformed entries must be tolerated at runtime
        { currency: 'CNY' },
        null,
      ],
      bonusWallets: [],
    })
    expect(totals).toEqual([{ currency: 'CNY', total: '1', recharge: '1', bonus: '0' }])
  })

  it('sorts bonus-only currencies into the list too', () => {
    const totals = mergeWallets({
      value: [{ currency: 'CNY', balance: '1' }],
      bonusWallets: [{ currency: 'CNY', balance: '0.5' }, { currency: 'USD', balance: '2' }],
    })
    expect(totals.map((total) => total.currency)).toEqual(['CNY', 'USD'])
    expect(totals[0]?.total).toBe('1.5')
  })

  it('maps currency codes to display symbols', () => {
    expect(currencySymbol('CNY')).toBe('¥')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('$')
  })
})
