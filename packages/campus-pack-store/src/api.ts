/**
 * 与运行环境无关的 HTTP handler：`(req, res) => Promise<boolean>`。
 *
 * 由两处复用同一份实现（这是方案里的硬约束，不许复制逻辑）：
 *  - `vite-plugin-campus-api.ts`：dev server 的 Connect 中间件；
 *  - `apps/server`：自托管部署的 node:http server。
 *
 * 路由：
 *  - `GET  /api/health`      → { ok, version, uptime, storage }
 *  - `GET  /api/packs`       → [{ id, name, updatedAt }]
 *  - `GET  /api/campus/:id`  → CampusData
 *  - `GET  /api/campus`      → 默认 pack 的 CampusData
 *  - `PUT  /api/campus/:id`  → 写盘（需 token，未配置则 503）
 *  - `POST /api/campus`      → 同 PUT，body 里必须带 id
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PACK_ID_PATTERN, PackNotFoundError, PackValidationError, type PackStore } from './index.ts'

export interface ApiHandlerOptions {
  store: PackStore
  /** 写操作令牌；未配置时所有写接口返回 503（不裸奔在公网） */
  token?: string
  /** 默认 pack id（GET /api/campus 无 id 时用） */
  defaultPackId?: string
  /** 存储形态描述，回在 /api/health 里 */
  storage?: string
  version?: string
  now?: () => number
}

export interface ApiResult {
  status: number
  body: unknown
}

const MAX_BODY_BYTES = 32 * 1024 * 1024

function corsHeaders(req: IncomingMessage, allowedOrigins: string[]): Record<string, string> {
  const origin = req.headers.origin
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-api-token',
    'access-control-max-age': '600',
  }
  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin
    headers.vary = 'origin'
  }
  return headers
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buf.length
    if (size > MAX_BODY_BYTES) throw new PackValidationError('请求体过大')
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseJsonBody(raw: string): unknown {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new PackValidationError('请求体不是合法 JSON')
  }
}

function tokenOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim()
  }
  const alt = req.headers['x-api-token']
  if (typeof alt === 'string') return alt.trim()
  return null
}

function splitPath(url: string): string[] {
  const pathname = url.split('?')[0] ?? '/'
  return pathname.split('/').filter(Boolean)
}

/**
 * 处理 `/api/*` 请求。返回 true 表示已接管（调用方不要再往下走），false 表示不归它管。
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: ApiHandlerOptions,
): Promise<boolean> {
  const segments = splitPath(req.url ?? '/')
  if (segments[0] !== 'api') return false

  const method = (req.method ?? 'GET').toUpperCase()
  const headers = corsHeaders(req, [])
  const send = (result: ApiResult): void => {
    const payload = JSON.stringify(result.body ?? null)
    res.writeHead(result.status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
      ...headers,
    })
    res.end(payload)
  }

  if (method === 'OPTIONS') {
    res.writeHead(204, headers)
    res.end()
    return true
  }

  const now = options.now ?? (() => Date.now())

  try {
    // /api/health
    if (segments[1] === 'health' && method === 'GET') {
      send({
        status: 200,
        body: {
          ok: true,
          version: options.version ?? '0.0.0',
          uptime: Math.round(now() / 1000),
          storage: options.storage ?? 'unknown',
          writable: Boolean(options.token),
        },
      })
      return true
    }

    // /api/packs
    if (segments[1] === 'packs' && method === 'GET') {
      send({ status: 200, body: await options.store.list() })
      return true
    }

    if (segments[1] !== 'campus') {
      send({ status: 404, body: { error: 'not found' } })
      return true
    }

    const packId = segments[2]

    if (method === 'GET') {
      const id = packId ?? options.defaultPackId
      if (!id) {
        send({ status: 400, body: { error: '缺少 pack id' } })
        return true
      }
      if (!PACK_ID_PATTERN.test(id)) {
        send({ status: 400, body: { error: `非法 pack id：${id}` } })
        return true
      }
      send({ status: 200, body: await options.store.readCampus(id) })
      return true
    }

    if (method === 'PUT' || method === 'POST') {
      if (!options.token) {
        send({ status: 503, body: { error: '写接口未启用：服务端未配置 API_TOKEN' } })
        return true
      }
      if (tokenOf(req) !== options.token) {
        send({ status: 401, body: { error: 'token 无效' } })
        return true
      }
      const body = parseJsonBody(await readBody(req))
      const idFromBody =
        body && typeof body === 'object' && 'id' in body ? String((body as { id: unknown }).id) : undefined
      const id = packId ?? idFromBody
      if (!id) {
        send({ status: 400, body: { error: '缺少 pack id' } })
        return true
      }
      if (!PACK_ID_PATTERN.test(id)) {
        send({ status: 400, body: { error: `非法 pack id：${id}` } })
        return true
      }
      const saved = await options.store.writeCampus(id, body)
      send({ status: 200, body: saved })
      return true
    }

    send({ status: 405, body: { error: `不支持的 method：${method}` } })
    return true
  } catch (error) {
    if (error instanceof PackNotFoundError) {
      send({ status: 404, body: { error: error.message } })
      return true
    }
    if (error instanceof PackValidationError) {
      send({ status: 400, body: { error: error.message } })
      return true
    }
    send({ status: 500, body: { error: (error as Error).message } })
    return true
  }
}
