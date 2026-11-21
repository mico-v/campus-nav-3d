/**
 * 深链入口装配：桌面 / 手机共用同一份解析结果。
 * 只把解析后的意图写到 DOM 供页面与原生壳读取；不触碰地图渲染、相机与
 * src/main.ts 的任何逻辑，也不改 history / 触发 reload。
 */
import { parseDeepLink, buildDeepLink, type DeepLinkState } from './index'

export type DeepLinkBootResult = {
  pack: string | null
  state: DeepLinkState | null
  shortId: string | null
  targetUrl: string | null
}

/** 纯装配：输入当前页面 URL，输出意图与规范化跳转目标，无副作用。 */
export function planDeepLinkBoot(href: string): DeepLinkBootResult {
  const parsed = parseDeepLink(href)
  if (!parsed) return { pack: null, state: null, shortId: null, targetUrl: null }
  if ('shortId' in parsed) {
    // 短链落地：真实服务查表在壳侧 / 后端，Web 侧只识别形态。
    return { pack: null, state: null, shortId: parsed.shortId, targetUrl: null }
  }
  const state: DeepLinkState = parsed
  const isEntryPage = /\.html$/.test(new URL(href, 'https://deeplink.invalid/').pathname)
    || state.pack === 'default'
  const query = new URL(href, 'https://deeplink.invalid/').search.replace(/^\?/, '')
  const targetUrl = isEntryPage
    ? `demo.html${query ? `?${query}` : ''}`
    : buildDeepLink(state)
  return { pack: state.pack, state, shortId: null, targetUrl }
}

// 入口脚本：把意图挂到 <html> 上，供原生壳与页面读取；
// 壳内 ?q= 仍由 src/main.ts 原有逻辑处理，不在这里重复。
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const result = planDeepLinkBoot(window.location.href)
  const root = document.documentElement
  root.dataset.deeplinkPack = result.pack ?? ''
  if (result.shortId) root.dataset.deeplinkShort = result.shortId
  if (result.state?.q) root.dataset.deeplinkQ = result.state.q
}
