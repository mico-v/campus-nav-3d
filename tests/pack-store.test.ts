// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FilePackStore, MemoryPackStore, PackNotFoundError, PackValidationError } from '../packages/campus-pack-store/src/index.ts'
import { handleApiRequest } from '../packages/campus-pack-store/src/api.ts'
import type { CampusData } from '../src/data/campusData.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, 'fixtures/campus-api')
const packA = join(fixtureRoot, 'pack-a')

const created: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

async function seedDataDir(): Promise<string> {
  const dir = await tempDir('pack-store-')
  await cp(packA, join(dir, 'pack-a'), { recursive: true })
  return dir
}

afterEach(async () => {
  while (created.length) {
    const dir = created.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('FilePackStore：文件存储', () => {
  it('读取种子包，list 返回 id/name', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const list = await store.list()
    expect(list.map((entry) => entry.id)).toEqual(['pack-a'])
    expect(typeof list[0].name).toBe('string')
  })

  it('写入后重启（新建 store 实例）数据仍在 —— 这是内存 store 做不到的', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const before = await store.readCampus('pack-a')
    const buildings = before.buildings.map((building, index) =>
      index === 0 ? { ...building, name: `${building.name}-改过` } : building,
    )
    await store.writeCampus('pack-a', { ...before, buildings }, '2026-11-26T00:00:00.000Z')

    const reopened = new FilePackStore({ dataDir })
    const after = await reopened.readCampus('pack-a')
    expect(after.buildings[0].name).toBe(`${before.buildings[0].name}-改过`)
    expect(await reopened.readMeta('pack-a')).toMatchObject({ id: 'pack-a', updatedAt: '2026-11-26T00:00:00.000Z' })
  })

  it('几何写 campus.json、元信息写 pack.json，两边不重复', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const data = await store.readCampus('pack-a')
    await store.writeCampus('pack-a', data)

    const geometry = JSON.parse(await readFile(join(dataDir, 'pack-a', 'campus.json'), 'utf8')) as Record<string, unknown>
    expect(Array.isArray(geometry.buildings)).toBe(true)
    expect(geometry.name).toBeUndefined()

    const meta = JSON.parse(await readFile(join(dataDir, 'pack-a', 'pack.json'), 'utf8')) as Record<string, unknown>
    expect(meta.id).toBe('pack-a')
    expect(meta.buildings).toBeUndefined()
  })

  it('并发写同一 pack 不会互相踩：串行写入，最终值是最后一次', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const base = await store.readCampus('pack-a')
    const writes = ['一', '二', '三', '四', '五'].map((suffix, index) =>
      store.writeCampus('pack-a', {
        ...base,
        buildings: base.buildings.map((building, i) => (i === 0 ? { ...building, name: `并发-${suffix}${index}` } : building)),
      }),
    )
    await Promise.all(writes)
    const after = await store.readCampus('pack-a')
    expect(after.buildings[0].name).toBe('并发-五4')
  })

  it('非法数据被拒，原文件不被破坏', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const before = await readFile(join(dataDir, 'pack-a', 'campus.json'), 'utf8')
    await expect(store.writeCampus('pack-a', { name: '' } as unknown as CampusData)).rejects.toBeInstanceOf(
      PackValidationError,
    )
    expect(await readFile(join(dataDir, 'pack-a', 'campus.json'), 'utf8')).toBe(before)
  })

  it('未知 pack 抛 PackNotFoundError，越界 id 抛 PackValidationError', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    await expect(store.readCampus('nope')).rejects.toBeInstanceOf(PackNotFoundError)
    await expect(store.readCampus('../etc')).rejects.toBeInstanceOf(PackValidationError)
  })

  it('seed 不覆盖已有数据', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const data = await store.readCampus('pack-a')
    await store.writeCampus('pack-a', { ...data, name: '被改过的名字' })

    const seeder = new FilePackStore({ dataDir, seedDirs: [fixtureRoot] })
    await seeder.seed()
    const after = await seeder.readCampus('pack-a')
    expect(after.name).toBe('被改过的名字')
  })
})

describe('MemoryPackStore：与 FilePackStore 行为对齐', () => {
  it('写入后可读回，非法 id 与非法数据被拒', async () => {
    const store = new MemoryPackStore()
    const fileStore = new FilePackStore({ dataDir: await seedDataDir() })
    const seed = await fileStore.readCampus('pack-a')

    await store.writeCampus('pack-a', seed)
    const after = await store.readCampus('pack-a')
    expect(after.buildings.length).toBe(seed.buildings.length)

    await expect(store.writeCampus('Bad_ID', seed)).rejects.toBeInstanceOf(PackValidationError)
    await expect(store.writeCampus('pack-a', { name: '' } as unknown as CampusData)).rejects.toBeInstanceOf(
      PackValidationError,
    )
  })
})

/** 最小 req/res 桩，直接喂给 handleApiRequest */
function callApi(
  store: unknown,
  init: { method?: string; url: string; body?: unknown; token?: string },
  options: { token?: string } = {},
): Promise<{ status: number; body: any }> {
  const payload = init.body === undefined ? '' : JSON.stringify(init.body)
  const req = {
    method: init.method ?? 'GET',
    url: init.url,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    async *[Symbol.asyncIterator]() {
      if (payload) yield Buffer.from(payload)
    },
  }
  let status = 0
  let raw = ''
  const res = {
    headersSent: false,
    writeHead(code: number) {
      status = code
      return res
    },
    setHeader() {
      return res
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') raw = chunk
    },
  }
  return handleApiRequest(req as never, res as never, {
    store: store as never,
    token: options.token,
    defaultPackId: 'pack-a',
    storage: 'memory',
  }).then(() => ({ status, body: raw ? JSON.parse(raw) : null }))
}

describe('handleApiRequest：dev 与部署共用的一份路由', () => {
  it('/api/health 返回 ok 与可写状态', async () => {
    const result = await callApi(new MemoryPackStore(), { url: '/api/health' })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, writable: false })
  })

  it('/api/packs 返回 pack 列表', async () => {
    const dataDir = await seedDataDir()
    const result = await callApi(new FilePackStore({ dataDir }), { url: '/api/packs' })
    expect(result.status).toBe(200)
    expect(result.body.map((entry: { id: string }) => entry.id)).toEqual(['pack-a'])
  })

  it('/api/campus 无 id 时用默认 pack；非法 id 返回 400', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const ok = await callApi(store, { url: '/api/campus' })
    expect(ok.status).toBe(200)
    expect(ok.body.id).toBe('pack-a')

    const bad = await callApi(store, { url: '/api/campus/Bad_ID' })
    expect(bad.status).toBe(400)
  })

  it('未配置 token 时写接口 503，不裸奔', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const result = await callApi(store, { method: 'PUT', url: '/api/campus/pack-a', body: { id: 'pack-a' } })
    expect(result.status).toBe(503)
  })

  it('token 错了 401，对了能写盘', async () => {
    const dataDir = await seedDataDir()
    const store = new FilePackStore({ dataDir })
    const data = await store.readCampus('pack-a')

    const denied = await callApi(
      store,
      { method: 'PUT', url: '/api/campus/pack-a', body: data, token: 'wrong' },
      { token: 'secret' },
    )
    expect(denied.status).toBe(401)

    const allowed = await callApi(
      store,
      { method: 'PUT', url: '/api/campus/pack-a', body: data, token: 'secret' },
      { token: 'secret' },
    )
    expect(allowed.status).toBe(200)
  })

  it('非 /api 路径返回 false，交给静态托管', async () => {
    const req = { method: 'GET', url: '/index.html', headers: {} }
    const handled = await handleApiRequest(req as never, {} as never, { store: new MemoryPackStore() })
    expect(handled).toBe(false)
  })
})
