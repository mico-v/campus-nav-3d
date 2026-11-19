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
    // pack 的 zone 几何存在 `polygon`，编辑器/主应用的契约字段是 `footprint`
    expect(data.zones.map((zone) => zone.footprint)).toEqual(
      geometry.zones.map((zone: { polygon?: unknown; footprint?: unknown }) => zone.polygon ?? zone.footprint),
    )
    for (const zone of data.zones) expect('polygon' in zone).toBe(false)
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
    // zone 以 `polygon` 写回 pack：footprint 优先，缺少 footprint 时按 center/size 补矩形
    const zones = campus.zones as Array<Record<string, unknown>>
    expect(zones).toHaveLength((data.zones as unknown[]).length)
    expect(zones[0].id).toBe('z1')
    expect(zones[0].polygon).toEqual([[-50, -25], [50, -25], [50, 25], [-50, 25]])
    for (const zone of zones) expect('footprint' in zone).toBe(false)
    expect('name' in campus).toBe(false)
    expect('bounds' in campus).toBe(false)
  })

  it('zone 几何往返不变：GET 的 footprint 存回 pack 仍是同一个 polygon', async () => {
    const data = await loadPackCampusData(packPath, campusPath)
    const polygonsOf = async (): Promise<unknown[]> =>
      (JSON.parse(await readFile(campusPath, 'utf8')).zones as Array<Record<string, unknown>>).map((zone) => zone.polygon)
    const before = await polygonsOf()

    await savePackCampusData(packPath, campusPath, backupDir, data, '2026-11-19T00:00:00.000Z')

    expect(await polygonsOf()).toEqual(before)
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

/**
 * Pack 里的树木是 `CampusTree` 对象（`{ id, at }`，可带 radius/color），
 * 编辑器与 `CampusData.trees` 用的是裸坐标 `[x, z]`。
 * 这两层必须双向转换，否则编辑器一存就把树写成坐标数组，主应用按 `.at` 读会全变 undefined。
 */
describe('pack 树木：CampusTree 对象 <-> 编辑器坐标', () => {
  let dir: string
  let packPath: string
  let campusPath: string
  let backupDir: string

  const packTrees = [
    { id: 'tree-1', at: [12.5, -8], radius: 3, color: '#2f7d32' },
    { id: 'tree-7', at: [-40, 22.5] },
  ]

  async function seed(trees: unknown[]): Promise<void> {
    await writeFile(packPath, await readFile(realPackPath, 'utf8'), 'utf8')
    const geometry = JSON.parse(await readFile(realCampusPath, 'utf8'))
    await writeFile(campusPath, JSON.stringify({ ...geometry, trees }, null, 2) + '\n', 'utf8')
  }

  async function readCampusTrees(): Promise<unknown[]> {
    return JSON.parse(await readFile(campusPath, 'utf8')).trees as unknown[]
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'campus-pack-trees-'))
    packPath = join(dir, 'pack.json')
    campusPath = join(dir, 'campus.json')
    backupDir = join(dir, '.editor-backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('GET 把 CampusTree 对象摊平成编辑器坐标，且通过 CampusData 校验', async () => {
    await seed(packTrees)
    const data = await loadPackCampusData(packPath, campusPath)
    expect(data.trees).toEqual([[12.5, -8], [-40, 22.5]])
  })

  it('GET 兼容已经是坐标数组的 campus（历史 fixture / 手写 pack）', async () => {
    await seed([[1, 2], [3, 4]])
    const data = await loadPackCampusData(packPath, campusPath)
    expect(data.trees).toEqual([[1, 2], [3, 4]])
  })

  it('GET 遇到坏树直接报错，并指出下标', async () => {
    await seed([{ id: 'tree-1', at: [1, 2] }, { id: 'broken' }])
    await expect(loadPackCampusData(packPath, campusPath)).rejects.toThrow(/trees\[1\]/)
  })

  it('PUT 未改坐标时原样回写 CampusTree（id/radius/color 全部保留）', async () => {
    await seed(packTrees)
    const data = await loadPackCampusData(packPath, campusPath)
    await savePackCampusData(packPath, campusPath, backupDir, data, '2026-11-19T00:00:00.000Z')
    expect(await readCampusTrees()).toEqual(packTrees)
  })

  it('PUT 移动一棵树时保留未动的对象，新位置按 tree-N 递增补 id', async () => {
    await seed(packTrees)
    const data = await loadPackCampusData(packPath, campusPath)
    data.trees = [[12.5, -8], [300, 300]]

    await savePackCampusData(packPath, campusPath, backupDir, data, '2026-11-19T00:00:00.000Z')
    const trees = await readCampusTrees()

    // 没动的那棵原封不动
    expect(trees[0]).toEqual(packTrees[0])
    // 挪走的那棵按已有最大 id（tree-7）继续编号
    expect(trees[1]).toEqual({ id: 'tree-8', at: [300, 300] })
  })

  it('PUT -> GET 往返后编辑器拿到的坐标与提交一致', async () => {
    await seed(packTrees)
    const data = await loadPackCampusData(packPath, campusPath)
    data.trees = [[0, 0], [-40, 22.5], [5, 5]]
    await savePackCampusData(packPath, campusPath, backupDir, data, '2026-11-19T00:00:00.000Z')

    const reloaded = await loadPackCampusData(packPath, campusPath)
    expect(reloaded.trees).toEqual(data.trees)
    // 写回 pack 的仍是对象形态，主应用（按 .at 读）不会拿到 undefined
    for (const tree of await readCampusTrees() as Array<Record<string, unknown>>) {
      expect(typeof tree.id).toBe('string')
      expect(Array.isArray(tree.at)).toBe(true)
    }
  })
})
