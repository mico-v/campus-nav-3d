/**
 * 自托管服务入口：一个进程托管 `/api/*`，后续 S2 再接静态产物与 `/editor`。
 *
 * 零新依赖：只用 node:http / node:fs / node:path。
 * 运行：`npm run start`（node --experimental-strip-types apps/server/src/main.ts）
 *
 * 环境变量：
 *  - PORT          默认 8080
 *  - HOST          默认 0.0.0.0
 *  - DATA_DIR      默认 ./data       —— pack 落盘目录
 *  - API_TOKEN     未配置时写接口一律 503（不裸奔在公网）
 *  - SEED_DIR      种子包目录，默认 ./packs
 *  - CORS_ORIGIN   独立后端形态时允许的前端来源，逗号分隔；不配则不放行跨域
 *  - PUBLIC_READ   设为 0 时 `/api/campus` 也要令牌（默认公开只读，与 Pages 静态一致）
 */
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { FilePackStore } from '../../../packages/campus-pack-store/src/index.ts'
import { handleApiRequest } from '../../../packages/campus-pack-store/src/api.ts'
import { createStaticHandler } from './static.ts'

const repoRoot = resolve(import.meta.dirname, '../..')

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

/** 启动服务（测试里也用它，方便起在随机端口） */
export async function startServer(options: {
  port?: number
  host?: string
  dataDir?: string
  seedDir?: string
  token?: string
  distDir?: string
  publicRead?: boolean
  corsOrigins?: string[]
} = {}) {
  const dataDir = options.dataDir ?? resolve(repoRoot, process.env.DATA_DIR ?? 'data')
  const seedDir = options.seedDir ?? resolve(process.cwd(), process.env.SEED_DIR ?? 'packs')
  const distDir = options.distDir ?? resolve(repoRoot, 'dist')

  const store = new FilePackStore({ dataDir, seedDirs: [seedDir] })
  await store.ensureDataDir()
  const imported = await store.seed()

  const staticHandler = createStaticHandler({ distDir })

  const server = createServer((req, res) => {
    handleApiRequest(req, res, {
      store,
      token: options.token ?? process.env.API_TOKEN ?? undefined,
      storage: 'file',
      defaultPackId: 'usts-tianping',
      version: '0.1.0',
      publicRead: options.publicRead ?? process.env.PUBLIC_READ !== '0',
      corsOrigins:
        options.corsOrigins ??
        (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean) : []),
    })
      .then((handled) => {
        if (!handled) staticHandler(req, res)
      })
      .catch((error) => {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: (error as Error).message }))
      })
  })

  const port = options.port ?? envInt('PORT', 8080)
  const host = options.host ?? process.env.HOST ?? '0.0.0.0'

  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(port, host, () => {
      server.off('error', fail)
      done()
    })
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port

  return {
    server,
    port: actualPort,
    dataDir,
    imported,
    async close(): Promise<void> {
      await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())))
    },
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)

if (isMain) {
  const runtime = await startServer()
  const writable = Boolean(process.env.API_TOKEN)
  console.log(`[campus-server] listening on http://0.0.0.0:${runtime.port}`)
  console.log(`[campus-server] data dir: ${runtime.dataDir}`)
  if (runtime.imported.length) console.log(`[campus-server] seeded packs: ${runtime.imported.join(', ')}`)
  console.log(
    writable
      ? '[campus-server] write API: enabled (API_TOKEN set)'
      : '[campus-server] write API: DISABLED (set API_TOKEN to enable PUT/POST /api/campus)',
  )

  const shutdown = (signal: string) => {
    console.log(`[campus-server] ${signal} received, closing`)
    runtime.close().finally(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}
