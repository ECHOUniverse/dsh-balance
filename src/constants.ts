/**
 * Identities and timings shared by the client entry, the controller and the
 * injected stylesheet. Kept in one place so the slot ids, cache key namespace and
 * request metadata cannot drift apart.
 */

/** Package identity; also the lazy factory id in the browser module table. */
export const PACKAGE_NAME = '@local/dsh-balance'
/** Row id inside the profile composition; the config namespace is keyed by it. */
export const ROW_ID = 'balance'
/** Locale namespace owned by this bundle. */
export const NAMESPACE = 'balance'
/** Row configuration slot key: `<package>#<row id>`. */
export const ROW_CONFIG_KEY = PACKAGE_NAME + '#' + ROW_ID
/** Client version sent with account requests; matches the DSH desktop build. */
export const CLIENT_VERSION = '0.2.1-rc.2'
/** Client-side read timeout. */
export const REQUEST_TIMEOUT_MS = 8000
/** Focus-triggered reads are skipped inside this window. */
export const FOCUS_THROTTLE_MS = 20000
/** Style tag identity for the injected sheet. */
export const STYLE_ID = PACKAGE_NAME + '/balance.css'
/** Tooltip element id, referenced by `aria-describedby`. */
export const TOOLTIP_ID = 'dsh-balance-tooltip'
