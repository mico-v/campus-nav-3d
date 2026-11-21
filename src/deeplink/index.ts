/**
 * M4-A 深链契约（Web 侧）。
 *
 * URL 形态：`/{pack}?building=<id>&level=<n>&q=<kw>`。
 * 两个解析函数都是纯函数：非法输入返回 null，绝不抛异常。
 */

export type DeepLinkState = {
  pack: string
  building?: string
  level?: number
  q?: string
}

export type ShortLinkState = {
  shortId: string
}

/** 安全解析为 URL；相对路径按站点根解析，非法输入返回 null。 */
function toUrl(input: unknown): URL | null {
  if (typeof input !== 'string' && !(input instanceof URL)) return null
  try {
    return new URL(String(input), 'https://deeplink.invalid/')
  } catch {
    return null
  }
}

/** pack / building / 短链 id 共用：小写字母起头，仅字母数字与连字符，≤64 字符。 */
const isValidId = (value: string): boolean => /^[a-z][a-z0-9-]{0,63}$/.test(value)

/** 严格 percent 解码（URLSearchParams 对畸形转义会静默放行，这里显式拒绝）。 */
function decode(value: string): string | null {
  try {
    if (new URLSearchParams(`v=${value}`).get('v') === null) return null
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** level：非负整数且 ≤999，拒绝 1.5 / -1 / 1e3 / +1 / 空串。 */
const parseLevel = (raw: string): number | null => {
  if (!/^(0|[1-9]\d{0,2})$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 && value <= 999 ? value : null
}

/** q：trim 后非空、长度 ≤200 的查询词；控制字符视为非法。 */
const parseQuery = (raw: string): string | null => {
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  const value = raw.trim()
  return value && value.length <= 200 ? value : null
}

/** 将原始 query 解析为严格键值表；重复参数、畸形转义、空键都拒绝。 */
function parseRawQuery(raw: string): Map<string, string> | null {
  const result = new Map<string, string>()
  if (!raw) return result
  for (const part of raw.split('&')) {
    const separator = part.indexOf('=')
    const rawKey = separator < 0 ? part : part.slice(0, separator)
    const rawValue = separator < 0 ? '' : part.slice(separator + 1)
    const key = decode(rawKey.replace(/\+/g, ' '))
    const value = decode(rawValue.replace(/\+/g, ' '))
    if (key === null || value === null || !key || result.has(key)) return null
    result.set(key, value)
  }
  return result
}

/**
 * 解析深链 / 壳内 ?q= 链接 / 短链；无法识别或任何参数非法时返回 null。
 *
 * - `/{pack}?...` → DeepLinkState（pack 合法；building/level/q 任一非法则整条拒绝）
 * - `?q=<kw>`（无 pack 路径）→ { pack: 'default', q }
 * - `/s/<id>` → ShortLinkState，交给短链解析器
 */
export function parseDeepLink(input: unknown): DeepLinkState | ShortLinkState | null {
  const url = toUrl(input)
  if (!url) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : ''
  const params = parseRawQuery(rawQuery)
  if (!params) return null

  if (segments.length === 2 && segments[0] === 's') {
    if (params.size || url.hash) return null
    const shortId = decode(segments[1]!)
    return shortId && isValidId(shortId) ? { shortId } : null
  }

  if (segments.length === 1 && segments[0]!.endsWith('.html')) {
    if (url.hash || params.size !== 1 || !params.has('q')) return null
    const q = parseQuery(params.get('q')!)
    return q ? { pack: 'default', q } : null
  }

  if (segments.length === 0) {
    // 老的无参 URL（含根路径）不是新深链；只有 ?q= 才是壳内搜索链接。
    if (url.hash || params.size !== 1 || !params.has('q')) return null
    const q = parseQuery(params.get('q')!)
    return q ? { pack: 'default', q } : null
  }

  if (segments.length !== 1 || url.hash) return null
  if (url.pathname.endsWith('/') || segments[0] === 's') return null
  const pack = decode(segments[0]!)
  if (!pack || !isValidId(pack) || pack.endsWith('.html')) return null

  for (const key of params.keys()) {
    if (key !== 'building' && key !== 'level' && key !== 'q') return null
  }

  const state: DeepLinkState = { pack }
  if (params.has('building')) {
    const building = params.get('building')!
    if (!isValidId(building)) return null
    state.building = building
  }
  if (params.has('level')) {
    const level = parseLevel(params.get('level')!)
    if (level === null) return null
    state.level = level
  }
  if (params.has('q')) {
    const q = parseQuery(params.get('q')!)
    if (!q) return null
    state.q = q
  }
  return state
}

/**
 * 由状态生成相对深链；任何字段非法或缺 pack 时返回 null。
 * 输出键顺序固定为 building / level / q，便于快照与比较。
 */
export function buildDeepLink(state: unknown): string | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const candidate = state as Record<string, unknown>
  const pack = candidate.pack
  if (typeof pack !== 'string' || !isValidId(pack)) return null
  const normalized: DeepLinkState = { pack }
  if (candidate.building !== undefined) {
    if (typeof candidate.building !== 'string' || !isValidId(candidate.building)) return null
    normalized.building = candidate.building
  }
  if (candidate.level !== undefined) {
    if (typeof candidate.level !== 'number' || !Number.isSafeInteger(candidate.level) || candidate.level < 0 || candidate.level > 999) return null
    normalized.level = candidate.level
  }
  if (candidate.q !== undefined) {
    if (typeof candidate.q !== 'string') return null
    const q = parseQuery(candidate.q)
    if (!q) return null
    normalized.q = q
  }
  for (const key of Object.keys(candidate)) {
    if (key !== 'pack' && key !== 'building' && key !== 'level' && key !== 'q') return null
  }
  const params = new URLSearchParams()
  if (normalized.building !== undefined) params.set('building', normalized.building)
  if (normalized.level !== undefined) params.set('level', String(normalized.level))
  if (normalized.q !== undefined) params.set('q', normalized.q)
  const query = params.toString()
  const url = `/${normalized.pack}${query ? `?${query}` : ''}`
  // 自检：生成结果必须能被 parseDeepLink 原样解析，否则视为非法。
  const parsed = parseDeepLink(url)
  if (!parsed || !('pack' in parsed) || JSON.stringify(parsed) !== JSON.stringify(normalized)) return null
  return url
}

/**
 * 短链解析器的输入约定：`/s/<id>` 的 id 既不是 pack 也不是 building，
 * 必须先查表（真实服务不在本片范围），得到 deepLink 字段后交这里规范化；
 * 非字符串、非法深链、指向短链的深链都返回 null。
 */
export function shortLinkRedirect(record: unknown): string | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const value = (record as Record<string, unknown>).deepLink
  if (typeof value !== 'string') return null
  const parsed = parseDeepLink(value)
  if (!parsed || !('pack' in parsed)) return null
  return buildDeepLink(parsed)
}
