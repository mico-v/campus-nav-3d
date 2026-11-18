import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  importOsmFromExport,
  OSM_ATTRIBUTION,
  OSM_LICENSE,
  polygonArea,
  slugify,
} from '../src/import-osm.ts'
import { validateCampusPack } from '../../campus-schema/src/index.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const fixture = join(root, 'packages/campus-cli/fixtures/osm-sample.json')
const osmExport = JSON.parse(readFileSync(fixture, 'utf8')) as unknown

function importSample(options: Parameters<typeof importOsmFromExport>[1] = {}) {
  return importOsmFromExport(osmExport, options)
}

function buildings(result: ReturnType<typeof importOsmFromExport>) {
  return (result.pack.buildings ?? []) as Array<Record<string, unknown>>
}

describe('campus-import osm', () => {
  it('fixture 是小于 50KB 的真实 Overpass 结构小片', () => {
    expect(statSync(fixture).size).toBeLessThan(50 * 1024)
    const value = osmExport as { version: number; elements: Array<{ type: string }> }
    expect(value.version).toBe(0.6)
    expect(value.elements.some((element) => element.type === 'node')).toBe(true)
    expect(value.elements.some((element) => element.type === 'way')).toBe(true)
  })

  it('从 fixture 抽出 4 个建筑轮廓，过滤小碎片', () => {
    const result = importSample()
    expect(result.stats.ways).toBe(5)
    expect(result.stats.kept).toBe(4)
    expect(result.stats.skippedSmallArea).toBe(1)
    expect(buildings(result)).toHaveLength(4)
  })

  it('过滤面积小于阈值的轮廓，阈值可配置', () => {
    const strict = importSample({ minArea: 2_000 })
    expect(strict.stats.kept).toBeLessThan(4)
    expect(strict.stats.skippedSmallArea).toBeGreaterThan(1)

    const loose = importSample({ minArea: 1 })
    expect(loose.stats.kept).toBe(5)
    expect(loose.stats.skippedSmallArea).toBe(0)
  })

  it('id 用 osm-<name-slug>-<wayId> 规则，稳定且为小写连字符', () => {
    const ids = buildings(importSample()).map((building) => building.id)
    expect(ids).toContain('osm-library-1001')
    expect(ids).toContain('osm-teaching-block-a-1002')
    expect(ids).toContain('osm-lab-3-1004')
    for (const id of ids) expect(id).toMatch(/^osm-[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/)
    expect(slugify('Teaching Block A')).toBe('teaching-block-a')
    expect(slugify('图书馆')).toBe('osm')
  })

  it('OSM 派生数据写 license 与 attribution（ODbL 1.0）', () => {
    const result = importSample()
    expect(result.pack.license).toBe(OSM_LICENSE)
    expect(OSM_LICENSE).toBe('ODbL-1.0')
    expect(result.pack.attribution).toEqual([OSM_ATTRIBUTION])
    expect(String(result.pack.attribution).toLowerCase()).toContain('openstreetmap contributors')
    expect(String(result.pack.attribution)).toContain('ODbL 1.0')
  })

  it('可追加 attribution，不丢 OSM 署名', () => {
    const result = importSample({ attribution: ['校内实测 2026'] })
    expect(result.pack.attribution).toEqual([OSM_ATTRIBUTION, '校内实测 2026'])
  })

  it('合并已有 pack 时不覆盖人工字段', () => {
    const base = {
      schema: 'campus-pack/2',
      id: 'demo',
      name: 'Demo',
      crs: 'local-meters',
      bounds: { min: [-100, -100], max: [100, 100] },
      units: 'meter',
      license: 'CC-BY-SA-4.0',
      attribution: ['既有署名'],
      buildings: [{
        id: 'osm-library-1001',
        name: '人工命名图书馆',
        footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
        height: 23.5,
        color: '#ff8800',
      }],
    }
    const result = importSample({ base })
    const library = buildings(result).find((building) => building.id === 'osm-library-1001')!
    expect(library.name).toBe('人工命名图书馆')
    expect(library.height).toBe(23.5)
    expect(library.color).toBe('#ff8800')
    expect(library.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]])
    expect(buildings(result)).toHaveLength(4)
    expect(result.pack.attribution).toEqual(['既有署名', OSM_ATTRIBUTION])
    expect(base.buildings).toHaveLength(1)
  })

  it('生成物通过 campus-pack/2 结构校验', () => {
    const base = {
      schema: 'campus-pack/2' as const,
      id: 'osm-fixture',
      name: 'OSM Fixture',
      crs: 'local-meters' as const,
      bounds: { min: [-100, -100], max: [100, 100] } as [number, number][] | { min: [number, number]; max: [number, number] },
      units: 'meter' as const,
      license: 'CC-BY-SA-4.0',
    }
    const result = importSample({ base })
    const validation = validateCampusPack(result.pack)
    expect(validation.issues).toEqual([])
    expect(validation.ok).toBe(true)
  })

  it('几何面积与重心计算正确', () => {
    expect(polygonArea([[0, 0], [10, 0], [10, 20], [0, 20]])).toBe(200)
    const first = buildings(importSample())[0]!
    expect(first.footprint).toHaveLength(4)
    expect(first.position).toHaveLength(2)
    expect((first.position as number[]).every(Number.isFinite)).toBe(true)
  })
})
