/**
 * Warning/danger classification for the CNY total.
 *
 * Only CNY is classified: USD balances have no configured thresholds, so they
 * always render in the default label color.
 */
import { decimalToNumber, parseDecimal } from './format'

/** Visual level of the amount text. */
export type ThresholdLevel = 'normal' | 'warn' | 'danger'

/** Thresholds read from the plugin configuration. */
export interface Thresholds {
  warn: number
  danger: number
}

/** Fallbacks matching the host schema defaults. */
export const DEFAULT_THRESHOLDS: Thresholds = { warn: 10, danger: 1 }

/**
 * Classify a CNY total.
 *
 * `danger` wins below the danger limit, `warn` applies below the warn limit,
 * and everything else is `normal`. Non-numeric totals are `normal` so an
 * unreadable value never masquerades as an exhausted balance.
 *
 * @param total - CNY total as a decimal string, or `null` when there is no CNY wallet.
 * @param thresholds - configured limits.
 * @returns the visual level.
 */
export function thresholdLevel(total: string | null | undefined, thresholds: Thresholds): ThresholdLevel {
  if (total === null || total === undefined) return 'normal'
  const parsed = parseDecimal(total)
  if (parsed === undefined) return 'normal'
  const value = decimalToNumber(parsed)
  if (!Number.isFinite(value)) return 'normal'
  const danger = Number.isFinite(thresholds.danger) ? thresholds.danger : DEFAULT_THRESHOLDS.danger
  const warn = Number.isFinite(thresholds.warn) ? thresholds.warn : DEFAULT_THRESHOLDS.warn
  if (value < danger) return 'danger'
  if (value < warn) return 'warn'
  return 'normal'
}

/**
 * Classify one currency total for display.
 *
 * Only CNY is classified: a USD balance always renders in the default color
 * because the thresholds are denominated in CNY.
 *
 * @param currency - currency code of the amount shown on the row.
 * @param total - that currency's total as a decimal string.
 * @param thresholds - configured limits.
 * @returns the visual level.
 */
export function displayLevel(currency: string, total: string, thresholds: Thresholds): ThresholdLevel {
  if (currency !== 'CNY') return 'normal'
  return thresholdLevel(total, thresholds)
}

/**
 * Whether a pair of thresholds is acceptable: danger must stay below warn.
 *
 * @param warn - warn threshold.
 * @param danger - danger threshold.
 * @returns true when both are finite numbers and danger < warn.
 */
export function thresholdsValid(warn: number, danger: number): boolean {
  return Number.isFinite(warn) && Number.isFinite(danger) && danger < warn
}