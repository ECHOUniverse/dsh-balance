/**
 * Host half of `@local/dsh-balance`.
 *
 * The Host half owns nothing but the persistent configuration schema: every
 * field is `.volatile()`, so the Settings form rewrites it in place and the
 * browser half reads the live values through `ctx.configForms` without
 * reloading the plugin. Balance reading and rendering happen entirely in the
 * client half (`lib/client.js`).
 *
 * `@deepseek-ai/schemastery` is supplied by the Harness installation: the
 * profile runtime resolves installation packages for every profile plugin, so
 * this bundle declares it as a peer dependency instead of shipping a copy.
 *
 * @module @local/dsh-balance
 */

import z from '@deepseek-ai/schemastery'

/** Row id inside a profile composition; the client UI and config form key off it. */
export const name = 'balance'

/** No Host services are required: the Host half only declares configuration. */
export const inject = []

/**
 * Live plugin configuration. Every field is a volatile top-level scalar because
 * the settings form only addresses top-level paths and a save must take effect
 * without a reload.
 *
 * `dangerThresholdCny` must stay below `warnThresholdCny`; that cross-field
 * rule is enforced by the row's configuration page, since schemastery validates
 * one field at a time.
 */
export const Config = z
  .object({
    /** Whether the fallback poll runs while the page is visible. */
    pollingEnabled: z.boolean().default(true).volatile(),
    /** Poll interval in milliseconds. */
    pollingIntervalMs: z.number().step(1).min(15000).max(600000).default(60000).volatile(),
    /** CNY total below which the amount turns amber. */
    warnThresholdCny: z.number().default(10).volatile(),
    /** CNY total below which the amount turns red; must stay below the warn threshold. */
    dangerThresholdCny: z.number().default(1).volatile(),
  })

/**
 * Mount the Host half. Rendering, polling and caching live in the browser half,
 * so there is nothing to start here.
 */
export function apply() {}
