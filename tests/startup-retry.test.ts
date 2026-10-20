import { describe, expect, it } from 'vitest'
import {
  STARTUP_MAX_RETRIES,
  STARTUP_RETRY_DELAYS_MS,
  StartupRetrySequence,
} from '../src/startup-retry'

describe('STARTUP_RETRY_DELAYS_MS', () => {
  it('waits 1s, 2s, then 4s', () => {
    expect([...STARTUP_RETRY_DELAYS_MS]).toEqual([1000, 2000, 4000])
    expect(STARTUP_MAX_RETRIES).toBe(3)
  })
})

describe('StartupRetrySequence', () => {
  it('schedules 1s, 2s and 4s while attempts keep failing, then gives up', () => {
    const sequence = new StartupRetrySequence()
    sequence.begin()
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 1000, attempt: 1 })
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 2000, attempt: 2 })
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 4000, attempt: 3 })
    expect(sequence.afterAttempt(false)).toBeUndefined()
    expect(sequence.active).toBe(false)
    expect(sequence.retriesUsed).toBe(0)
  })

  it('stops scheduling after a ready attempt', () => {
    const sequence = new StartupRetrySequence()
    sequence.begin()
    expect(sequence.afterAttempt(true)).toBeUndefined()
    expect(sequence.active).toBe(false)
    expect(sequence.afterAttempt(false)).toBeUndefined()
  })

  it('cancels the remaining retries once a later attempt is ready', () => {
    const sequence = new StartupRetrySequence()
    sequence.begin()
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 1000, attempt: 1 })
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 2000, attempt: 2 })
    expect(sequence.afterAttempt(true)).toBeUndefined()
    expect(sequence.active).toBe(false)
    expect(sequence.afterAttempt(false)).toBeUndefined()
  })

  it('never schedules without an open sequence', () => {
    const sequence = new StartupRetrySequence()
    expect(sequence.afterAttempt(false)).toBeUndefined()
    expect(sequence.active).toBe(false)
  })

  it('restarts the counter when a new sequence begins', () => {
    const sequence = new StartupRetrySequence()
    sequence.begin()
    sequence.afterAttempt(false)
    sequence.afterAttempt(false)
    expect(sequence.retriesUsed).toBe(2)
    sequence.begin()
    expect(sequence.retriesUsed).toBe(0)
    expect(sequence.afterAttempt(false)).toEqual({ delayMs: 1000, attempt: 1 })
  })

  it('cancel() closes the sequence and resets the counter', () => {
    const sequence = new StartupRetrySequence()
    sequence.begin()
    sequence.afterAttempt(false)
    sequence.cancel()
    expect(sequence.active).toBe(false)
    expect(sequence.retriesUsed).toBe(0)
    expect(sequence.afterAttempt(false)).toBeUndefined()
  })
})
