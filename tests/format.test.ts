import { describe, expect, it } from 'vitest'
import {
  addDecimalValues,
  compareDecimal,
  decimalToString,
  formatAmount,
  parseDecimal,
  sumBalanceStrings,
  withThousandsSeparators,
} from '../src/format'

describe('formatAmount', () => {
  it('formats zero like the host', () => {
    expect(formatAmount('0', '¥')).toBe('¥0.00')
    expect(formatAmount('0.00', '¥')).toBe('¥0.00')
    expect(formatAmount('-0', '¥')).toBe('¥0.00')
  })

  it('keeps two decimals for plain amounts', () => {
    expect(formatAmount('110.00', '¥')).toBe('¥110.00')
    expect(formatAmount('110', '¥')).toBe('¥110.00')
    expect(formatAmount('-12.3', '¥')).toBe('-¥12.30')
  })

  it('groups thousands', () => {
    expect(formatAmount('1234.567', '¥')).toBe('¥1,234.56')
    expect(formatAmount('1234567.891', '¥')).toBe('¥1,234,567.89')
  })

  it('rounds positive amounts down to the cent', () => {
    expect(formatAmount('1.999', '¥')).toBe('¥1.99')
    expect(formatAmount('0.019', '¥')).toBe('¥0.01')
  })

  it('shows sub-cent positive amounts as <¥0.01', () => {
    expect(formatAmount('0.001', '¥')).toBe('<¥0.01')
    expect(formatAmount('0.009', '¥')).toBe('<¥0.01')
    expect(formatAmount('0.005', '¥')).toBe('<¥0.01')
  })

  it('shows tiny negative amounts as -¥0.01', () => {
    expect(formatAmount('-0.001', '¥')).toBe('-¥0.01')
    expect(formatAmount('-0.005', '¥')).toBe('-¥0.01')
  })

  it('rounds negative magnitudes half up', () => {
    // big.js: abs(-0.015).toFixed(2) === "0.02"
    expect(formatAmount('-0.015', '¥')).toBe('-¥0.02')
    expect(formatAmount('-1234.567', '¥')).toBe('-¥1,234.57')
  })

  it('uses the provided currency symbol', () => {
    expect(formatAmount('12.3', '$')).toBe('$12.30')
  })

  it('returns invalid input unchanged instead of throwing', () => {
    expect(formatAmount('abc', '¥')).toBe('abc')
    expect(formatAmount('', '¥')).toBe('')
    expect(formatAmount(undefined, '¥')).toBe('')
    expect(formatAmount(null, '¥')).toBe('')
    expect(formatAmount(' 1 ', '¥')).toBe(' 1 ')
    expect(formatAmount('1.2.3', '¥')).toBe('1.2.3')
    expect(formatAmount(NaN, '¥')).toBe('NaN')
  })

  it('accepts exponent notation like big.js', () => {
    expect(formatAmount('1e3', '¥')).toBe('¥1,000.00')
    expect(formatAmount('1.5E2', '¥')).toBe('¥150.00')
  })
})

describe('decimal helpers', () => {
  it('parses and renders exact decimals', () => {
    expect(decimalToString(parseDecimal('12.30')!)).toBe('12.3')
    expect(decimalToString(parseDecimal('-0.0100')!)).toBe('-0.01')
    expect(decimalToString(parseDecimal('.5')!)).toBe('0.5')
    expect(decimalToString(parseDecimal('5.')!)).toBe('5')
    expect(parseDecimal('abc')).toBeUndefined()
    expect(parseDecimal('')).toBeUndefined()
  })

  it('adds without floating point drift', () => {
    const sum = addDecimalValues([parseDecimal('0.1')!, parseDecimal('0.2')!])
    expect(decimalToString(sum)).toBe('0.3')
    const total = addDecimalValues([parseDecimal('1.005')!, parseDecimal('2.005')!])
    expect(decimalToString(total)).toBe('3.01')
  })

  it('compares exactly', () => {
    expect(compareDecimal(parseDecimal('0.1')!, parseDecimal('0.10')!)).toBe(0)
    expect(compareDecimal(parseDecimal('0.1')!, parseDecimal('0.2')!)).toBe(-1)
    expect(compareDecimal(parseDecimal('-0.2')!, parseDecimal('-0.1')!)).toBe(-1)
    expect(compareDecimal(parseDecimal('-1')!, parseDecimal('1')!)).toBe(-1)
    expect(compareDecimal(parseDecimal('0')!, parseDecimal('-0')!)).toBe(0)
  })

  it('sums raw balance strings with a raw fallback', () => {
    expect(sumBalanceStrings(['10', '2.50'])).toBe('12.5')
    expect(sumBalanceStrings(['abc', '10'])).toBe('10')
    expect(sumBalanceStrings(['abc'])).toBe('abc')
    expect(sumBalanceStrings([])).toBe('0')
    expect(sumBalanceStrings([null, undefined])).toBe('0')
  })

  it('groups thousands without touching the fraction', () => {
    expect(withThousandsSeparators('1234.56')).toBe('1,234.56')
    expect(withThousandsSeparators('123')).toBe('123')
    expect(withThousandsSeparators('1234567.89')).toBe('1,234,567.89')
    expect(withThousandsSeparators('0.01')).toBe('0.01')
  })
})
