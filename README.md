# @local/dsh-balance

在 DeepSeek Harness（DSH）左侧边栏底部、账户行（头像 + 昵称）**正上方**显示 DeepSeek 账户余额的客户端插件。

- 侧边栏一行：线性钱包图标 + 金额（13px，行高 44px，与账户行对齐）。
- 悬停/聚焦：自定义浮层展示每个币种的总额、充值余额、赠金余额，上次更新时间，以及「用量」「充值」入口。
- 点击整行：立即强制刷新（绕过节流）。
- 颜色阈值：CNY 合计低于警戒值显示橙色，低于危险值显示红色；USD 不参与判定。
- 账户未登录、读取失败、首次加载都有独立视觉状态，失败时保留旧值并显示灰色 ⚠。

包名 `@local/dsh-balance`，插件行 id `balance`，插件页展示名「DeepSeek 余额」。

## 安装 / 卸载

使用 DSH Desktop 自带的 CLI（**不要**用全局 `dsh`）：

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

# 从本地目录安装（link:）
"$DSH" plugin --profile desktop add link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/deepseekcredit-dsh

# 卸载
"$DSH" plugin --profile desktop remove @local/dsh-balance
```

安装会写入 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，并在 `~/.dsh/profiles/desktop/node_modules/@local/dsh-balance` 建符号链接。

**安装后必须完全退出并重启 DSH**：客户端 bundle 在启动时由 Web 前端加载，外部插件没有热更新承诺。

## 配置项

设置在「插件管理 → 插件 → 该插件的配置」中（`plugins.row.config`），保存即时生效（Host 端为 `Volatile` 配置，无需重载插件）：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `pollingEnabled` | boolean | `true` | 页面可见时是否按间隔兜底轮询。 |
| `pollingIntervalMs` | number | `60000` | 轮询间隔，单位毫秒，范围 15000–600000。 |
| `warnThresholdCny` | number | `10` | CNY 合计低于该值显示橙色。 |
| `dangerThresholdCny` | number | `1` | CNY 合计低于该值显示红色，**必须小于** `warnThresholdCny`（设置页校验）。 |

配置初值同时写在 `cordis.patch.yml` 中。

## 刷新策略

所有触发共享「在途合并」：正在请求时不重复发，最多记录一次待补请求；每次客户端请求 8 秒超时，失败不自动重试（等下一次触发）。

| 触发 | 行为 |
| --- | --- |
| 插件挂载 | 先渲染 localStorage 缓存，再查一次。 |
| `window` focus | 距上次请求 < 20 秒跳过，否则查（节流只作用于该路径）。 |
| `api-session/status` running → false | 必查，不节流。 |
| 兜底轮询 | `pollingEnabled` 且 `document.visibilityState === 'visible'` 时每 `pollingIntervalMs` 查一次；页面隐藏期间暂停，重新可见时距上次超过间隔则补查。 |
| 点击行 | 立即强制刷新（绕过节流）。 |
| 账号登录态变化 | `ctx.remote.account.watch(signal)` 的帧触发一次查询。 |

缓存键：`@local/dsh-balance/cache/v1`，内容为 `{ wallets: { value, bonusWallets }, fetchedAt }`，不过期；冷启动先显示缓存值与相对时间，再后台刷新覆盖。

## 数据与扩展点

- 行位置：`sidebar.footer.action`（kind `list`，scope `root`，owner props `{ wide }`），在 `settingsArea`（账户菜单）之前。
- 余额：`ctx.remote.account.getBalance({ version, locale, timezoneOffsetSeconds })`，返回 `null`（未登录）/ `{ status: 'ready', value, bonusWallets }` / `{ status: 'failed' }`。
- 链接：`ctx.remote.account.getState().links.usageUrl` / `links.topUpUrl`。
- 文案语言：`ctx.locale.register('balance', { zh, en })`；插件页展示名与说明来自 `locale/zh.json`、`locale/en.json` 的 `meta`。

## 验收清单

1. 重启 DSH 后，侧边栏底部账户行（头像 + 昵称）**正上方**出现钱包图标 + 金额一行。
2. 收起侧边栏（`wide === false`）时该行隐藏。
3. 鼠标悬停或键盘聚焦该行时，body 上的自定义浮层显示分币种总额/充值/赠金、相对更新时间（悬停时间显示绝对时间）以及「用量」「充值」按钮。
4. 按 Enter/Space 或鼠标点击该行，金额区域出现极淡灰点表示刷新中，数值不闪烁。
5. CNY 合计低于 10 显示橙色，低于 1 显示红色；USD 金额保持默认颜色；明暗主题均清晰。
6. 未登录时显示灰色「账户未登录」；读取失败且有旧值时保留旧值并显示灰色 ⚠，浮层给出失败原因。
7. 插件管理页中该插件显示「DeepSeek 余额」、说明与线性钱包图标；配置页可改 4 项并即时生效（下一次轮询/刷新可见）。
8. 完全退出并重启 DSH 后配置与显示仍正常。

## 已知风险 / 限制

- `sidebar.footer.action` 是 DSH 内部插槽，未在公开文档中承诺；DSH 升级（尤其 0.3）可能改变其名称、props 或相邻布局。
- 外部插件的客户端代码没有热更新承诺：改完 `pnpm build` 后需要重启 DSH 才能加载新 bundle。
- 首次安装必须重启；卸载后同样重启生效。
- 仅对已登录的 DeepSeek 账户可用；未登录时行内只提示登录，不显示金额。
- 布局注入 `.footerActions{flex-wrap:wrap}` 让本行独占一行；若某些版本中同插槽的 cordis 徽标因此换行显示，可将该 CSS 规则去掉，让金额与徽标同行靠左（功能不受影响）。
- Host 半依赖安装包提供的 `@deepseek-ai/schemastery`（声明为 peerDependency，由 DSH 运行时解析，不随插件打包）。
- 颜色阈值只对 CNY 合计生效；多币种时主行显示 CNY（无 CNY 时显示第一个币种）。

## 开发

```sh
pnpm install
pnpm build      # src/client.tsx -> lib/client.js（lazy-CJS factory）
pnpm test       # vitest run：金额格式化、合计、阈值、缓存、设置、相对时间
pnpm typecheck  # tsc --noEmit
pnpm smoke      # 在 Node VM 中加载 lib/client.js，验证工厂/插槽/渲染
pnpm verify     # 以上全部
pnpm watch      # esbuild watch，仍需重启 DSH 才能生效
```

### 构建链

`src/client.tsx` 由 esbuild 打成 CommonJS（`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/cordis`、`zod` 等 Web 前端的 `staticModules` 全部 external，不重复打包），再由 `scripts/build-client.mjs` 包进浏览器模块系统的工厂外壳：

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
| `index.js` | Host 半：插件 id 与 `Config`（volatile）声明。 |
| `src/client.tsx` | 客户端入口：插槽注册、余额状态机、刷新调度、行组件。 |
| `src/settings-page.tsx` | `plugins.row.config` 配置页（4 项，写入 `configForms`）。 |
| `src/format.ts` | 与宿主一致的金额格式化/精确十进制运算。 |
| `src/balance.ts` | 钱包合并、主币种选择。 |
| `src/threshold.ts` | 阈值分级（仅 CNY）。 |
| `src/settings.ts` | 配置默认值与规范化。 |
| `src/cache.ts` | localStorage 缓存读写与校验。 |
| `src/time.ts` | 相对时间文案。 |
| `src/locales.ts` | 中英文案字典。 |
| `src/types.ts` | 本地最小类型声明（不依赖 @deepseek-ai 类型包）。 |
| `cordis.patch.yml` | 把 `balance` 行插入 profile 组合。 |
| `locale/*.json` | 插件页展示名/说明。 |
| `icon.svg` | 线性钱包 + 金币图标。 |
