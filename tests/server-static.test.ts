// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { startServer } from '../apps/server/src/main.ts'
import { resolveAssetPath } from '../apps/server/src/static.ts'
import { apiUrl, authHeaders, isRemoteApi, apiBase, probeHealth } from '../src/data/apiClient.ts'
import { handleApiRequest } from '../packages/campus-pack-store/src/api.ts'
import { MemoryPackStore } from '../packages/campus-pack-store/src/index.ts'

const created: string[] = []
const servers: Array<() => Promise<void>> = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

afterEach(async () => {
  while (servers.length) await servers.pop()!()
  while (created.length) {
    const dir = created.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

/** 起一个带假 dist 的服务，返回基址 */
async function startWithDist(distFiles: Record<string, string>) {
  const dataDir = await tempDir('s2-data-')
  const distDir = await tempDir('s2-dist-')
  for (const [name, body] of Object.entries(distFiles)) {
    const target = join(distDir, name)
    await mkdir(join(target, '..'), { recursive: true }).catch(() => undefined)
    await writeFile(target, body, 'utf8')
  }
  const runtime = await startServer({ dataDir, distDir, seedDir: '/nonexistent-seed', port: 0, host: '127.0.0.1' })
  servers.push(() => runtime.close())
  return { base: `http://127.0.0.1:${runtime.port}`, dataDir, distDir, runtime }
}

describe('静态托管：/editor 路由映射', () => {
  it('多入口页按别名映射到 dist 里的 html', () => {
    expect(resolveAssetPath('/')).toBe('index.html')
    expect(resolveAssetPath('/editor')).toBe('editor.html')
    expect(resolveAssetPath('/editor/')).toBe('editor.html')
    expect(resolveAssetPath('/demo')).toBe('demo.html')
    expect(resolveAssetPath('/plan')).toBe('plan.html')
    expect(resolveAssetPath('/assets/app-abc123.js')).toBe('assets/app-abc123.js')
    expect(resolveAssetPath('/nope')).toBe('nope')
  })

  it('服务真的能把 / 与 /editor 吐出来，且 /editor 是 editor.html', async () => {
    const { base } = await startWithDist({
      'index.html': '<html><body>main-app</body></html>',
      'editor.html': '<html><body>editor-app</body></html>',
      'assets/app.js': 'console.log(1)',
    })

    const home = await fetch(`${base}/`)
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('main-app')

    const editor = await fetch(`${base}/editor`)
    expect(editor.status).toBe(200)
    expect(await editor.text()).toContain('editor-app')
    expect(editor.headers.get('content-type')).toContain('text/html')

    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('javascript')
  })

  it('未知路径回落到 index.html，不 404 到白屏', async () => {
    const { base } = await startWithDist({ 'index.html': '<html><body>main-app</body></html>' })
    const response = await fetch(`${base}/some/deep/link`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('main-app')
  })

  it('dist 不存在时给一句人话，不是空响应', async () => {
    const dataDir = await tempDir('s2-empty-')
    const runtime = await startServer({
      dataDir,
      distDir: join(dataDir, 'definitely-missing'),
      seedDir: '/nonexistent-seed',
      port: 0,
      host: '127.0.0.1',
    })
    servers.push(() => runtime.close())
    const response = await fetch(`http://127.0.0.1:${runtime.port}/`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('npm run build')
  })

  it('/api/* 不被静态托管抢走', async () => {
    const { base } = await startWithDist({ 'index.html': 'x' })
    const health = await fetch(`${base}/api/health`)
    expect(health.headers.get('content-type')).toContain('application/json')
    expect((await health.json()).ok).toBe(true)
  })
})

describe('apiClient：同源与独立后端两种形态', () => {
  it('默认同源：apiBase 为空、apiUrl 不带前缀、GET 不带令牌', () => {
    expect(apiBase()).toBe('')
    expect(isRemoteApi()).toBe(false)
    expect(apiUrl('/api/campus')).toBe('/api/campus')
    expect(apiUrl('api/campus')).toBe('/api/campus')
    expect(authHeaders('GET')).toEqual({})
    expect(authHeaders('PUT')).toEqual({})
  })

  it('probeHealth 命中真实 /api/health', async () => {
    const { base } = await startWithDist({ 'index.html': 'x' })
    const originalFetch = globalThis.fetch
    const scopedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      originalFetch(typeof input === 'string' ? `${base}${input}` : input, init)) as typeof fetch
    const health = await probeHealth(scopedFetch)
    expect(health).toMatchObject({ ok: true, storage: 'file', writable: false })
  })

  it('probeHealth 在裸静态站上返回 null（不抛）', async () => {
    // 起一个只会吐 html 的服务器，模拟 GitHub Pages
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html></html>')
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
    servers.push(() => new Promise<void>((done) => server.close(() => done())))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const scopedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? `http://127.0.0.1:${port}${input}` : input
      return fetch(url, init)
    }) as typeof fetch
    expect(await probeHealth(scopedFetch)).toBeNull()
  })
})

describe('只读开关与 CORS', () => {
  async function call(options: Record<string, unknown>, reqInit: { method?: string; token?: string } = {}) {
    const store = new MemoryPackStore()
    const req = {
      method: reqInit.method ?? 'GET',
      url: '/api/campus',
      headers: reqInit.token ? { authorization: `Bearer ${reqInit.token}` } : {},
      async *[Symbol.asyncIterator]() {},
    }
    let status = 0
    let body = ''
    const res = {
      writeHead(code: number) {
        status = code
        return res
      },
      setHeader() {
        return res
      },
      end(chunk?: string) {
        body = chunk ?? ''
      },
    }
    await handleApiRequest(req as never, res as never, { store, defaultPackId: 'x', ...options } as never)
    return { status, body }
  }

  it('PUBLIC_READ=0 时只读接口也要令牌', async () => {
    const denied = await call({ token: 'secret', publicRead: false })
    expect(denied.status).toBe(401)
    const allowed = await call({ token: 'secret', publicRead: false }, { token: 'secret' })
    expect(allowed.status).not.toBe(401)
  })

  it('PUBLIC_READ=0 且没配 token：503，不是静默放行', async () => {
    const result = await call({ publicRead: false })
    expect(result.status).toBe(503)
  })
})
