// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPackCampusData, savePackCampusData } from './campus-store'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const realPackPath = join(repoRoot, 'packs/usts-tianping/pack.json')
const realCampusPath = join(repoRoot, 'packs/usts-tianping/campus.json')

function minimalData(): Record<string, unknown> {
  return {
    name: 'Fixture Campus',
    bounds: { width: 100, depth: 50 },
    zones: [{ id: 'z1', name: 'zone', category: 'academic', center: [0, 0], size: [100, 50], color: '#ffffff' }],
    buildings: [{ id: 'b1', name: 'B1', category: 'academic', position: [0, 0], size: [10, 10], height: 12, zoneId: 'z1' }],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

describe('pack 读写：GET 合并 / PUT 拆分', () => {
  let dir: string
  let packPath: string
  let campusPath: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'campus-pack-store-'))
    packPath = join(dir, 'pack.json')
    campusPath = join(dir, 'campus.json')
    backupDir = join(dir, '.editor-backups')
    await writeFile(packPath, await readFile(realPackPath, 'utf8'), 'utf8')
    await writeFile(campusPath, await readFile(realCampusPath, 'utf8'), 'utf8')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('GET 合并 meta 与几何，含 crs/origin/bounds 和 75 栋建筑', async () => {
    const data = await loadPackCampusData(packPath, campusPath)
    const meta = JSON.parse(await readFile(packPath, 'utf8'))
    const geometry = JSON.parse(await readFile(campusPath, 'utf8'))

    expect(data.name).toBe(meta.name)
    expect(data.bounds).toEqual({ width: 3070, depth: 1530 })
    expect(data.buildings.length).toBe(75)
    expect(data.buildings).toEqual(geometry.buildings)
    expect(data.zones).toEqual(geometry.zones)
    // meta 字段不泄漏进 CampusData 结果
    expect('crs' in data).toBe(false)
    expect('origin' in data).toBe(false)
  })

  it('PUT 只改 meta.name/bounds 与几何字段，pack 不含几何键', async () => {
    const data = minimalData()
    data.name = 'Renamed Campus'
    const result = await savePackCampusData(packPath, campusPath, backupDir, data, '2026-11-19T00:00:00.000Z')

    expect(result.ok).toBe(true)
    const pack = JSON.parse(await readFile(packPath, 'utf8'))
    const campus = JSON.parse(await readFile(campusPath, 'utf8'))

    expect(pack.name).toBe('Renamed Campus')
    expect(pack.bounds).toEqual({ min: [-1535, -765], max: [-1435, -715] })
    expect(pack.crs).toBe('local-meters')
    expect(pack.origin).toBeTruthy()
    for (const key of ['zones', 'buildings', 'roads', 'waters', 'fields', 'trees', 'pois', 'roadNetwork']) {
      expect(key in pack).toBe(false)
    }

    expect(campus.buildings).toEqual(data.buildings)
    expect(campus.zones).toEqual(data.zones)
    expect('name' in campus).toBe(false)
    expect('bounds' in campus).toBe(false)
  })

  it('PUT 保留两份备份，且失败时原文件不变', async () => {
    const originalPack = await readFile(packPath, 'utf8')
    await savePackCampusData(packPath, campusPath, backupDir, minimalData(), '2026-11-19T00:00:00.000Z')
    const backups = await readdir(backupDir)
    expect(backups.some((name) => name.startsWith('pack-'))).toBe(true)
    expect(backups.some((name) => name.startsWith('campus-'))).toBe(true)

    const before = await readFile(packPath, 'utf8')
    const invalid = minimalData()
    delete invalid.buildings
    await expect(savePackCampusData(packPath, campusPath, backupDir, invalid, '2026-11-19T01:00:00.000Z')).rejects.toThrow()
    expect(await readFile(packPath, 'utf8')).toBe(before)
    expect(backupDir.startsWith(dir)).toBe(true)
    expect(originalPack.length).toBeGreaterThan(0)
  })
})
