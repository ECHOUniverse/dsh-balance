/**
 * Offline behaviour test for the built client bundle.
 *
 * The browser artifact must (1) register a lazy factory through
 * `window.__ModuleLoader__.load`, (2) materialize with only the platform module
 * table available, (3) mount against a Cordis-like context and start its
 * triggers from the plugin lifecycle, and (4) render both the sidebar row and
 * the configuration page without a DOM.
 *
 * The assertions below are the regression fence for the "balance never
 * refreshed after startup" bug: removing `ctx.effect(() => controller.attach())`
 * from `apply()` drops `getBalance` calls to zero and unregisters the focus
 * listener, so this script fails instead of passing silently.
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

/** Wait for the bundle's promise chains to settle (real timers are used here). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Event-target stub that tracks registered listeners per type. */
function createEventTarget(extra = {}) {
  const listeners = new Map()
  return {
    ...extra,
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

/** Timers the bundle scheduled and has not cleared yet. */
const activeTimers = new Set()
const realSetTimeout = setTimeout
const realClearTimeout = clearTimeout

const cache = new Map()
const windowStub = createEventTarget()
let entry
windowStub.__ModuleLoader__ = {
  load(value) {
    entry = value
  },
}
const documentStub = createEventTarget({ visibilityState: 'visible' })
documentStub.querySelector = () => null
documentStub.createElement = () => ({ dataset: {}, textContent: '', remove() {} })
documentStub.head = { appendChild() {} }

const sandbox = {
  window: windowStub,
  document: documentStub,
  console,
  setTimeout(fn, ms) {
    const id = realSetTimeout(() => {
      activeTimers.delete(id)
      fn()
    }, ms)
    activeTimers.add(id)
    return id
  },
  clearTimeout(id) {
    activeTimers.delete(id)
    realClearTimeout(id)
  },
  setInterval,
  clearInterval,
  localStorage: {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      cache.set(key, value)
    },
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
 * strings asserted below mirrors the runtime Chinese dictionaries in
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

const config = {
  status: 'ready',
  value: { pollingEnabled: true, pollingIntervalMs: 60000, warnThresholdCny: 10, dangerThresholdCny: 1 },
  writable: true,
  revision: 3,
}

/** One apply() mount, with its own effect cleanups and Remote counters. */
function createContext() {
  const counters = { balance: 0, state: 0 }
  const cleanups = []
  const registrations = new Map()
  const ctx = {
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') cleanups.push(dispose)
      return () => {}
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
      $on: () => () => {},
      $stream() {
        return {
          async *[Symbol.asyncIterator]() {},
          dispose: async () => {},
        }
      },
      account: {
        async getState() {
          counters.state += 1
          return {
            ok: true,
            value: {
              status: 'credential-stored',
              links: { usageUrl: 'https://example.com/usage', topUpUrl: 'https://example.com/top_up' },
            },
          }
        },
        async getBalance() {
          counters.balance += 1
          return {
            ok: true,
            value: {
              status: 'ready',
              value: [{ currency: 'CNY', balance: '12.345' }],
              bonusWallets: [{ currency: 'CNY', balance: '0.005' }],
            },
          }
        },
        async *watch() {},
      },
    },
  }
  return { ctx, counters, cleanups, registrations }
}

/** Run every lifecycle cleanup registered by one apply(), newest first. */
function runCleanups(harness) {
  while (harness.cleanups.length > 0) {
    const dispose = harness.cleanups.pop()
    dispose()
  }
}

// ---------------------------------------------------------------------------
// First mount: the startup refresh must fire exactly once from apply().
// ---------------------------------------------------------------------------
const first = createContext()
mod.apply(first.ctx)
assert.ok(first.registrations.has('sidebar.footer.action'), 'row must register into sidebar.footer.action')
assert.ok(first.registrations.has('plugins.row.config'), 'settings page must register into plugins.row.config')

await flush()
assert.equal(first.counters.balance, 1, 'plugin activation must issue exactly one balance read')
assert.equal(windowStub.listenerCount('focus'), 1, 'activation must register the focus trigger')
assert.equal(documentStub.listenerCount('visibilitychange'), 1, 'activation must register the visibility trigger')
assert.equal(activeTimers.size, 1, 'activation must schedule exactly the fallback poll')
assert.equal(cache.get('@local/dsh-balance/cache/v1') !== undefined, true, 'a ready read must be cached')

// The row can unmount (collapsed sidebar) without stopping triggers: the
// controller is owned by the plugin, so no row-level cleanup exists.
runCleanups(first)
assert.equal(windowStub.listenerCount('focus'), 0, 'dispose must remove the focus trigger')
assert.equal(documentStub.listenerCount('visibilitychange'), 0, 'dispose must remove the visibility trigger')
assert.equal(activeTimers.size, 0, 'dispose must clear every pending timer')

// ---------------------------------------------------------------------------
// Second mount: the cached snapshot renders immediately and startup reads once.
// ---------------------------------------------------------------------------
const second = createContext()
cache.set(
  '@local/dsh-balance/cache/v1',
  JSON.stringify({
    wallets: { value: [{ currency: 'CNY', balance: '12.345' }], bonusWallets: [{ currency: 'CNY', balance: '0.005' }] },
    fetchedAt: Date.now(),
  }),
)
mod.apply(second.ctx)
await flush()
assert.equal(second.counters.balance, 1, 'every activation must issue exactly one startup read')
assert.equal(second.counters.state >= 1, true, 'activation must also read the account links')

const rowRegistration = second.registrations.get('sidebar.footer.action')
assert.equal(rowRegistration.options.id, 'balance')
assert.equal(rowRegistration.options.order, 100)
assert.equal(rowRegistration.options.locale, 'balance')

const row = rowRegistration.component
const rowHtml = renderToStaticMarkup(React.createElement(row, { wide: true, t }))
assert.ok(rowHtml.includes('¥12.35'), 'cached total must render: ' + rowHtml)
assert.ok(rowHtml.includes('aria-label="DeepSeek 账户余额'), 'row must expose an accessible label: ' + rowHtml)
assert.equal(renderToStaticMarkup(React.createElement(row, { wide: false, t })), '', 'collapsed sidebar must hide the row')

const settingsRegistration = second.registrations.get('plugins.row.config')
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

runCleanups(second)
assert.equal(activeTimers.size, 0, 'the second mount must clear its timers on dispose')

const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8')
assert.ok(icon.includes('viewBox="0 0 64 64"'), 'icon must declare a viewBox')
assert.ok(icon.includes('stroke="#4d6bfe"'), 'icon must be a line drawing')
assert.ok(Buffer.byteLength(icon) <= 256 * 1024, 'icon must stay under 256 KiB')

console.log('smoke-client: activation issues exactly one balance read and registers the focus/visibility triggers')
console.log('smoke-client: dispose removes listeners and clears timers')
console.log('smoke-client: bundle registered, mounted, and rendered both surfaces')
