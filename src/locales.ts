/**
 * Locale dictionaries for the balance row, its tooltip and the row's
 * configuration page. Simplified Chinese is the key-set source of truth; English
 * is checked against it at build time by `type`.
 */

/** Every key the balance bundle can translate. */
export type BalanceKey =
  | 'row.label'
  | 'row.hint'
  | 'row.signedOut'
  | 'row.loading'
  | 'tooltip.label'
  | 'tooltip.total'
  | 'tooltip.recharge'
  | 'tooltip.bonus'
  | 'tooltip.updated'
  | 'tooltip.never'
  | 'tooltip.error'
  | 'tooltip.failed'
  | 'tooltip.signedOut'
  | 'tooltip.hint'
  | 'tooltip.usage'
  | 'tooltip.topUp'
  | 'tooltip.timeout'
  | 'tooltip.loading'
  | 'time.justNow'
  | 'time.seconds'
  | 'time.minutes'
  | 'time.hours'
  | 'time.days'
  | 'settings.title'
  | 'settings.description'
  | 'settings.groupRefresh'
  | 'settings.groupThreshold'
  | 'settings.polling'
  | 'settings.pollingHint'
  | 'settings.interval'
  | 'settings.intervalHint'
  | 'settings.warn'
  | 'settings.warnHint'
  | 'settings.danger'
  | 'settings.dangerHint'
  | 'settings.loading'
  | 'settings.unavailable'
  | 'settings.readOnly'
  | 'settings.invalidNumber'
  | 'settings.invalidRange'
  | 'settings.invalidOrder'
  | 'settings.saveFailed'
  | 'settings.summary'
  | 'settings.summaryOff'

/** Simplified Chinese dictionary. */
export const zh: Record<BalanceKey, string> = {
  'row.label': 'DeepSeek 账户余额',
  'row.hint': '点击立即刷新',
  'row.signedOut': '账户未登录',
  'row.loading': '…',
  'tooltip.label': '余额详情',
  'tooltip.total': '总额',
  'tooltip.recharge': '充值余额',
  'tooltip.bonus': '赠金余额',
  'tooltip.updated': '上次更新：{time}',
  'tooltip.never': '尚未成功读取',
  'tooltip.error': '读取失败：{message}',
  'tooltip.failed': '服务返回读取失败',
  'tooltip.signedOut': '账户未登录。请在左下角的账户菜单中登录 DeepSeek 账户。',
  'tooltip.hint': '点击行即可立即刷新',
  'tooltip.usage': '用量',
  'tooltip.topUp': '充值',
  'tooltip.timeout': '请求超时',
  'tooltip.loading': '正在读取余额…',
  'time.justNow': '刚刚',
  'time.seconds': '{n} 秒前',
  'time.minutes': '{n} 分钟前',
  'time.hours': '{n} 小时前',
  'time.days': '{n} 天前',
  'settings.title': '余额显示',
  'settings.description': '在侧边栏账户行上方显示 DeepSeek 账户余额，悬停可查看分币种明细。',
  'settings.groupRefresh': '刷新',
  'settings.groupThreshold': '颜色阈值（仅 CNY）',
  'settings.polling': '后台轮询',
  'settings.pollingHint': '页面可见时按固定间隔自动刷新余额。',
  'settings.interval': '轮询间隔',
  'settings.intervalHint': '毫秒，范围 15000–600000。',
  'settings.warn': '警戒阈值',
  'settings.warnHint': 'CNY 合计低于该金额时金额显示为橙色。',
  'settings.danger': '危险阈值',
  'settings.dangerHint': 'CNY 合计低于该金额时金额显示为红色，必须小于警戒阈值。',
  'settings.loading': '正在读取配置…',
  'settings.unavailable': '当前部署没有提供可写的余额配置。',
  'settings.readOnly': '当前配置为只读。',
  'settings.invalidNumber': '请输入有效数字。',
  'settings.invalidRange': '请输入 {min}–{max} 之间的整数。',
  'settings.invalidOrder': '危险阈值必须小于警戒阈值。',
  'settings.saveFailed': '保存失败，请重试。',
  'settings.summary': '每 {seconds} 秒刷新 · 警戒 ¥{warn} · 危险 ¥{danger}',
  'settings.summaryOff': '自动刷新已关闭 · 警戒 ¥{warn} · 危险 ¥{danger}',
}

/** English dictionary. */
export const en: Record<BalanceKey, string> = {
  'row.label': 'DeepSeek account balance',
  'row.hint': 'Click to refresh now',
  'row.signedOut': 'Not signed in',
  'row.loading': '…',
  'tooltip.label': 'Balance details',
  'tooltip.total': 'Total',
  'tooltip.recharge': 'Recharge',
  'tooltip.bonus': 'Bonus',
  'tooltip.updated': 'Updated {time}',
  'tooltip.never': 'Not loaded yet',
  'tooltip.error': 'Read failed: {message}',
  'tooltip.failed': 'The service reported a failed read',
  'tooltip.signedOut': 'Not signed in. Sign in to your DeepSeek account from the account menu at the bottom left.',
  'tooltip.hint': 'Click the row to refresh now',
  'tooltip.usage': 'Usage',
  'tooltip.topUp': 'Top up',
  'tooltip.timeout': 'Request timed out',
  'tooltip.loading': 'Reading balance…',
  'time.justNow': 'just now',
  'time.seconds': '{n}s ago',
  'time.minutes': '{n}m ago',
  'time.hours': '{n}h ago',
  'time.days': '{n}d ago',
  'settings.title': 'Balance display',
  'settings.description': 'Shows the DeepSeek account balance above the sidebar account row; hover for per-currency details.',
  'settings.groupRefresh': 'Refresh',
  'settings.groupThreshold': 'Color thresholds (CNY only)',
  'settings.polling': 'Background polling',
  'settings.pollingHint': 'Refresh the balance on a fixed interval while the page is visible.',
  'settings.interval': 'Polling interval',
  'settings.intervalHint': 'Milliseconds, 15000–600000.',
  'settings.warn': 'Warn threshold',
  'settings.warnHint': 'The CNY total turns amber below this amount.',
  'settings.danger': 'Danger threshold',
  'settings.dangerHint': 'The CNY total turns red below this amount; it must stay below the warn threshold.',
  'settings.loading': 'Loading configuration…',
  'settings.unavailable': 'This deployment exposes no writable balance configuration.',
  'settings.readOnly': 'This configuration is read-only.',
  'settings.invalidNumber': 'Enter a valid number.',
  'settings.invalidRange': 'Enter an integer between {min} and {max}.',
  'settings.invalidOrder': 'The danger threshold must be below the warn threshold.',
  'settings.saveFailed': 'Save failed, please retry.',
  'settings.summary': 'Refresh every {seconds}s · warn ¥{warn} · danger ¥{danger}',
  'settings.summaryOff': 'Auto refresh off · warn ¥{warn} · danger ¥{danger}',
}