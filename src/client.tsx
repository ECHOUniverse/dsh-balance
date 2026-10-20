/**
 * Browser half of `@local/dsh-balance`.
 *
 * Registers one row at the bottom of the sidebar, directly above the account
 * row (`sidebar.footer.action` precedes `sidebar.settings` in the sidebar
 * footer), and the row's configuration page (`plugins.row.config`).
 *
 * Data comes from `ctx.remote.account.getBalance`; the tooltip's destinations
 * come from `ctx.remote.account.getState().links`. Every trigger is owned by the
 * **plugin lifecycle** (`ctx.effect(() => controller.attach())`), never by the
 * row component, so collapsing the sidebar cannot stop refreshing:
 *
 * - a startup read as soon as the plugin activates, retried at 1 s / 2 s / 4 s
 *   (at most three times) until a ready snapshot arrives;
 * - window focus, throttled to one read per 20 seconds;
 * - every `api-session/status` transition from running to idle;
 * - the fallback poll while polling is enabled and the page is visible;
 * - a click on the row, which always queues a read;
 * - account stream frames, so a sign-in or sign-out refreshes the value.
 *
 * All triggers share one in-flight read plus at most one queued follow-up, and
 * every client read has an 8 second timeout. Only the startup read retries;
 * other failures keep the previous value on screen with a warning marker.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { currencySymbol, mergeWallets, primaryCurrency } from './balance'
import { BalanceController, readConfig } from './controller'
import { NAMESPACE, PACKAGE_NAME, ROW_CONFIG_KEY, ROW_ID, STYLE_ID, TOOLTIP_ID } from './constants'
import { formatAmount } from './format'
import { en, zh } from './locales'
import { createSettingsPage } from './settings-page'
import type { BalanceSettings } from './settings'
import { displayLevel, type ThresholdLevel } from './threshold'
import { absoluteTime, relativeTime } from './time'
import type { ClientContext, Translate } from './types'

/** How often the tooltip's relative time is recomputed while open. */
const RELATIVE_TIME_REFRESH_MS = 30000

/** Styles, injected once per application through `ctx.effect`. */
const CSS =
  '.dshBalanceRow{box-sizing:border-box;display:flex;align-items:center;gap:8px;height:44px;width:100%;min-width:0;flex:1 0 100%;margin:0;padding:6px;border:0;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;cursor:pointer;text-align:left;overflow:hidden}' +
  '.dshBalanceRow:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
  '.dshBalanceRow:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}' +
  '.dshBalanceIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}' +
  '.dshBalanceAmount{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}' +
  '.dshBalanceAmount[data-level="warn"]{color:#f59e0b}' +
  '.dshBalanceAmount[data-level="danger"]{color:#ef4444}' +
  '[data-ds-dark-theme] .dshBalanceAmount[data-level="warn"]{color:#fbbf24}' +
  '[data-ds-dark-theme] .dshBalanceAmount[data-level="danger"]{color:#f87171}' +
  '.dshBalanceMuted{color:var(--dsw-alias-label-tertiary)}' +
  '.dshBalanceDot{flex:none;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.4}' +
  '.dshBalanceWarning{flex:none;font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary)}' +
  'div[class*="footerActions"]{flex-wrap:wrap}' +
  '.dshBalanceTooltip{position:fixed;z-index:1200;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;min-width:200px;max-width:280px;padding:10px 12px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}' +
  '.dshBalanceTooltipSection{display:flex;flex-direction:column;gap:2px}' +
  '.dshBalanceTooltipTitle{font-weight:500;color:var(--dsw-alias-label-primary)}' +
  '.dshBalanceTooltipRow{display:flex;align-items:baseline;justify-content:space-between;gap:16px}' +
  '.dshBalanceTooltipKey{color:var(--dsw-alias-label-secondary)}' +
  '.dshBalanceTooltipValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}' +
  '.dshBalanceTooltipDivider{height:0;border-top:.5px solid var(--dsw-alias-border-l2)}' +
  '.dshBalanceTooltipHint{color:var(--dsw-alias-label-tertiary)}' +
  '.dshBalanceTooltipError{color:var(--dsw-alias-label-tertiary)}' +
  '.dshBalanceTooltipActions{display:flex;gap:8px}' +
  '.dshBalanceTooltipButton{box-sizing:border-box;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}' +
  '.dshBalanceTooltipButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}' +
  '.dshBalanceTooltipButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}' +
  '.dshBalanceTooltipButton:disabled{color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l2);cursor:default}'

/** Inject the row stylesheet once; returns its removal cleanup. */
function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const selector = 'style[data-plugin-css="' + STYLE_ID + '"]'
  if (document.querySelector(selector) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = PACKAGE_NAME
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}

/** Observe the live configuration so threshold/interval edits apply immediately. */
function useSettings(ctx: ClientContext): BalanceSettings {
  const read = useCallback(() => readConfig(ctx), [ctx])
  const [settings, setSettings] = useState<BalanceSettings>(read)
  useEffect(() => {
    setSettings(read())
    let dispose: (() => void) | undefined
    try {
      const form = ctx.configForms.get(ROW_ID)
      const subscription = form?.subscribe?.(() => setSettings(read()))
      if (typeof subscription === 'function') dispose = subscription
    } catch {
      dispose = undefined
    }
    return () => {
      if (dispose !== undefined) {
        try {
          dispose()
        } catch {
          /* the form is gone with the plugin */
        }
      }
    }
  }, [ctx, read])
  return settings
}

/** Inline coin/wallet glyph used at 16px. */
function BalanceIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.9" y="3.4" width="9.8" height="9.2" rx="1.7" />
      <path d="M11.7 5.8h1.4a.9.9 0 0 1 .9.9v2.6a.9.9 0 0 1-.9.9h-1.4a2.2 2.2 0 0 1 0-4.4Z" />
      <path d="M13.15 8h.02" />
    </svg>
  )
}

/** Build the sidebar row component bound to one controller. */
function createBalanceRow(
  controller: BalanceController,
  ctx: ClientContext,
): (props: { wide?: boolean; t?: Translate }) => JSX.Element | null {
  return function BalanceRow(props: { wide?: boolean; t?: Translate }): JSX.Element | null {
    const t: Translate = typeof props.t === 'function' ? props.t : (key: string) => key
    const wide = props.wide !== false
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
    const settings = useSettings(ctx)
    const totals = useMemo(() => mergeWallets(snapshot.wallets), [snapshot.wallets])
    const primary = primaryCurrency(totals)
    const level: ThresholdLevel =
      primary !== undefined
        ? displayLevel(primary.currency, primary.total, {
            warn: settings.warnThresholdCny,
            danger: settings.dangerThresholdCny,
          })
        : 'normal'
    const [rowHovered, setRowHovered] = useState(false)
    const [rowFocused, setRowFocused] = useState(false)
    const [tooltipHovered, setTooltipHovered] = useState(false)
    const [tooltipFocused, setTooltipFocused] = useState(false)
    const [position, setPosition] = useState<{ left: number; top: number } | undefined>(undefined)
    const [now, setNow] = useState<number>(() => Date.now())
    const buttonRef = useRef<HTMLButtonElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const open = rowHovered || tooltipHovered || rowFocused || tooltipFocused

    useEffect(() => {
      if (!wide) {
        setRowHovered(false)
        setRowFocused(false)
        setTooltipHovered(false)
        setTooltipFocused(false)
      }
    }, [wide])

    useEffect(() => {
      if (!open) return
      setNow(Date.now())
      const timer = setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS)
      return () => clearInterval(timer)
    }, [open])

    useEffect(() => {
      if (!open) return
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return
        setRowHovered(false)
        setRowFocused(false)
        setTooltipHovered(false)
        setTooltipFocused(false)
        try {
          buttonRef.current?.focus()
        } catch {
          /* focus is best effort */
        }
      }
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }, [open])

    useLayoutEffect(() => {
      if (!open) {
        setPosition(undefined)
        return
      }
      const place = (): void => {
        const row = buttonRef.current
        const tooltip = tooltipRef.current
        if (row === null || tooltip === null) return
        const rect = row.getBoundingClientRect()
        const height = tooltip.offsetHeight
        const width = tooltip.offsetWidth
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
        const above = rect.top - height - 8
        const top = above >= 8 ? above : Math.min(window.innerHeight - height - 8, rect.bottom + 8)
        setPosition({ left, top })
      }
      place()
      window.addEventListener('resize', place)
      window.addEventListener('scroll', place, true)
      return () => {
        window.removeEventListener('resize', place)
        window.removeEventListener('scroll', place, true)
      }
    }, [open, snapshot.wallets, snapshot.fetchedAt, snapshot.error, snapshot.signedOut, totals])

    // Bail out after every hook has run, so collapsing the sidebar never
    // changes the hook order.
    if (!wide) return null

    const missingValue = snapshot.wallets === null
    let text: string
    if (!missingValue && primary !== undefined) {
      text = formatAmount(primary.total, currencySymbol(primary.currency))
    } else if (snapshot.signedOut) {
      text = t('row.signedOut')
    } else if (!missingValue) {
      // A ready response without any wallet row: nothing to total, nothing to colour.
      text = '—'
    } else if (snapshot.error !== null) {
      text = '—'
    } else {
      text = t('row.loading')
    }
    const muted = missingValue
    const showDot = snapshot.refreshing && snapshot.initialized
    const showWarning = snapshot.error !== null && !missingValue

    const relativeParts = snapshot.fetchedAt === null ? undefined : relativeTime(snapshot.fetchedAt, now)
    const relativeText = relativeParts === undefined ? '' : t(relativeParts.key, relativeParts.params)
    const absoluteText = snapshot.fetchedAt === null ? '' : absoluteTime(snapshot.fetchedAt)
    const errorText =
      snapshot.error === null
        ? ''
        : snapshot.error === 'failed'
          ? t('tooltip.failed')
          : snapshot.error === 'timeout'
            ? t('tooltip.timeout')
            : snapshot.error

    const openExternal = (url: string | undefined): void => {
      if (url === undefined || url === '') return
      try {
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        /* popup blocking is not an error worth surfacing here */
      }
    }

    const tooltip =
      open && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={TOOLTIP_ID}
              ref={tooltipRef}
              role="dialog"
              aria-label={t('tooltip.label')}
              className="dshBalanceTooltip"
              style={{ left: position?.left ?? 8, top: position?.top ?? -9999 }}
              onMouseEnter={() => setTooltipHovered(true)}
              onMouseLeave={() => setTooltipHovered(false)}
              onFocus={() => setTooltipFocused(true)}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null
                if (next !== null && (tooltipRef.current?.contains(next) === true || buttonRef.current?.contains(next) === true)) {
                  return
                }
                setTooltipFocused(false)
              }}
            >
              {snapshot.wallets === null ? (
                <div className="dshBalanceTooltipHint">
                  {snapshot.signedOut ? t('tooltip.signedOut') : snapshot.error !== null ? t('tooltip.error', { message: errorText }) : t('tooltip.loading')}
                </div>
              ) : (
                <>
                  {totals.length === 0 ? (
                    <div className="dshBalanceTooltipHint">{t('tooltip.never')}</div>
                  ) : (
                    totals.map((total, index) => (
                      <div className="dshBalanceTooltipSection" key={total.currency}>
                        {index > 0 ? <div className="dshBalanceTooltipDivider" /> : null}
                        <div className="dshBalanceTooltipTitle">{total.currency}</div>
                        <div className="dshBalanceTooltipRow">
                          <span className="dshBalanceTooltipKey">{t('tooltip.total')}</span>
                          <span className="dshBalanceTooltipValue">
                            {formatAmount(total.total, currencySymbol(total.currency))}
                          </span>
                        </div>
                        <div className="dshBalanceTooltipRow">
                          <span className="dshBalanceTooltipKey">{t('tooltip.recharge')}</span>
                          <span className="dshBalanceTooltipValue">
                            {formatAmount(total.recharge, currencySymbol(total.currency))}
                          </span>
                        </div>
                        <div className="dshBalanceTooltipRow">
                          <span className="dshBalanceTooltipKey">{t('tooltip.bonus')}</span>
                          <span className="dshBalanceTooltipValue">
                            {formatAmount(total.bonus, currencySymbol(total.currency))}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="dshBalanceTooltipDivider" />
                  {snapshot.error === null ? null : (
                    <div className="dshBalanceTooltipError">
                      {t('tooltip.error', { message: errorText })}
                    </div>
                  )}
                  <div className="dshBalanceTooltipRow">
                    <span className="dshBalanceTooltipKey" title={absoluteText === '' ? undefined : absoluteText}>
                      {snapshot.fetchedAt === null
                        ? t('tooltip.never')
                        : t('tooltip.updated', { time: relativeText })}
                    </span>
                  </div>
                </>
              )}
              <div className="dshBalanceTooltipDivider" />
              <div className="dshBalanceTooltipActions">
                <button
                  type="button"
                  className="dshBalanceTooltipButton"
                  disabled={snapshot.links.usageUrl === undefined}
                  onClick={() => openExternal(snapshot.links.usageUrl)}
                >
                  {t('tooltip.usage')}
                </button>
                <button
                  type="button"
                  className="dshBalanceTooltipButton"
                  disabled={snapshot.links.topUpUrl === undefined}
                  onClick={() => openExternal(snapshot.links.topUpUrl)}
                >
                  {t('tooltip.topUp')}
                </button>
              </div>
              <div className="dshBalanceTooltipHint">{t('tooltip.hint')}</div>
            </div>,
            document.body,
          )
        : null

    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          className="dshBalanceRow"
          aria-label={t('row.label') + '：' + text}
          aria-describedby={open ? TOOLTIP_ID : undefined}
          onClick={() => controller.refreshNow()}
          onMouseEnter={() => setRowHovered(true)}
          onMouseLeave={() => setRowHovered(false)}
          onFocus={() => setRowFocused(true)}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null
            if (next !== null && tooltipRef.current?.contains(next) === true) return
            setRowFocused(false)
          }}
        >
          <span className="dshBalanceIcon">
            <BalanceIcon />
          </span>
          <span className={muted ? 'dshBalanceAmount dshBalanceMuted' : 'dshBalanceAmount'} data-level={level}>
            {text}
          </span>
          {showDot ? <span className="dshBalanceDot" aria-hidden="true" /> : null}
          {showWarning ? (
            <span className="dshBalanceWarning" aria-hidden="true">
              ⚠
            </span>
          ) : null}
        </button>
        {tooltip}
      </>
    )
  }
}

/** Services required before the bundle can render. */
export const inject = ['slots', 'locale', 'remote', 'remote.account', 'configForms'] as const

/**
 * Mount the browser half: dictionaries, styles, the controller, the sidebar row
 * and the row's configuration page.
 *
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const translate = ctx.locale.bind(NAMESPACE)
  ctx.effect(() => ctx.locale.register(NAMESPACE, { zh: { ...zh }, en: { ...en } }), 'balance: dictionaries')
  ctx.effect(() => installStyles(), 'balance: styles')

  const controller = new BalanceController(ctx)
  ctx.effect(() => () => controller.dispose(), 'balance: controller')
  // Triggers belong to the plugin, not the row: a collapsed sidebar unmounts the
  // row but polling, focus refresh and turn-end refresh must keep running.
  ctx.effect(() => controller.attach(), 'balance: triggers')

  const BalanceRow = createBalanceRow(controller, ctx)
  const SettingsPage = createSettingsPage(ctx, translate)

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          { name: 'sidebar.footer.action', id: ROW_ID, order: 100, locale: NAMESPACE },
          BalanceRow,
        ),
      ),
    'balance: sidebar row',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NAMESPACE,
            inject: () => {
              let fallbackForm: unknown
              try {
                fallbackForm = ctx.configForms.get(ROW_ID)
              } catch {
                fallbackForm = undefined
              }
              return { fallbackForm }
            },
          },
          SettingsPage,
        ),
      ),
    'balance: settings page',
  )
}