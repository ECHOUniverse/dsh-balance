/**
 * The row's configuration page, registered into `plugins.row.config` under the
 * key `@local/dsh-balance#balance`.
 *
 * The plugin manager hands the page its `ConfigPageForm` (`{ state, mutate }`);
 * the full `ctx.configForms` handle is captured as a fallback for embedding
 * sites that do not. Both contracts are read defensively: a form that is not
 * served yet renders a loading note instead of throwing out of the slot.
 */
import { useCallback, useEffect, useState } from 'react'
import type { BalanceKey } from './locales'
import {
  DEFAULT_SETTINGS,
  MAX_POLLING_INTERVAL_MS,
  MIN_POLLING_INTERVAL_MS,
  normalizeSettings,
  pollingIntervalValid,
  type BalanceSettings,
} from './settings'
import { thresholdsValid } from './threshold'
import type {
  ClientContext,
  ConfigFormHandle,
  ConfigSnapshot,
  ConfigurationOperation,
  Translate,
} from './types'

/** Props handed to a `plugins.row.config` entry by the plugin manager. */
interface SettingsPageProps {
  /** `page` renders the form, `summary` renders the one-line row description. */
  view?: 'page' | 'summary'
  /** The plugin manager's config page form. */
  form?: ConfigFormHandle
  /** The full config form captured when the bundle mounted. */
  fallbackForm?: ConfigFormHandle
  /** Locale translate function injected by the slot owner. */
  t?: Translate
}

/** Settings fields the page edits. */
type NumberField = 'pollingIntervalMs' | 'warnThresholdCny' | 'dangerThresholdCny'

/** Identity translate used only when no locale seat is available. */
const identity: Translate = (key) => key

/** Inline styles shared by the page rows; colors come from Host theme tokens. */
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    lineHeight: '20px',
  },
  note: { color: 'var(--dsw-alias-label-tertiary)' },
  section: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  sectionTitle: {
    margin: '0 0 4px',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '22px',
    color: 'var(--dsw-alias-label-primary)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '10px 0',
    borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
  },
  rowMain: { display: 'flex', flexDirection: 'column' as const, gap: '2px', minWidth: '0' },
  label: { fontWeight: 500 },
  hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
  control: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: '2px' },
  error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', lineHeight: '18px' },
  input: {
    boxSizing: 'border-box' as const,
    width: '132px',
    height: '30px',
    border: '0.5px solid var(--dsw-alias-border-l4)',
    borderRadius: 'var(--dsw-radius-md)',
    background: 'var(--dsw-alias-bg-layer-3)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '13px',
    padding: '0 8px',
  },
}

/** Whether a value is a non-null object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/** Read a form snapshot without throwing. */
function readSnapshot(form: ConfigFormHandle | undefined): ConfigSnapshot | undefined {
  if (form === undefined || form === null) return undefined
  if (isObject(form.state)) return form.state
  try {
    return typeof form.getSnapshot === 'function' ? form.getSnapshot() : undefined
  } catch {
    return undefined
  }
}

/** Observe a store-shaped form; state-shaped forms re-render from their owner. */
function useStoreSnapshot(form: ConfigFormHandle | undefined): ConfigSnapshot | undefined {
  const read = useCallback(() => readSnapshot(form), [form])
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | undefined>(read)
  useEffect(() => {
    setSnapshot(read())
    let dispose: (() => void) | undefined
    try {
      const subscription = form?.subscribe?.(() => setSnapshot(read()))
      if (typeof subscription === 'function') dispose = subscription
    } catch {
      dispose = undefined
    }
    return () => {
      if (dispose !== undefined) {
        try {
          dispose()
        } catch {
          /* the form is already gone */
        }
      }
    }
  }, [form, read])
  if (form === undefined) return undefined
  return snapshot ?? read()
}

/** Normalize a write settlement into a boolean. */
function settleWrite(value: unknown): Promise<boolean> | boolean {
  if (value !== null && typeof value === 'object' && typeof (value as Promise<unknown>).then === 'function') {
    return (value as Promise<unknown>).then(
      (accepted) => {
        if (typeof accepted === 'boolean') return accepted
        if (isObject(accepted) && accepted.ok !== undefined) return accepted.ok !== false
        return true
      },
      () => false,
    )
  }
  return value !== false
}

/** Write one field through whichever form contract is available. */
function writeField(
  form: ConfigFormHandle | undefined,
  fallback: ConfigFormHandle | undefined,
  field: string,
  value: unknown,
): Promise<boolean> | boolean {
  const target = form ?? fallback
  if (target === undefined || target === null) return false
  try {
    if (typeof target.mutate === 'function') {
      const operations: ConfigurationOperation[] = [{ op: 'set', path: [field], value }]
      return settleWrite(target.mutate(operations))
    }
    if (typeof target.set === 'function') return settleWrite(target.set(field, value))
  } catch {
    return false
  }
  return false
}

/** A labelled switch matching the Host settings look. */
function SwitchRow(props: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}): JSX.Element {
  return (
    <div style={styles.row}>
      <div style={styles.rowMain}>
        <span style={styles.label}>{props.label}</span>
        <span style={styles.hint}>{props.hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        style={{
          position: 'relative',
          flex: 'none',
          width: '34px',
          height: '20px',
          padding: 0,
          border: 'none',
          borderRadius: '10px',
          cursor: props.disabled ? 'default' : 'pointer',
          opacity: props.disabled ? 0.5 : 1,
          background: props.checked
            ? 'var(--dsw-alias-state-business-primary)'
            : 'var(--dsw-alias-border-l4)',
          transition: 'background .15s',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '2px',
            left: props.checked ? '16px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: 'var(--dsw-alias-label-primary-foreground)',
            transition: 'left .15s',
          }}
        />
      </button>
    </div>
  )
}

/**
 * Build the row configuration page component.
 *
 * @param _ctx - Client context (kept for parity with the row factory).
 * @param translate - namespace-bound translate function used when the slot does
 *   not inject `t`.
 * @returns the page component.
 */
export function createSettingsPage(
  _ctx: ClientContext,
  translate: Translate,
): (props: SettingsPageProps) => JSX.Element {
  return function BalanceSettingsPage(props: SettingsPageProps): JSX.Element {
    const t = typeof props.t === 'function' ? props.t : translate
    const form = props.form
    const fallback = props.fallbackForm
    const stateMode =
      form !== undefined && form !== null && isObject(form.state) && typeof form.mutate === 'function'
    const storeSnapshot = useStoreSnapshot(stateMode ? undefined : form ?? fallback)
    const snapshot = stateMode ? form.state : storeSnapshot

    const [pending, setPending] = useState<Record<string, unknown>>({})
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [errors, setErrors] = useState<Record<string, string | undefined>>({})

    const rawValue = snapshot?.value
    const base = normalizeSettings(isObject(rawValue) ? { ...rawValue, ...pending } : { ...DEFAULT_SETTINGS, ...pending })

    // Drop optimistic overrides once the served document agrees with them.
    useEffect(() => {
      if (!isObject(rawValue)) return
      setPending((current) => {
        const keys = Object.keys(current)
        if (keys.length === 0) return current
        const next = { ...current }
        let changed = false
        for (const key of keys) {
          if (rawValue[key] === next[key]) {
            delete next[key]
            changed = true
          }
        }
        return changed ? next : current
      })
    }, [rawValue])

    if (props.view === 'summary') {
      const seconds = Math.round(base.pollingIntervalMs / 1000)
      const summary = base.pollingEnabled
        ? t('settings.summary', { seconds, warn: base.warnThresholdCny, danger: base.dangerThresholdCny })
        : t('settings.summaryOff', { warn: base.warnThresholdCny, danger: base.dangerThresholdCny })
      return <span>{summary}</span>
    }

    if (snapshot === undefined || snapshot?.status === 'loading') {
      return <div style={styles.note}>{t('settings.loading')}</div>
    }
    if (snapshot?.status === 'unavailable') {
      return <div style={styles.note}>{t('settings.unavailable')}</div>
    }

    const disabled = snapshot?.writable === false
    const owner = stateMode ? form : form ?? fallback

    /**
     * Persist one field and keep the optimistic override until it settles.
     *
     * @param field - configuration path segment.
     * @param value - new value.
     * @param onRejected - optional draft rollback hook.
     */
    const commit = (field: string, value: unknown, onRejected?: () => void): void => {
      setPending((current) => ({ ...current, [field]: value }))
      setErrors((current) => ({ ...current, [field]: undefined }))
      let settlement: Promise<boolean> | boolean
      try {
        settlement = writeField(owner, fallback, field, value)
      } catch {
        settlement = false
      }
      const drop = (): void => {
        setPending((current) => {
          const next = { ...current }
          delete next[field]
          return next
        })
        setErrors((current) => ({ ...current, [field]: t('settings.saveFailed') }))
        onRejected?.()
      }
      if (typeof settlement === 'boolean') {
        if (!settlement) drop()
        return
      }
      void settlement.then((ok) => {
        if (!ok) drop()
        else {
          setDrafts((current) => {
            if (current[field] === undefined) return current
            const next = { ...current }
            delete next[field]
            return next
          })
        }
      }, drop)
    }

    const commitBoolean = (field: 'pollingEnabled', value: boolean): void => {
      commit(field, value)
    }

    /**
     * Parse and persist one numeric field.
     *
     * @param field - numeric configuration field.
     * @param text - draft text from the input.
     * @param values - current effective values used for cross-field checks.
     */
    const commitNumber = (field: NumberField, text: string, values: BalanceSettings): void => {
      const trimmed = text.trim()
      const parsed = Number(trimmed)
      if (trimmed === '' || !Number.isFinite(parsed)) {
        setErrors((current) => ({ ...current, [field]: t('settings.invalidNumber') }))
        return
      }
      if (field === 'pollingIntervalMs') {
        const rounded = Math.round(parsed)
        if (!pollingIntervalValid(rounded)) {
          setErrors((current) => ({
            ...current,
            [field]: t('settings.invalidRange', { min: MIN_POLLING_INTERVAL_MS, max: MAX_POLLING_INTERVAL_MS }),
          }))
          return
        }
        commit(field, rounded)
        return
      }
      const nextWarn = field === 'warnThresholdCny' ? parsed : values.warnThresholdCny
      const nextDanger = field === 'dangerThresholdCny' ? parsed : values.dangerThresholdCny
      if (!thresholdsValid(nextWarn, nextDanger)) {
        setErrors((current) => ({ ...current, [field]: t('settings.invalidOrder') }))
        return
      }
      commit(field, parsed)
    }

    /** Render one numeric row. */
    const numberRow = (props2: {
      field: NumberField
      label: string
      hint: string
      values: BalanceSettings
    }): JSX.Element => {
      const { field, label, hint, values } = props2
      const served = values[field]
      const draft = drafts[field]
      const error = errors[field]
      return (
        <div style={styles.row} key={field}>
          <div style={styles.rowMain}>
            <span style={styles.label}>{label}</span>
            <span style={styles.hint}>{hint}</span>
            {error === undefined ? null : <span style={styles.error}>{error}</span>}
          </div>
          <div style={styles.control}>
            <input
              type="number"
              inputMode="numeric"
              style={disabled ? { ...styles.input, opacity: 0.6 } : styles.input}
              aria-label={label}
              aria-invalid={error === undefined ? undefined : true}
              disabled={disabled}
              value={draft === undefined ? String(served) : draft}
              onChange={(event) => {
                const next = event.currentTarget.value
                setDrafts((current) => ({ ...current, [field]: next }))
              }}
              onBlur={(event) => {
                const next = event.currentTarget.value
                if (next === String(served)) {
                  setDrafts((current) => {
                    const copy = { ...current }
                    delete copy[field]
                    return copy
                  })
                  setErrors((current) => ({ ...current, [field]: undefined }))
                  return
                }
                commitNumber(field, next, values)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>
        </div>
      )
    }

    const rows: JSX.Element[] = [
      <SwitchRow
        key="pollingEnabled"
        label={t('settings.polling')}
        hint={t('settings.pollingHint')}
        checked={base.pollingEnabled}
        disabled={disabled}
        onChange={(next) => commitBoolean('pollingEnabled', next)}
      />,
      numberRow({ field: 'pollingIntervalMs', label: t('settings.interval'), hint: t('settings.intervalHint'), values: base }),
      numberRow({ field: 'warnThresholdCny', label: t('settings.warn'), hint: t('settings.warnHint'), values: base }),
      numberRow({ field: 'dangerThresholdCny', label: t('settings.danger'), hint: t('settings.dangerHint'), values: base }),
    ]

    const children: JSX.Element[] = []
    if (disabled) children.push(<div key="readonly" style={styles.note}>{t('settings.readOnly')}</div>)
    children.push(
      <section key="refresh" style={styles.section}>
        <h4 style={styles.sectionTitle}>{t('settings.groupRefresh')}</h4>
        {rows[0]}
        {rows[1]}
      </section>,
      <section key="thresholds" style={styles.section}>
        <h4 style={styles.sectionTitle}>{t('settings.groupThreshold')}</h4>
        {rows[2]}
        {rows[3]}
      </section>,
    )

    return <div style={styles.root}>{children}</div>
  }
}