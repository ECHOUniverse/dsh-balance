/**
 * Relative-time descriptions for the tooltip's last-update line.
 *
 * Pure: the component supplies the locale translate function, so this module
 * stays testable without a browser.
 */

/** A translated relative-time phrase. */
export interface RelativeTime {
  /** Locale dictionary key. */
  key: string
  /** Interpolation parameters (may be empty). */
  params: Record<string, number>
}

/**
 * Describe how long ago a timestamp was.
 *
 * @param timestamp - epoch milliseconds.
 * @param now - current epoch milliseconds.
 * @returns the locale key and its parameters.
 */
export function relativeTime(timestamp: number, now: number): RelativeTime {
  const elapsed = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 10) return { key: 'time.justNow', params: {} }
  if (seconds < 60) return { key: 'time.seconds', params: { n: seconds } }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return { key: 'time.minutes', params: { n: minutes } }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'time.hours', params: { n: hours } }
  return { key: 'time.days', params: { n: Math.floor(hours / 24) } }
}

/**
 * Absolute local timestamp for the tooltip's `title` attribute.
 *
 * @param timestamp - epoch milliseconds.
 * @returns a localized date-time string, or an empty string for invalid input.
 */
export function absoluteTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return new Date(timestamp).toISOString()
  }
}
