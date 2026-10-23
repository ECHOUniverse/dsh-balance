# DeepSeek Balance for DeepSeek Harness

**Show your DeepSeek account balance right above the account row in the DSH sidebar.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-4d6bfe)](./package.json)
[![Node](https://img.shields.io/badge/Node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![Version](https://img.shields.io/github/package-json/v/ECHOUniverse/dsh-balance)](./package.json)

**English** · [中文](#中文)

---

## What it is

A client-side plugin for **DeepSeek Harness (DSH)**. It renders one row in the
sidebar footer, directly above the account row (avatar + nickname), showing the
DeepSeek wallet balance for the signed-in account. Hovering or focusing the row
opens a details popover; clicking it forces a refresh.

The package is `@local/dsh-balance`, the row id is `balance`, and the plugin
appears in the plugin manager as **DeepSeek Balance**.

## Features

- **One-glance balance** — a 24px wallet glyph plus the primary-currency total,
  rendered as a single row above the account row.
- **Pixel-aligned with the account row** — 44px row height, 14px tabular
  numerals, 6px padding, 8px gap. The row is widened 2px on each side so the
  icon and the avatar share a left edge, and the amount and the nickname share
  one too.
- **Per-currency details on hover** — total, top-up balance, bonus balance for
  every currency, the last update time (relative; absolute on hover), and the
  **Usage** / **Top up** links.
- **Manual refresh** — click the row, or press <kbd>Enter</kbd> / <kbd>Space</kbd>
  when it is focused, to bypass the focus throttle.
- **Automatic refresh that survives a collapsed sidebar** — every trigger is
  bound to the plugin lifecycle, not to the row component's mount.
- **Threshold colors** — the CNY total turns amber below the warn threshold and
  red below the danger threshold. USD never triggers a color; both light and
  dark themes are covered.
- **Honest states** — signed out, first load, and read failures are visually
  distinct; a failed read keeps the last good value and adds a gray ⚠.
- **Configurable** — polling switch, polling interval and both CNY thresholds
  are editable in the plugin settings page and apply without reloading.

## Requirements

- DeepSeek Harness Desktop `>= 0.2.1-rc.1 < 0.3.0`
- Node.js `^22.19.0 || >=24` and pnpm — build-time only

## Install

This is a **local** plugin: it is installed from a checkout, not from npm.

```sh
git clone https://github.com/ECHOUniverse/dsh-balance.git
cd dsh-balance
pnpm install
pnpm build

# Use the CLI that ships with DSH Desktop (do not use a global `dsh`)
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add link:"$PWD"
```

Then **fully quit and restart DSH**. The client bundle is loaded once when the
Web frontend starts, and external plugins have no hot-reload promise.

Use `--profile <name>` for a profile other than `desktop`. Installation writes
the dependency and a `link:` symlink into
`~/.dsh/profiles/<profile>/package.json` and its `node_modules`.

> `lib/client.js` is a build artifact and is not committed, which is why the
> `pnpm build` step is required before installing.

### Uninstall

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop remove @local/dsh-balance
```

Restart DSH afterwards for the row to disappear.

## Configuration

Open **Plugin manager → Plugins → DeepSeek Balance → Configuration**. The fields
are volatile host configuration, so a save takes effect on the next refresh
without reloading the plugin.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `pollingEnabled` | boolean | `true` | Run the fallback poll while the page is visible. |
| `pollingIntervalMs` | number | `60000` | Poll interval in ms, 15000–600000. |
| `warnThresholdCny` | number | `10` | CNY total below this turns the amount amber. |
| `dangerThresholdCny` | number | `1` | CNY total below this turns it red; must stay below `warnThresholdCny` (validated in the settings page). |

The initial values also live in [`cordis.patch.yml`](./cordis.patch.yml).

## Refresh behavior

Every trigger is owned by the plugin lifecycle ([`src/client.tsx`](./src/client.tsx),
`ctx.effect(() => controller.attach())`), not by the row component, so collapsing
the sidebar — which unmounts the row — does not stop automatic refresh. Rationale
in [ADR 0001](./docs/adr/0001-refresh-triggers-belong-to-plugin-lifecycle.md).

Triggers share **in-flight merging**: only one read runs at a time, and triggers
that arrive meanwhile collapse into at most one pending follow-up read. Each
client request times out after 8s. Failures are not retried — the only exception
is the startup refresh.

| Trigger | Behavior |
| --- | --- |
| **Startup refresh** (plugin activation) | Reads immediately; the cached snapshot is rendered first. If the result is not `ready` (signed out, `failed`, `ok:false`, timeout), it retries at **1s / 2s / 4s** (3 attempts, so the latest update lands within ~7s). Any `ready` result, including a click, cancels the remaining retries. |
| Window focus | Skipped when the last request was less than 20s ago. |
| Turn end (`api-session/status` running → false) | Always reads; not throttled. |
| Fallback poll | Every `pollingIntervalMs` while `pollingEnabled` and the page is visible. Paused while hidden; catches up on visibility if the interval has elapsed. |
| Row click / <kbd>Enter</kbd> / <kbd>Space</kbd> | Forces a read, bypassing the throttle; cancels queued startup retries on success. |
| Account sign-in state change | One read per change frame from `ctx.remote.account.watch(signal)`. |

**Cache.** Key `@local/dsh-balance/cache/v1` in `localStorage`, holding
`{ wallets: { value, bonusWallets }, fetchedAt }`. It never expires on its own:
on a cold start the cached value and its relative age render first, then the
background read replaces them.

## Data sources and extension points

- **Row position** — slot `sidebar.footer.action` (kind `list`, scope `root`,
  owner props `{ wide }`), inserted before `settingsArea` (the account menu).
- **Balance** — `ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds })`,
  which returns `null` (signed out), `{ status: 'ready', value, bonusWallets }`,
  or `{ status: 'failed' }`.
- **Links** — `ctx.remote.account.getState().links.usageUrl` and `.topUpUrl`.
- **Strings** — registered via `ctx.locale.register('balance', { zh, en })`; the
  plugin manager title and description come from [`locale/zh.json`](./locale/zh.json)
  and [`locale/en.json`](./locale/en.json).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No balance row after restarting | DSH was fully quit (not just the window closed); the sidebar is expanded (`wide`); the plugin is enabled; `lib/client.js` exists (run `pnpm build`); the profile's `dsh.profile.bundles` includes `@local/dsh-balance`. |
| Row shows ⚠ or a stale value | The last read failed (network or session). Hover for the failure reason; click the row to retry. |
| Amount updates rarely | `pollingEnabled` is on, the window is visible, and the interval is what you expect. Focus-triggered reads are throttled to one per 20s by design. |
| Layout looks off after a DSH upgrade | The slot and its neighbors are DSH internals; see Limitations. |
| The cordis badge moves to its own line | The plugin sets `.footerActions{flex-wrap:wrap}` so its row owns a full line. Removing that rule lets the amount and the badge share a line; functionality is unaffected. |

## Known limitations

- `sidebar.footer.action` is a DSH-internal slot, not a documented public API.
  A DSH upgrade (especially 0.3) may change its name, props, or neighbors.
- External client bundles have no hot reload: rebuild and restart DSH to see
  changes.
- Local installation only — this package is not published to npm.
- Requires a signed-in DeepSeek account; when signed out, the row only says so.
- Threshold colors apply to the CNY total only. With multiple currencies the row
  shows CNY (or the first currency when there is no CNY).
- The host half declares `@deepseek-ai/schemastery` as a peer dependency and
  relies on the DSH runtime to resolve it.

## Development

```sh
pnpm install
pnpm build      # src/client.tsx -> lib/client.js (lazy-CJS factory)
pnpm test       # vitest: formatting, totals, thresholds, cache, settings, relative time
pnpm typecheck  # tsc --noEmit
pnpm smoke      # loads lib/client.js in a Node VM and checks factory/slot/render
pnpm verify     # all of the above
pnpm watch      # esbuild watch; restarting DSH is still required
```

### Build pipeline

`src/client.tsx` is bundled by esbuild to CommonJS (`react`, `react/jsx-runtime`,
`react-dom`, `@deepseek-ai/cordis`, `zod` and the rest of the web frontend's
`staticModules` stay external), then `scripts/build-client.mjs` wraps it in the
browser module-system factory:

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    /* esbuild CJS output */
    return module.exports
  },
})
```

### Project layout

| Path | Purpose |
| --- | --- |
| `index.js` | Host half: plugin id and the volatile `Config` schema. |
| `src/client.tsx` | Client entry: slot registration, row component, `apply()` (triggers via `ctx.effect`). |
| `src/controller.ts` | Balance state machine and refresh scheduling: triggers, startup retry, in-flight merge, polling, account stream, cache. |
| `src/startup-retry.ts` | Testable pure logic for the 1s/2s/4s startup retry plan. |
| `src/constants.ts` | Package/row/slot identities, timeouts and throttle constants. |
| `src/settings-page.tsx` | `plugins.row.config` settings page (4 fields). |
| `src/format.ts` | Amount formatting and exact decimal arithmetic, matching the host. |
| `src/balance.ts` | Wallet merging and primary-currency selection. |
| `src/threshold.ts` | Threshold levels (CNY only). |
| `src/settings.ts` | Config defaults and normalization. |
| `src/cache.ts` | `localStorage` cache read/write and validation. |
| `src/time.ts` | Relative-time wording. |
| `src/locales.ts` | Chinese and English dictionaries. |
| `src/types.ts` | Minimal local type declarations (no dependency on `@deepseek-ai` type packages). |
| `cordis.patch.yml` | Inserts the `balance` row into a profile composition. |
| `locale/*.json` | Plugin manager title and description. |
| `icon.svg` | 36×36 gradient artwork: blue wallet with a gold ¥ coin, matching built-in plugin icons. |

## Contributing

Issues and pull requests are welcome. Please run `pnpm verify` before opening a
PR, and keep the row's alignment with the account row covered by the smoke test.

## License

[MIT](./LICENSE) © ECHOUniverse

## Disclaimer

An unofficial community plugin, not affiliated with or endorsed by DeepSeek.
It reads balances through DSH's account remote API using the credentials the app
already holds; it does not store or transmit them anywhere else. Use at your own
risk.

---

# 中文

**在 DSH 侧边栏账户行正上方显示 DeepSeek 账户余额。**

## 这是什么

一个 **DeepSeek Harness（DSH）** 客户端插件。它在侧边栏底部、账户行（头像 +
昵称）**正上方**渲染一行，展示当前登录账户的 DeepSeek 钱包余额；悬停或键盘
聚焦时弹出明细，点击整行则强制刷新。

包名 `@local/dsh-balance`，行 id 为 `balance`，插件管理页显示名「DeepSeek 余额」。

## 功能特性

- **一眼可见余额** — 24px 钱包图标 + 主币种合计，占一行，位于账户行上方。
- **与账户行逐像素对齐** — 行高 44px、字号 14px（等宽数字）、内边距 6px、间距
  8px；左右各外扩 2px，使图标与头像左缘、金额与昵称左缘对齐。
- **悬停查看分币种明细** — 每个币种的总额、充值余额、赠金余额、上次更新时间
  （相对时间，悬停显示绝对时间），以及「用量」「充值」入口。
- **手动刷新** — 点击整行，或聚焦后按 <kbd>Enter</kbd> / <kbd>Space</kbd>，
  绕过 focus 节流立即读取。
- **收起侧边栏也不中断自动刷新** — 全部触发源挂在插件生命周期上，而不是行组件
  的挂载/卸载。
- **阈值配色** — CNY 合计低于警戒值显示橙色、低于危险值显示红色；USD 不参与
  判定；明暗主题均有适配。
- **状态诚实** — 未登录、首次加载、读取失败各有独立视觉状态；失败时保留上一次
  成功的数值并显示灰色 ⚠。
- **可配置** — 轮询开关、轮询间隔、两个 CNY 阈值均可在插件设置页修改，保存即时
  生效，无需重载插件。

## 环境要求

- DeepSeek Harness Desktop `>= 0.2.1-rc.1 < 0.3.0`
- Node.js `^22.19.0 || >=24` 与 pnpm（仅构建时需要）

## 安装

这是**本地安装**插件：从代码检出安装，不发布到 npm。

```sh
git clone https://github.com/ECHOUniverse/dsh-balance.git
cd dsh-balance
pnpm install
pnpm build

# 使用 DSH Desktop 自带的 CLI（不要用全局 dsh）
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add link:"$PWD"
```

装完**必须完全退出并重启 DSH**：客户端 bundle 只在 Web 前端启动时加载一次，
外部插件没有热更新承诺。

其他 profile 把 `--profile desktop` 换成对应名称。安装会写入
`~/.dsh/profiles/<profile>/package.json` 的依赖与 `link:` 符号链接。

> `lib/client.js` 是构建产物、不提交到仓库，所以安装前必须执行 `pnpm build`。

### 卸载

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop remove @local/dsh-balance
```

卸载后同样需要重启 DSH。

## 配置项

「插件管理 → 插件 → DeepSeek 余额 → 配置」。这些是 Host 端的 volatile 配置，
保存后在下一次刷新时生效，无需重载插件。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `pollingEnabled` | boolean | `true` | 页面可见时是否按间隔兜底轮询。 |
| `pollingIntervalMs` | number | `60000` | 轮询间隔（毫秒），范围 15000–600000。 |
| `warnThresholdCny` | number | `10` | CNY 合计低于该值显示橙色。 |
| `dangerThresholdCny` | number | `1` | CNY 合计低于该值显示红色，必须小于 `warnThresholdCny`（设置页校验）。 |

初值同时写在 [`cordis.patch.yml`](./cordis.patch.yml)。

## 刷新策略

所有触发源都由**插件生命周期**持有（[`src/client.tsx`](./src/client.tsx) 中的
`ctx.effect(() => controller.attach())`），不随行组件挂载/卸载变化；因此收起
侧边栏（行被卸载）后自动刷新仍继续。设计与取舍见
[ADR 0001](./docs/adr/0001-refresh-triggers-belong-to-plugin-lifecycle.md)。

所有触发共享**在途合并**：同一时刻只有一次读取在进行，期间到达的触发合并为最多
一次待补读取。每次请求 8 秒超时；失败不自动重试，**唯一例外是启动刷新**。

| 触发 | 行为 |
| --- | --- |
| **启动刷新**（插件激活） | 立即读取一次，并先渲染缓存快照。若结果不是 `ready`（未登录、`failed`、`ok:false`、超时），按 **1s / 2s / 4s** 重试（共 3 次，最晚约 7 秒更新）。任一来源拿到 `ready`（含点击刷新）立即取消剩余重试。 |
| 窗口 focus | 距上次请求 < 20 秒跳过，否则读取。 |
| 轮次结束（`api-session/status` running → false） | 必查，不节流。 |
| 兜底轮询 | `pollingEnabled` 且页面可见时每 `pollingIntervalMs` 读一次；页面隐藏期间暂停，重新可见时距上次超过间隔则补查。 |
| 点击行 / <kbd>Enter</kbd> / <kbd>Space</kbd> | 立即强制刷新（绕过节流），成功后取消排队中的启动重试。 |
| 账号登录态变化 | `ctx.remote.account.watch(signal)` 的帧触发一次读取。 |

**缓存**：`localStorage` 键 `@local/dsh-balance/cache/v1`，内容为
`{ wallets: { value, bonusWallets }, fetchedAt }`，不过期；冷启动先显示缓存值与
相对时间，再由后台读取覆盖。

## 数据来源与扩展点

- **行位置** — 插槽 `sidebar.footer.action`（kind `list`，scope `root`，owner
  props `{ wide }`），插在 `settingsArea`（账户菜单）之前。
- **余额** — `ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds })`，
  返回 `null`（未登录）、`{ status: 'ready', value, bonusWallets }` 或
  `{ status: 'failed' }`。
- **链接** — `ctx.remote.account.getState().links.usageUrl` / `.topUpUrl`。
- **文案** — 通过 `ctx.locale.register('balance', { zh, en })` 注册；插件页展示名
  与说明来自 [`locale/zh.json`](./locale/zh.json)、[`locale/en.json`](./locale/en.json)。

## 常见问题

| 现象 | 排查 |
| --- | --- |
| 重启后没有余额行 | 是否**完全退出**并重启；侧边栏是否展开（收起时 `wide === false` 会隐藏该行）；插件是否启用；`lib/client.js` 是否存在（`pnpm build`）；profile 的 `dsh.profile.bundles` 是否包含 `@local/dsh-balance`。 |
| 显示 ⚠ 或旧值 | 上次读取失败（网络或会话）。悬停查看失败原因，点击整行重试。 |
| 金额很久不更新 | 检查 `pollingEnabled`、窗口是否可见、轮询间隔；focus 触发按设计限制为 20 秒一次。 |
| DSH 升级后布局异常 | 插槽及其相邻布局是 DSH 内部实现，见「已知限制」。 |
| cordis 徽标被挤到下一行 | 插件注入 `.footerActions{flex-wrap:wrap}` 让本行独占一行；去掉该规则即可让金额与徽标同行，功能不受影响。 |

## 已知限制

- `sidebar.footer.action` 是 DSH 内部插槽，未在公开文档中承诺；DSH 升级（尤其
  0.3）可能改变其名称、props 或相邻布局。
- 外部插件的客户端代码没有热更新承诺：改完 `pnpm build` 后需重启 DSH。
- 仅支持本地安装，未发布到 npm。
- 仅对已登录的 DeepSeek 账户可用；未登录时行内只提示登录。
- 阈值配色只对 CNY 合计生效；多币种时余额行显示 CNY（无 CNY 时显示第一个币种）。
- Host 半依赖安装包提供的 `@deepseek-ai/schemastery`（peerDependency，由 DSH
  运行时解析，不随插件打包）。

## 开发

```sh
pnpm install
pnpm build      # src/client.tsx -> lib/client.js（lazy-CJS 工厂）
pnpm test       # vitest：金额格式化、合计、阈值、缓存、设置、相对时间
pnpm typecheck  # tsc --noEmit
pnpm smoke      # 在 Node VM 中加载 lib/client.js，验证工厂/插槽/渲染
pnpm verify     # 以上全部
pnpm watch      # esbuild watch，仍需重启 DSH 才能生效
```

### 构建链

`src/client.tsx` 由 esbuild 打成 CommonJS（`react`、`react/jsx-runtime`、
`react-dom`、`@deepseek-ai/cordis`、`zod` 等 Web 前端的 `staticModules` 全部
external，不重复打包），再由 `scripts/build-client.mjs` 包进浏览器模块系统的
工厂外壳：

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    /* esbuild CJS output */
    return module.exports
  },
})
```

### 目录

| 路径 | 说明 |
| --- | --- |
| `index.js` | Host 半：插件 id 与 volatile `Config` 声明。 |
| `src/client.tsx` | 客户端入口：插槽注册、行组件、`apply()`（通过 `ctx.effect` 挂载触发器）。 |
| `src/controller.ts` | 余额状态机与刷新调度：触发源、启动重试、在途合并、轮询、账号流、缓存。 |
| `src/startup-retry.ts` | 启动重试计划（1s/2s/4s，最多 3 次，ready 取消）的可测纯逻辑。 |
| `src/constants.ts` | 包名/行 id/插槽 key/超时与节流常量。 |
| `src/settings-page.tsx` | `plugins.row.config` 配置页（4 项）。 |
| `src/format.ts` | 与宿主一致的金额格式化/精确十进制运算。 |
| `src/balance.ts` | 钱包合并、主币种选择。 |
| `src/threshold.ts` | 阈值分级（仅 CNY）。 |
| `src/settings.ts` | 配置默认值与规范化。 |
| `src/cache.ts` | `localStorage` 缓存读写与校验。 |
| `src/time.ts` | 相对时间文案。 |
| `src/locales.ts` | 中英文案字典。 |
| `src/types.ts` | 本地最小类型声明（不依赖 `@deepseek-ai` 类型包）。 |
| `cordis.patch.yml` | 把 `balance` 行插入 profile 组合。 |
| `locale/*.json` | 插件页展示名与说明。 |
| `icon.svg` | 36×36 渐变插画：蓝色钱包 + 金色 ¥ 金币，与内置插件图标同风格。 |

## 参与贡献

欢迎 issue 与 pull request。提交 PR 前请先跑 `pnpm verify`，并保持 smoke 测试
对「余额行与账户行对齐」的覆盖。

## 许可证

[MIT](./LICENSE) © ECHOUniverse

## 声明

非官方社区插件，与 DeepSeek 无隶属或背书关系。它通过 DSH 已有的账户 remote API
读取余额，凭证由 DSH 持有，本插件不会另行存储或传输。使用风险自负。
