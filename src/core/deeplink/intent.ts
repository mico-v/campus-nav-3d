/**
 * M4-A 深链 intent 兜底解析。
 *
 * 底层 parseDeepLink 只负责“严格解析”，非法输入返回 null；这里在上层补一层
 * 兜底：任何未知 / 畸形输入都变成一份可消费的默认视图意图，永不抛异常。
 * 不依赖 src/data，knownPacks / knownBuildings 由调用方注入。
 */
import { parseDeepLink, type DeepLinkState } from '../../deeplink/index'

export const DEFAULT_PACK = 'default'

/** 兜底原因：区分“本来就是默认视图”和“输入无效被回退”。 */
export type IntentFallbackReason =
  | 'none'
  | 'invalid-input'
  | 'unknown-pack'
  | 'unknown-building'
  | 'short-link'
  | 'no-intent'

export type IntentSource = 'deep-link' | 'short-link' | 'default'

export interface IntentResolution {
  /** 当前意图归一后的 pack；始终为合法 id 或 DEFAULT_PACK。 */
  pack: string
  building?: string
  level?: number
  q?: string
  /** 意图来源，供 UI / 壳侧决定下一步动作。 */
  source: IntentSource
  /** 是否走了兜底（source 为 default 时恒为 true）。 */
  fallback: boolean
  reason: IntentFallbackReason
  /** 短链 id：只在 source 为 short-link 时出现，形式与 parseDeepLink 一致。 */
  shortId?: string
}

export interface IntentCatalog {
  /** 已知 pack id 集合；传入则未知 pack 回落默认，不传则不做该校验。 */
  knownPacks?: ReadonlySet<string>
  /** 已知 building id 集合；传入则未知 building 回落默认，不传则不做该校验。 */
  knownBuildings?: ReadonlySet<string>
}

function defaultResolution(reason: IntentFallbackReason): IntentResolution {
  return { pack: DEFAULT_PACK, source: 'default', fallback: true, reason }
}

function fromState(state: DeepLinkState, catalog: IntentCatalog): IntentResolution {
  const result: IntentResolution = {
    pack: state.pack,
    source: 'deep-link',
    fallback: false,
    reason: 'none',
  }
  if (catalog.knownPacks && !catalog.knownPacks.has(state.pack)) {
    return defaultResolution('unknown-pack')
  }
  if (state.building !== undefined) {
    if (catalog.knownBuildings && !catalog.knownBuildings.has(state.building)) {
      return defaultResolution('unknown-building')
    }
    result.building = state.building
  }
  if (state.level !== undefined) result.level = state.level
  if (state.q !== undefined) result.q = state.q
  return result
}

/**
 * 解析任意输入为一份可消费的意图；非法输入一律回退默认视图，不抛异常。
 *
 * - 严格深链 / 老 ?q= 链 → 正常意图（source: deep-link）
 * - /s/<id> 短链 → 只识别形态（source: short-link，shortId 原样透出），形式与解析层一致
 * - 其余（null、数字、畸形参数、未知 pack/building 等）→ 默认视图意图
 */
export function parseIntent(input: unknown, catalog: IntentCatalog = {}): IntentResolution {
  let parsed: ReturnType<typeof parseDeepLink>
  try {
    parsed = parseDeepLink(input)
  } catch {
    return defaultResolution('invalid-input')
  }
  // 无参数 / 空输入是“没有意图”，畸形参数是“解析失败”；两者都走默认视图。
  if (parsed === null) {
    const hasInput = typeof input === 'string' ? input.trim() !== '' : input instanceof URL
    return defaultResolution(hasInput ? 'invalid-input' : 'no-intent')
  }
  if ('shortId' in parsed) {
    return {
      pack: DEFAULT_PACK,
      source: 'short-link',
      fallback: true,
      reason: 'short-link',
      shortId: parsed.shortId,
    }
  }
  try {
    return fromState(parsed, catalog)
  } catch {
    return defaultResolution('invalid-input')
  }
}

/** 是否没有任何定位意图（默认视图且无短链），供 UI 决定是否弹提示。 */
export function isDefaultIntent(intent: IntentResolution): boolean {
  return intent.source === 'default' && intent.shortId === undefined
}
