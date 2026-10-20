/**
 * Retry schedule for the startup read.
 *
 * The plugin activation read is the only read that retries: if it does not
 * produce a ready snapshot (signed out, failed, rejected, timed out) the
 * sequence waits 1 s, then 2 s, then 4 s before asking again, and gives up after
 * three retries. Every other trigger refreshes at most once.
 *
 * The module is pure so the schedule can be unit tested without timers or a
 * browser: callers own the actual `setTimeout`, and ask this object after each
 * completed startup attempt whether another one is due.
 */

/** Delay before each retry, in order. The length is the retry cap. */
export const STARTUP_RETRY_DELAYS_MS = [1000, 2000, 4000] as const

/** Maximum number of startup retries (one per delay). */
export const STARTUP_MAX_RETRIES = STARTUP_RETRY_DELAYS_MS.length

/** One scheduled startup retry. */
export interface StartupRetrySchedule {
  /** Delay from the completed attempt, in milliseconds. */
  delayMs: number
  /** 1-based retry number inside the sequence. */
  attempt: number
}

/**
 * Lifecycle of one startup retry sequence.
 *
 * `begin()` opens a sequence, `afterAttempt()` decides what follows a completed
 * startup read, and `cancel()` ends the sequence early (a ready value from any
 * trigger, a manual refresh, or teardown).
 */
export class StartupRetrySequence {
  private running = false
  private used = 0

  /** Open a fresh sequence, resetting the retry counter. */
  begin(): void {
    this.running = true
    this.used = 0
  }

  /** Whether a sequence is currently open. */
  get active(): boolean {
    return this.running
  }

  /** How many retries have been scheduled in the open sequence. */
  get retriesUsed(): number {
    return this.used
  }

  /**
   * Decide what follows one completed startup attempt.
   *
   * @param ready - whether the attempt produced a ready balance snapshot.
   * @returns the next retry schedule, or `undefined` when the sequence is
   *   inactive, satisfied, or exhausted (both of which close it).
   */
  afterAttempt(ready: boolean): StartupRetrySchedule | undefined {
    if (!this.running) return undefined
    if (ready) {
      this.cancel()
      return undefined
    }
    if (this.used >= STARTUP_MAX_RETRIES) {
      this.cancel()
      return undefined
    }
    const delayMs = STARTUP_RETRY_DELAYS_MS[this.used] as number
    this.used += 1
    return { delayMs, attempt: this.used }
  }

  /** Close the sequence and reset the retry counter. */
  cancel(): void {
    this.running = false
    this.used = 0
  }
}
