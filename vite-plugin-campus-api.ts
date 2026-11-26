import type { Plugin, ViteDevServer } from 'vite'
import { resolve } from 'node:path'

/**
 * dev 时的 `/api/*` 中间件。
 *
 * 路由逻辑与存储都已抽到 `packages/campus-pack-store`（`handleApiRequest` + `MemoryPackStore`），
 * 自托管部署（`apps/server`）用的是**同一份**实现 —— 这里只负责把它挂到 Vite 的 Connect 上。
 * 别再往这个文件里加业务逻辑，否则 dev 与部署会漂。
 */
import { handleApiRequest, MemoryPackStore } from './packages/campus-pack-store/src/mod.ts'

/** dev 时编辑器默认读写的 pack 目录（自托管部署改用 DATA_DIR，不再依赖这个常量） */
export const PACK_DIR = resolve(import.meta.dirname, 'packs/usts-tianping')
export const PACK_PATH = resolve(PACK_DIR, 'pack.json')
export const CAMPUS_PATH = resolve(PACK_DIR, 'campus.json')

export function campusApiPlugin(): Plugin {
  return {
    name: 'campus-api',
    configureServer(server: ViteDevServer) {
      const store = new MemoryPackStore()
      server.middlewares.use((req, res, next) => {
        handleApiRequest(req, res, {
          store,
          storage: 'memory',
          // dev 默认放开写操作：本地调试不该还要配 token
          token: 'dev',
          defaultPackId: 'usts-tianping',
        })
          .then((handled) => {
            if (!handled) next()
          })
          .catch((error) => {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: (error as Error).message }))
          })
      })
    },
  }
}
