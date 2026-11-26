/**
 * 编辑后端的地址解析与请求封装。
 *
 * 两种运行形态共用这一份代码：
 *  - **同源**（默认，dev server 或自托管服务同进程托管）：`API_BASE = ''`，请求 `/api/campus`；
 *  - **独立后端**（前端静态托管在别处、API 在另一台机器）：构建时给 `VITE_API_BASE`，
 *    请求 `${base}/api/campus`，写操作带 `Authorization: Bearer <token>`。
 *
 * 自托管部署的写接口必须配 `API_TOKEN`，没配就是 503 —— 这里把 503 单独翻译成一句人话，
 * 免得建模页只报「保存失败：503」。
 */

const RAW_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? ''
/** 写操作令牌；只用于独立后端形态，同源 dev 不需要 */
const RAW_TOKEN = (import.meta.env?.VITE_API_TOKEN as string | undefined) ?? ''

/** 后端根地址，去尾斜杠；空串代表同源 */
export function apiBase(): string {
  return RAW_BASE.replace(/\/+$/, '')
}

/** 是否指向独立后端（静态托管 + 独立 API 的形态） */
export function isRemoteApi(): boolean {
  return apiBase() !== ''
}

export function apiToken(): string {
  return RAW_TOKEN.trim()
}

/** 拼一个 API 路径，处理同源与独立后端两种前缀 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${apiBase()}${normalized}`
}

/** 带令牌的请求头（同源且无令牌时返回空对象，不污染普通 GET） */
export function authHeaders(method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'): Record<string, string> {
  const token = apiToken()
  if (!token) return {}
  if (method === 'GET') return {}
  return { Authorization: `Bearer ${token}` }
}

export interface HealthResult {
  ok: boolean
  version: string
  writable: boolean
  storage: string
}

/** 探一下后端是否在线，用于建模页决定要不要进只读模式 */
export async function probeHealth(fetchFn: typeof fetch = fetch): Promise<HealthResult | null> {
  try {
    const response = await fetchFn(apiUrl('/api/health'), { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    const payload = (await response.json()) as Partial<HealthResult>
    return {
      ok: payload.ok === true,
      version: typeof payload.version === 'string' ? payload.version : 'unknown',
      writable: payload.writable === true,
      storage: typeof payload.storage === 'string' ? payload.storage : 'unknown',
    }
  } catch {
    return null
  }
}
