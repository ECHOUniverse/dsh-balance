import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from '../src/time'

describe('relativeTime', () => {
  const now = 1_700_000_000_000

  it('describes recent timestamps', () => {
    expect(relativeTime(now - 2_000, now)).toEqual({ key: 'time.justNow', params: {} })
    expect(relativeTime(now - 30_000, now)).toEqual({ key: 'time.seconds', params: { n: 30 } })
    expect(relativeTime(now - 3 * 60_000, now)).toEqual({ key: 'time.minutes', params: { n: 3 } })
    expect(relativeTime(now - 5 * 3_600_000, now)).toEqual({ key: 'time.hours', params: { n: 5 } })
    expect(relativeTime(now - 2 * 86_400_000, now)).toEqual({ key: 'time.days', params: { n: 2 } })
  })

  it('clamps future timestamps to just now', () => {
    expect(relativeTime(now + 60_000, now)).toEqual({ key: 'time.justNow', params: {} })
  })
})

describe('absoluteTime', () => {
  it('renders a local date-time and tolerates invalid input', () => {
    expect(absoluteTime(1_700_000_000_000)).not.toBe('')
    expect(absoluteTime(Number.NaN)).toBe('')
    expect(absoluteTime(0)).toBe('')
  })
})