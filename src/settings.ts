/**
 * Plugin configuration defaults, validation and normalization.
 *
 * The host half declares volatile fields with the same defaults; the client
 * reads the live values through `ctx.configForms` so a save takes effect on the
 * next refresh without reloading the plugin.
 */

/** Live configuration used by the row and the settings page. */
export interface BalanceSettings {
  /** Whether the fallback poll runs while the page is visible. */
  pollingEnabled: boolean
  /** Poll interval in milliseconds. */
  pollingIntervalMs: number
  /** CNY total below which the amount turns amber. */
  warnThresholdCny: number
  /** CNY total below which the amount turns red; must stay below the warn threshold. */
  dangerThresholdCny: number
}

/** Poll interval bounds, mirrored by the host schema. */
export const MIN_POLLING_INTERVAL_MS = 15000
/** Poll interval bounds, mirrored by the host schema. */
export const MAX_POLLING_INTERVAL_MS = 600000

/** Defaults matching `cordis.patch.yml` and the host schema. */
export const DEFAULT_SETTINGS: BalanceSettings = {
  pollingEnabled: true,
  pollingIntervalMs: 60000,
  warnThresholdCny: 10,
  dangerThresholdCny: 1,
}

/**
 * Coerce one raw configuration value into the settings shape.
 *
 * Invalid or missing values fall back to the defaults; polling intervals are
 * clamped into the supported range so a hand-written patch cannot disable
 * polling or hammer the Host.
 *
 * @param raw - configuration value read from the form snapshot.
 * @returns a complete, usable configuration.
 */
export function normalizeSettings(raw: unknown): BalanceSettings {
  const source = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const boolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  const number = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const interval = Math.round(
    Math.min(
      MAX_POLLING_INTERVAL_MS,
      Math.max(
        MIN_POLLING_INTERVAL_MS,
        number(source.pollingIntervalMs, DEFAULT_SETTINGS.pollingIntervalMs),
      ),
    ),
  )
  return {
    pollingEnabled: boolean(source.pollingEnabled, DEFAULT_SETTINGS.pollingEnabled),
    pollingIntervalMs: interval,
    warnThresholdCny: number(source.warnThresholdCny, DEFAULT_SETTINGS.warnThresholdCny),
    dangerThresholdCny: number(source.dangerThresholdCny, DEFAULT_SETTINGS.dangerThresholdCny),
  }
}

/**
 * Validate a proposed poll interval.
 *
 * @param value - candidate milliseconds.
 * @returns true when it is an integer inside the supported range.
 */
export function pollingIntervalValid(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_POLLING_INTERVAL_MS && value <= MAX_POLLING_INTERVAL_MS
}
