// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPackCampusData, savePackCampusData } from '../tools/campus-store.ts'
import type { CampusData } from '../src/data/campusData.ts'
import { CAMPUS_PATH, PACK_PATH } from '../vite-plugin-campus-api.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, 'fixtures/campus-api')
const packA = join(fixtureRoot, 'pack-a')
const packB = join(fixtureRoot, 'pack-b')

interface PackPaths {
  dir: string
  packPath: string
  campusPath: string
  backupDir: string
}

async function copyFixture(source: string, prefix: string): Promise<PackPaths> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  await cp(source, dir, { recursive: true })
  return {
    dir,
    packPath: join(dir, 'pack.json'),
    campusPath: join(dir, 'campus.json'),
    backupDir: join(dir, '.editor-backups'),
  }
}

async function readPack(pack: PackPaths): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(pack.packPath, 'utf8')) as Record<string, unknown>
}

async function readGeometry(pack: PackPaths): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(pack.campusPath, 'utf8')) as Record<string, unknown>
}

function ids(data: CampusData, key: 'zones' | 'buildings'): string[] {
  return data[key].map((entry) => entry.id)
}

const created: string[] = []

async function seedMergePacks(): Promise<{ a: PackPaths; b: PackPaths }> {
  const [a, b] = await Promise.all([
    copyFixture(packA, 'campus-api-pack-a-'),
    copyFixture(packB, 'campus-api-pack-b-'),
  ])
  created.push(a.dir, b.dir)
  return { a, b }
}

afterEach(async () => {
  while (created.length) {
    const dir = created.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('campus API fixture', () => {
  it('不指向真实 packs/usts-tianping，所有 fixture 都在 os.tmpdir()', async () => {
    const { a, b } = await seedMergePacks()
    expect(PACK_PATH).not.toBe(a.packPath)
    expect(PACK_PATH).not.toBe(b.packPath)
    expect(CAMPUS_PATH).not.toBe(a.campusPath)
    expect(CAMPUS_PATH).not.toBe(b.campusPath)
    expect(a.dir.startsWith(tmpdir())).toBe(true)
    expect(b.dir.startsWith(tmpdir())).toBe(true)
    expect(fixtureRoot.startsWith(tmpdir())).toBe(false)
  })
})

describe('campus API 读取：按 pack 合并', () => {
  let temp: { a: PackPaths; b: PackPaths }

  beforeEach(async () => {
    temp = await seedMergePacks()
  })

  it('单 pack 读取返回该 pack 的 entities', async () => {
    const data = await loadPackCampusData(temp.a.packPath, temp.a.campusPath)

    expect(data.name).toBe('Pack A')
    expect(data.bounds).toEqual({ width: 100, depth: 100 })
    expect(ids(data, 'zones')).toEqual(['zone-a'])
    expect(ids(data, 'buildings')).toEqual(['b-a'])
  })

  it('两个 pack 同时存在时，读取结果是两者合并', async () => {
    const [fromA, fromB] = await Promise.all([
      loadPackCampusData(temp.a.packPath, temp.a.campusPath),
      loadPackCampusData(temp.b.packPath, temp.b.campusPath),
    ])
    const merged: CampusData = {
      ...fromA,
      zones: [...fromA.zones, ...fromB.zones],
      buildings: [...fromA.buildings, ...fromB.buildings],
    }

    expect(ids(merged, 'zones')).toEqual(['zone-a', 'zone-b'])
    expect(ids(merged, 'buildings')).toEqual(['b-a', 'b-b'])
    expect(merged.zones.map((zone) => zone.footprint)).toEqual([
      fromA.zones[0].footprint,
      fromB.zones[0].footprint,
    ])
    expect(merged.buildings.map((building) => building.position)).toEqual([
      fromA.buildings[0].position,
      fromB.buildings[0].position,
    ])
  })
})

describe('campus API 保存：按 pack 拆分', () => {
  let temp: { a: PackPaths; b: PackPaths }

  beforeEach(async () => {
    temp = await seedMergePacks()
  })

  it('只写目标 pack 文件，其他 pack 字节不变', async () => {
    const beforePackA = await readFile(temp.a.packPath, 'utf8')
    const beforeCampusA = await readFile(temp.a.campusPath, 'utf8')
    const beforePackB = await readFile(temp.b.packPath, 'utf8')
    const beforeCampusB = await readFile(temp.b.campusPath, 'utf8')
    const data = await loadPackCampusData(temp.b.packPath, temp.b.campusPath)
    data.name = 'Pack B Saved'

    const result = await savePackCampusData(
      temp.b.packPath,
      temp.b.campusPath,
      temp.b.backupDir,
      data,
      '2026-11-20T00:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    expect(await readFile(temp.a.packPath, 'utf8')).toBe(beforePackA)
    expect(await readFile(temp.a.campusPath, 'utf8')).toBe(beforeCampusA)
    expect(await readFile(temp.b.packPath, 'utf8')).not.toBe(beforePackB)
    expect(await readFile(temp.b.campusPath, 'utf8')).not.toBe(beforeCampusB)
    expect((await readPack(temp.b)).name).toBe('Pack B Saved')
    expect(ids(await loadPackCampusData(temp.b.packPath, temp.b.campusPath), 'buildings')).toEqual(['b-b'])
  })

  it('只含 A pack 实体的 payload 不会写 B pack 目录', async () => {
    const fromA = await loadPackCampusData(temp.a.packPath, temp.a.campusPath)
    const beforeA = {
      pack: await readFile(temp.a.packPath, 'utf8'),
      campus: await readFile(temp.a.campusPath, 'utf8'),
    }
    const beforeB = {
      pack: await readFile(temp.b.packPath, 'utf8'),
      campus: await readFile(temp.b.campusPath, 'utf8'),
    }

    const result = await savePackCampusData(
      temp.a.packPath,
      temp.a.campusPath,
      temp.a.backupDir,
      fromA,
      '2026-11-20T00:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    expect(await readFile(temp.b.packPath, 'utf8')).toBe(beforeB.pack)
    expect(await readFile(temp.b.campusPath, 'utf8')).toBe(beforeB.campus)
    expect(await readdir(temp.b.backupDir).catch(() => [])).toEqual([])
    expect(await readFile(temp.a.packPath, 'utf8')).not.toBe(beforeA.pack)
    expect(await readFile(temp.a.campusPath, 'utf8')).not.toBe(beforeA.campus)
    expect(ids(await loadPackCampusData(temp.a.packPath, temp.a.campusPath), 'buildings')).toEqual(['b-a'])
  })

  it('实体从源 pack 移到目标 pack：源移除、目标追加', async () => {
    const fromA = await loadPackCampusData(temp.a.packPath, temp.a.campusPath)
    const fromB = await loadPackCampusData(temp.b.packPath, temp.b.campusPath)
    const movedBuilding = fromA.buildings[0]
    const movedZone = fromA.zones[0]

    await savePackCampusData(
      temp.a.packPath,
      temp.a.campusPath,
      temp.a.backupDir,
      { ...fromA, zones: [], buildings: [] },
      '2026-11-20T00:00:00.000Z',
    )

    const afterSourceSave = await loadPackCampusData(temp.a.packPath, temp.a.campusPath)
    expect(ids(afterSourceSave, 'zones')).toEqual([])
    expect(ids(afterSourceSave, 'buildings')).toEqual([])

    await savePackCampusData(
      temp.b.packPath,
      temp.b.campusPath,
      temp.b.backupDir,
      {
        ...fromB,
        zones: [...fromB.zones, movedZone],
        buildings: [...fromB.buildings, movedBuilding],
      },
      '2026-11-20T00:00:00.000Z',
    )

    const afterB = await loadPackCampusData(temp.b.packPath, temp.b.campusPath)

    expect(ids(afterB, 'zones')).toEqual(['zone-b', 'zone-a'])
    expect(ids(afterB, 'buildings')).toEqual(['b-b', 'b-a'])
    expect((await readGeometry(temp.a)).buildings).toEqual([])
    expect((await readGeometry(temp.b)).buildings).toEqual([fromB.buildings[0], movedBuilding])
  })
})
