/**
 * Offline smoke test for the built client bundle.
 *
 * The browser artifact must (1) register a lazy factory through
 * `window.__ModuleLoader__.load`, (2) materialize with only the platform module
 * table available, (3) mount against a Cordis-like context, and (4) render both
 * the sidebar row and the configuration page without a DOM. This script runs
 * `lib/client.js` in a Node VM with real React and asserts those four points,
 * so a build-time regression fails here instead of in the app.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(source.startsWith('window.__ModuleLoader__.load('), 'bundle must open with the module loader call')

let entry
const cache = new Map()
const sandbox = {
  window: { __ModuleLoader__: { load: (value) => { entry = value } } },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  localStorage: {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => { cache.set(key, value) },
  },
}
vm.runInNewContext(source, sandbox, { filename: 'lib/client.js' })

assert.equal(entry?.id, '@local/dsh-balance')
assert.equal(typeof entry.factory, 'function')

const requireTable = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': ReactDOM,
}
const mod = entry.factory((specifier) => {
  if (!(specifier in requireTable)) throw new Error('unexpected platform require: ' + specifier)
  return requireTable[specifier]
})
assert.deepEqual([...mod.inject], ['slots', 'locale', 'remote', 'remote.account', 'configForms'])

/**
 * Minimal locale translate with {placeholder} interpolation. The handful of
 * strings asserted below mirror the runtime Chinese dictionaries in
 * src/locales.ts; unknown keys fall back to the key so structural assertions
 * still work.
 */
const DICTIONARY = {
  'row.label': 'DeepSeek 账户余额',
  'settings.polling': '后台轮询',
  'settings.interval': '轮询间隔',
  'settings.warn': '警戒阈值',
  'settings.danger': '危险阈值',
  'settings.summary': '每 {seconds} 秒刷新 · 警戒 ¥{warn} · 危险 ¥{danger}',
  'settings.summaryOff': '自动刷新已关闭 · 警戒 ¥{warn} · 危险 ¥{danger}',
}
const t = (key, params = {}) =>
  String(DICTIONARY[key] ?? key).replace(/\{(\w+)\}/g, (_, name) =>
    params[name] === undefined ? '{' + name + '}' : String(params[name]),
  )

const registrations = new Map()
const config = {
  status: 'ready',
  value: { pollingEnabled: true, pollingIntervalMs: 60000, warnThresholdCny: 10, dangerThresholdCny: 1 },
  writable: true,
  revision: 3,
}
const ctx = {
  effect(callback) {
    const cleanup = callback()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  locale: {
    register: () => () => {},
    bind: () => t,
    getSnapshot: () => ({ active: 'zh-CN', revision: 1 }),
  },
  slots: {
    inject(slot, callback) {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register(options, component) {
      registrations.set(options.name, { options, component })
      return () => {}
    },
  },
  configForms: {
    get: () => ({
      getSnapshot: () => config,
      subscribe: () => () => {},
      set: () => true,
      mutate: () => true,
    }),
  },
  remote: {
    $on() {
      return () => {}
    },
    $stream() {
      return {
        async *[Symbol.asyncIterator]() {},
        dispose: async () => {},
      }
    },
    account: {
      async getState() {
        return { ok: true, value: { status: 'credential-stored', links: { usageUrl: 'https://example.com/usage', topUpUrl: 'https://example.com/top_up' } } }
      },
      async getBalance() {
        return { ok: true, value: { status: 'ready', value: [{ currency: 'CNY', balance: '12.345' }], bonusWallets: [{ currency: 'CNY', balance: '0.005' }] } }
      },
      async *watch() {},
    },
  },
}

mod.apply(ctx)
assert.ok(registrations.has('sidebar.footer.action'), 'row must register into sidebar.footer.action')
assert.ok(registrations.has('plugins.row.config'), 'settings page must register into plugins.row.config')

const rowRegistration = registrations.get('sidebar.footer.action')
assert.equal(rowRegistration.options.id, 'balance')
assert.equal(rowRegistration.options.order, 100)
assert.equal(rowRegistration.options.locale, 'balance')

// Cold start renders the cached snapshot before any request runs.
cache.set(
  '@local/dsh-balance/cache/v1',
  JSON.stringify({
    wallets: { value: [{ currency: 'CNY', balance: '12.345' }], bonusWallets: [{ currency: 'CNY', balance: '0.005' }] },
    fetchedAt: Date.now(),
  }),
)
// Re-mount with the cache present: a fresh controller reads it in the constructor.
registrations.clear()
mod.apply(ctx)
const row = registrations.get('sidebar.footer.action').component
const rowHtml = renderToStaticMarkup(React.createElement(row, { wide: true, t }))
assert.ok(rowHtml.includes('¥12.35'), 'cached total must render: ' + rowHtml)
assert.ok(rowHtml.includes('aria-label="DeepSeek 账户余额'), 'row must expose an accessible label: ' + rowHtml)
assert.equal(renderToStaticMarkup(React.createElement(row, { wide: false, t })), '', 'collapsed sidebar must hide the row')

const settingsRegistration = registrations.get('plugins.row.config')
assert.equal(settingsRegistration.options.key, '@local/dsh-balance#balance')
const settings = settingsRegistration.component
const pageHtml = renderToStaticMarkup(
  React.createElement(settings, {
    view: 'page',
    t,
    form: { state: config, mutate: () => true },
  }),
)
for (const needle of ['后台轮询', '轮询间隔', '警戒阈值', '危险阈值', '60000', '10', '1']) {
  assert.ok(pageHtml.includes(needle), 'settings page must render ' + needle)
}
const summaryHtml = renderToStaticMarkup(
  React.createElement(settings, { view: 'summary', t, form: { state: config, mutate: () => true } }),
)
assert.ok(summaryHtml.includes('每 60 秒刷新'), 'summary must describe the interval: ' + summaryHtml)

const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8')
assert.ok(icon.includes('viewBox="0 0 64 64"'), 'icon must declare a viewBox')
assert.ok(icon.includes('stroke="#4d6bfe"'), 'icon must be a line drawing')
assert.ok(Buffer.byteLength(icon) <= 256 * 1024, 'icon must stay under 256 KiB')

console.log('smoke-client: bundle registered, mounted, and rendered both surfaces')
console.log('smoke-client: cache key, module id, slot ids, configuration page and summary verified')