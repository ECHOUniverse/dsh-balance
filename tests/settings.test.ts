import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MAX_POLLING_INTERVAL_MS,
  MIN_POLLING_INTERVAL_MS,
  normalizeSettings,
  pollingIntervalValid,
} from '../src/settings'

describe('normalizeSettings', () => {
  it('falls back to defaults for anything unusable', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ pollingEnabled: 'yes', pollingIntervalMs: Number.NaN })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values', () => {
    expect(
      normalizeSettings({
        pollingEnabled: false,
        pollingIntervalMs: 15000,
        warnThresholdCny: 20,
        dangerThresholdCny: 2,
      }),
    ).toEqual({ pollingEnabled: false, pollingIntervalMs: 15000, warnThresholdCny: 20, dangerThresholdCny: 2 })
  })

  it('clamps the poll interval into the supported range', () => {
    expect(normalizeSettings({ pollingIntervalMs: 1 }).pollingIntervalMs).toBe(MIN_POLLING_INTERVAL_MS)
    expect(normalizeSettings({ pollingIntervalMs: 9999999 }).pollingIntervalMs).toBe(MAX_POLLING_INTERVAL_MS)
    expect(normalizeSettings({ pollingIntervalMs: 60000.4 }).pollingIntervalMs).toBe(60000)
  })
})

describe('pollingIntervalValid', () => {
  it('accepts only integers inside the range', () => {
    expect(pollingIntervalValid(15000)).toBe(true)
    expect(pollingIntervalValid(600000)).toBe(true)
    expect(pollingIntervalValid(60001)).toBe(true)
    expect(pollingIntervalValid(14999)).toBe(false)
    expect(pollingIntervalValid(600001)).toBe(false)
    expect(pollingIntervalValid(60000.5)).toBe(false)
    expect(pollingIntervalValid(Number.NaN)).toBe(false)
  })
})
