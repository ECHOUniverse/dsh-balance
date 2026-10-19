import { describe, expect, it } from 'vitest'
import { displayLevel, thresholdLevel, thresholdsValid } from '../src/threshold'

const thresholds = { warn: 10, danger: 1 }

describe('thresholdLevel', () => {
  it('marks totals below the warn threshold amber', () => {
    expect(thresholdLevel('9.99', thresholds)).toBe('warn')
    expect(thresholdLevel('5', thresholds)).toBe('warn')
    expect(thresholdLevel('1', thresholds)).toBe('warn')
  })

  it('marks totals below the danger threshold red', () => {
    expect(thresholdLevel('0.99', thresholds)).toBe('danger')
    expect(thresholdLevel('0', thresholds)).toBe('danger')
    expect(thresholdLevel('-3', thresholds)).toBe('danger')
  })

  it('leaves totals at or above the warn threshold unstyled', () => {
    expect(thresholdLevel('10', thresholds)).toBe('normal')
    expect(thresholdLevel('10.0001', thresholds)).toBe('normal')
    expect(thresholdLevel('1234.56', thresholds)).toBe('normal')
  })

  it('does not colour missing or unreadable totals', () => {
    expect(thresholdLevel(null, thresholds)).toBe('normal')
    expect(thresholdLevel(undefined, thresholds)).toBe('normal')
    expect(thresholdLevel('abc', thresholds)).toBe('normal')
  })
})

describe('displayLevel', () => {
  it('classifies CNY only', () => {
    expect(displayLevel('CNY', '0.5', thresholds)).toBe('danger')
    expect(displayLevel('CNY', '9.99', thresholds)).toBe('warn')
  })

  it('never classifies USD', () => {
    expect(displayLevel('USD', '0.5', thresholds)).toBe('normal')
    expect(displayLevel('USD', '-1', thresholds)).toBe('normal')
    expect(displayLevel('USD', '99999', thresholds)).toBe('normal')
  })
})

describe('thresholdsValid', () => {
  it('requires danger below warn', () => {
    expect(thresholdsValid(10, 1)).toBe(true)
    expect(thresholdsValid(1, 1)).toBe(false)
    expect(thresholdsValid(1, 10)).toBe(false)
    expect(thresholdsValid(Number.NaN, 1)).toBe(false)
    expect(thresholdsValid(10, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
