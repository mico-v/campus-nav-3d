/**
 * 静态托管：把 `dist/` 按原样吐出去，SPA 回落到 index.html。
 * S2 会在这里补 `/editor` 路由与缓存头，S1 先给出能跑的最小实现。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
}

export interface StaticHandlerOptions {
  distDir: string
  spaFallback?: string
}

/**
 * 路径 → dist 里的文件。
 * 构建产物是 `editor.html`（不在 `editor/` 目录下），所以 `/editor` 与 `/editor/` 要映射到
 * `editor.html`；其余多入口页（`/demo`、`/plan`）同理。带 `.html` 后缀的请求原样处理。
 */
const PAGE_ALIASES: Record<string, string> = {
  '': 'index.html',
  editor: 'editor.html',
  demo: 'demo.html',
  plan: 'plan.html',
}

/** 把请求路径映射成 dist 相对路径；映射不上返回 null（走 SPA 回落） */
export function resolveAssetPath(requestPath: string, fallback = 'index.html'): string | null {
  const trimmed = requestPath.replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return fallback
  if (Object.hasOwn(PAGE_ALIASES, trimmed)) return PAGE_ALIASES[trimmed]
  return trimmed
}

function sendFile(res: ServerResponse, path: string, size: number): void {
  const ext = extname(path).toLowerCase()
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  })
  createReadStream(path).pipe(res)
}

export function createStaticHandler(options: StaticHandlerOptions) {
  const root = resolve(options.distDir)
  const fallback = options.spaFallback ?? 'index.html'

  return (req: IncomingMessage, res: ServerResponse): void => {
    if ((req.method ?? 'GET').toUpperCase() !== 'GET' && (req.method ?? 'GET').toUpperCase() !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'method not allowed' }))
      return
    }

    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    const mapped = resolveAssetPath(pathname, fallback)
    const relative = mapped ? normalize(mapped).replace(/^([/\\])+/, '') : ''
    const candidates = relative ? [join(root, relative)] : [join(root, fallback)]

    const tryServe = (index: number): void => {
      const candidate = candidates[index]
      if (!candidate) {
        // 没命中：SPA 回落
        const spaPath = join(root, fallback)
        stat(spaPath).then(
          (info) => sendFile(res, spaPath, info.size),
          () => {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found（dist/ 还没构建？先跑 npm run build）')
          },
        )
        return
      }
      if (!resolve(candidate).startsWith(root + sep) && resolve(candidate) !== root) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('forbidden')
        return
      }
      stat(candidate).then(
        (info) => {
          if (info.isDirectory()) {
            candidates[index] = join(candidate, fallback)
            tryServe(index)
            return
          }
          sendFile(res, candidate, info.size)
        },
        () => tryServe(index + 1),
      )
    }

    tryServe(0)
  }
}
