/**
 * Decimal parsing/formatting for account balances.
 *
 * The host account UI (`@deepseek-ai/dsh-client-ui-settings-account`) formats
 * balances with big.js:
 *
 *   if (value.eq(0)) return symbol + "0.00"
 *   if (value.lt(0)) return "-" + symbol + (value.gt(-0.01) ? "0.01" : addCommas(abs.toFixed(2)))
 *   if (value.lt("0.01")) return "<" + symbol + "0.01"
 *   return symbol + addCommas(value.round(2, roundDown).toFixed(2))
 *
 * This module reproduces that output with plain decimal arithmetic (BigInt
 * scaled integers) so it is exact, dependency free and unit-testable. Invalid
 * input never throws: the raw value is returned unchanged.
 */

/** An exact decimal: `coefficient / 10^scale`, with an always non-negative scale. */
export interface DecimalValue {
  /** Signed integer coefficient. */
  coefficient: bigint
  /** Decimal places, never negative. */
  scale: number
}

/** big.js accepts this shape of string (and nothing else) in the host UI. */
const NUMERIC = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i

/** Refuse absurd exponents instead of materializing gigantic integers. */
const MAX_SCALE = 2000

/** The zero constant. */
export const DECIMAL_ZERO: DecimalValue = { coefficient: 0n, scale: 0 }

/**
 * Parse a decimal string exactly, the way big.js does.
 *
 * @param input - candidate value; only strings are accepted.
 * @returns the exact decimal, or `undefined` when the input is not numeric.
 */
export function parseDecimal(input: unknown): DecimalValue | undefined {
  if (typeof input !== 'string' || input.length === 0) return undefined
  if (!NUMERIC.test(input)) return undefined
  let text = input
  let sign = 1n
  if (text.startsWith('-')) {
    sign = -1n
    text = text.slice(1)
  }
  let exponent = 0
  const exponentIndex = text.search(/e/i)
  if (exponentIndex >= 0) {
    exponent = Number.parseInt(text.slice(exponentIndex + 1), 10)
    text = text.slice(0, exponentIndex)
  }
  const dotIndex = text.indexOf('.')
  let digits: string
  let scale: number
  if (dotIndex >= 0) {
    const fraction = text.slice(dotIndex + 1)
    digits = text.slice(0, dotIndex) + fraction
    scale = fraction.length - exponent
  } else {
    digits = text
    scale = -exponent
  }
  if (!Number.isFinite(scale) || Math.abs(scale) > MAX_SCALE) return undefined
  digits = digits.replace(/^0+(?=\d)/, '')
  if (digits === '') return undefined
  let coefficient: bigint
  try {
    coefficient = BigInt(digits) * sign
  } catch {
    return undefined
  }
  if (coefficient === 0n) return DECIMAL_ZERO
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale)
    scale = 0
  }
  return { coefficient, scale }
}

/** Strip trailing zeros from the coefficient while the value stays exact. */
function normalize(value: DecimalValue): DecimalValue {
  let { coefficient, scale } = value
  if (coefficient === 0n) return DECIMAL_ZERO
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n
    scale -= 1
  }
  return { coefficient, scale }
}

/**
 * Render an exact decimal as a plain string (no grouping, no rounding).
 *
 * @param value - exact decimal.
 * @returns e.g. `-12.3`.
 */
export function decimalToString(value: DecimalValue): string {
  const normalized = normalize(value)
  const negative = normalized.coefficient < 0n
  const magnitude = negative ? -normalized.coefficient : normalized.coefficient
  let digits = magnitude.toString()
  if (normalized.scale === 0) return (negative ? '-' : '') + digits
  digits = digits.padStart(normalized.scale + 1, '0')
  const split = digits.length - normalized.scale
  return (negative ? '-' : '') + digits.slice(0, split) + '.' + digits.slice(split)
}

/**
 * Convert an exact decimal to a JavaScript number, for threshold comparisons.
 *
 * @param value - exact decimal.
 * @returns the closest double.
 */
export function decimalToNumber(value: DecimalValue): number {
  return Number(decimalToString(value))
}

/** Absolute value of an exact decimal. */
function absolute(value: DecimalValue): DecimalValue {
  return value.coefficient < 0n
    ? { coefficient: -value.coefficient, scale: value.scale }
    : value
}

/** Compare two magnitudes (signs ignored). */
function compareMagnitude(a: DecimalValue, b: DecimalValue): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale)
  const left = a.coefficient * 10n ** BigInt(scale - a.scale)
  const right = b.coefficient * 10n ** BigInt(scale - b.scale)
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Compare two exact decimals numerically.
 *
 * @param a - left value.
 * @param b - right value.
 * @returns `-1`, `0` or `1`.
 */
export function compareDecimal(a: DecimalValue, b: DecimalValue): -1 | 0 | 1 {
  const signA = a.coefficient === 0n ? 0 : a.coefficient < 0n ? -1 : 1
  const signB = b.coefficient === 0n ? 0 : b.coefficient < 0n ? -1 : 1
  if (signA !== signB) return signA < signB ? -1 : 1
  if (signA === 0) return 0
  const magnitude = compareMagnitude(absolute(a), absolute(b))
  return signA > 0 ? magnitude : (magnitude === 0 ? 0 : magnitude === 1 ? -1 : 1)
}

/** Whether an exact decimal is zero. */
export function isZero(value: DecimalValue): boolean {
  return value.coefficient === 0n
}

/**
 * Render a magnitude with a fixed number of decimal places.
 *
 * @param value - magnitude (sign ignored).
 * @param places - decimal places to keep.
 * @param mode - `down` truncates toward zero, `half-up` rounds halves away from zero.
 * @returns e.g. `1234.56`.
 */
function fixedDigits(value: DecimalValue, places: number, mode: 'down' | 'half-up'): string {
  const magnitude = absolute(value)
  const divisorBase = 10n
  let units: bigint
  const divisor =
    magnitude.scale > places ? divisorBase ** BigInt(magnitude.scale - places) : 1n
  if (divisor === 1n) {
    units = magnitude.coefficient * divisorBase ** BigInt(places - magnitude.scale)
  } else {
    units = magnitude.coefficient / divisor
    if (mode === 'half-up' && (magnitude.coefficient % divisor) * 2n >= divisor) units += 1n
  }
  const factor = divisorBase ** BigInt(places)
  const integer = units / factor
  const fraction = units % factor
  if (places === 0) return integer.toString()
  return integer.toString() + '.' + fraction.toString().padStart(places, '0')
}

/**
 * Insert thousands separators into a fixed-point number string.
 *
 * @param fixed - number string without grouping.
 * @returns e.g. `1,234.56`.
 */
export function withThousandsSeparators(fixed: string): string {
  const dotIndex = fixed.indexOf('.')
  const integer = dotIndex >= 0 ? fixed.slice(0, dotIndex) : fixed
  const fraction = dotIndex >= 0 ? fixed.slice(dotIndex) : ''
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return grouped + fraction
}

/**
 * Format one balance exactly like the host account UI.
 *
 * @param amount - raw balance string from the wallet response.
 * @param symbol - currency symbol (`¥` or `$`).
 * @returns the display string; invalid input is returned unchanged.
 */
export function formatAmount(amount: unknown, symbol: string): string {
  const raw =
    typeof amount === 'string' ? amount : amount === null || amount === undefined ? '' : String(amount)
  const value = parseDecimal(amount)
  if (value === undefined) return raw
  if (isZero(value)) return symbol + '0.00'
  const magnitude = absolute(value)
  const belowCent = compareMagnitude(magnitude, { coefficient: 1n, scale: 2 }) < 0
  if (value.coefficient < 0n) {
    if (belowCent) return '-' + symbol + '0.01'
    return '-' + symbol + withThousandsSeparators(fixedDigits(magnitude, 2, 'half-up'))
  }
  if (belowCent) return '<' + symbol + '0.01'
  return symbol + withThousandsSeparators(fixedDigits(magnitude, 2, 'down'))
}

/**
 * Sum exact decimals without losing precision.
 *
 * @param values - exact decimals.
 * @returns the exact sum.
 */
export function addDecimalValues(values: readonly DecimalValue[]): DecimalValue {
  if (values.length === 0) return DECIMAL_ZERO
  let scale = 0
  for (const value of values) if (value.scale > scale) scale = value.scale
  let coefficient = 0n
  for (const value of values) coefficient += value.coefficient * 10n ** BigInt(scale - value.scale)
  return normalize({ coefficient, scale })
}

/**
 * Sum a list of raw balance strings.
 *
 * Numeric entries are summed exactly. Non-numeric entries are ignored when at
 * least one numeric entry exists; when nothing is numeric the first raw string
 * is surfaced unchanged so the UI can show a broken value instead of crashing.
 *
 * @param balances - raw wallet balances.
 * @returns the total as a plain decimal string.
 */
export function sumBalanceStrings(balances: readonly unknown[]): string {
  const parsed: DecimalValue[] = []
  let fallback = ''
  for (const balance of balances) {
    const value = parseDecimal(balance)
    if (value !== undefined) {
      parsed.push(value)
      continue
    }
    if (fallback === '') fallback = typeof balance === 'string' ? balance : balance == null ? '' : String(balance)
  }
  if (parsed.length === 0) return balances.length > 0 && fallback !== '' ? fallback : '0'
  return decimalToString(addDecimalValues(parsed))
}
