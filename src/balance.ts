/**
 * Wallet merging and primary-currency selection for the balance row.
 *
 * A ready account balance response carries recharge wallets (`value`) and
 * bonus wallets (`bonusWallets`). The row shows one amount per currency:
 * recharge + bonus. The tooltip breaks the same numbers down per currency.
 */
import { sumBalanceStrings } from './format'

/** One wallet reported by the account API. */
export interface Wallet {
  /** `CNY` or `USD` (other codes are tolerated and surfaced verbatim). */
  currency: string
  /** Decimal balance string, kept exactly as the Host delivered it. */
  balance: string
}

/** The `ready` branch of the account balance response. */
export interface WalletSet {
  value: Wallet[]
  bonusWallets: Wallet[]
}

/** One currency worth of merged balances. */
export interface CurrencyTotal {
  /** Currency code, e.g. `CNY`. */
  currency: string
  /** Recharge + bonus, as a plain decimal string. */
  total: string
  /** Recharge wallets only. */
  recharge: string
  /** Bonus wallets only. */
  bonus: string
}

/** Display symbol for a currency; the host maps everything that is not CNY to `$`. */
export function currencySymbol(currency: string): string {
  return currency === 'CNY' ? '¥' : '$'
}

/** Whether a value looks like a wallet object. */
function isWallet(value: unknown): value is Wallet {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as { currency?: unknown; balance?: unknown }
  return typeof candidate.currency === 'string' && typeof candidate.balance === 'string'
}

/**
 * Merge recharge and bonus wallets per currency.
 *
 * Currencies are returned with CNY first (so the row shows the CNY total first),
 * then every other currency in first-seen order.
 *
 * @param wallets - the ready balance response, or nothing.
 * @returns one entry per currency; empty when there is nothing to show.
 */
export function mergeWallets(wallets: WalletSet | null | undefined): CurrencyTotal[] {
  if (wallets === null || wallets === undefined) return []
  const recharge = new Map<string, unknown[]>()
  const bonus = new Map<string, unknown[]>()
  const order: string[] = []
  const collect = (list: unknown, bucket: Map<string, unknown[]>): void => {
    if (!Array.isArray(list)) return
    for (const entry of list) {
      const wallet = isWallet(entry) ? entry : undefined
      const currency = wallet === undefined ? undefined : wallet.currency.trim()
      if (wallet === undefined || currency === undefined || currency === '') continue
      if (!recharge.has(currency) && !bonus.has(currency)) order.push(currency)
      const target = bucket.get(currency)
      if (target === undefined) bucket.set(currency, [wallet.balance])
      else target.push(wallet.balance)
    }
  }
  collect(wallets.value, recharge)
  collect(wallets.bonusWallets, bonus)
  const currencies = order.slice()
  const cnyIndex = currencies.indexOf('CNY')
  if (cnyIndex > 0) {
    currencies.splice(cnyIndex, 1)
    currencies.unshift('CNY')
  }
  return currencies.map((currency) => {
    const rechargeList = recharge.get(currency) ?? []
    const bonusList = bonus.get(currency) ?? []
    return {
      currency,
      total: sumBalanceStrings([...rechargeList, ...bonusList]),
      recharge: sumBalanceStrings(rechargeList),
      bonus: sumBalanceStrings(bonusList),
    }
  })
}

/**
 * The currency the row displays: CNY when present, otherwise the first one.
 *
 * @param totals - merged per-currency totals.
 * @returns the primary total, or `undefined` when no wallet exists.
 */
export function primaryCurrency(totals: readonly CurrencyTotal[]): CurrencyTotal | undefined {
  return totals.find((total) => total.currency === 'CNY') ?? totals[0]
}

/** Non-mutating copy used by cache validation. */
export function normalizeWalletSet(wallets: WalletSet | null | undefined): WalletSet | null {
  if (wallets === null || wallets === undefined) return null
  const clean = (list: unknown): Wallet[] => {
    if (!Array.isArray(list)) return []
    const wallets: Wallet[] = []
    for (const entry of list) if (isWallet(entry)) wallets.push({ currency: entry.currency, balance: entry.balance })
    return wallets
  }
  return { value: clean(wallets.value), bonusWallets: clean(wallets.bonusWallets) }
}
