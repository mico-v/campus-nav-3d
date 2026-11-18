import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateCampusPack } from '../packages/campus-schema/src/index'
import { migrateCampusData } from '../packages/campus-schema/src/migrate'
import { createDefaultCampusData } from '../src/data/campusData'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as unknown
}

const legacy = readJson('src/data/campus.json') as Record<string, unknown[]>
const meta = readJson('packs/usts-tianping/pack.json')
const packData = readJson('packs/usts-tianping/campus.json') as {
  zones: Array<{ polygon: number[][]; category?: string; center?: number[]; size?: number[]; color?: string }>
  buildings: Array<{ footprint: number[][]; position: number[]; size: number[]; color?: string; zoneId?: string; category?: string }>
  roads: unknown[]
  waters: unknown[]
  fields: unknown[]
  trees: unknown[]
  pois: unknown[]
  roadNetwork: {
    nodes: Array<{ id: string; at: number[]; kind?: string; sourceIds?: string[] }>
    edges: Array<{ from: string; to: string; cost: number; centerline?: number[][]; width?: number }>
    segments?: unknown[]
  }
}

describe('M1-S3 数据迁入 packs/usts-tianping', () => {
  it('pack 数据合并 pack.json 后通过 campus-pack/2 校验', () => {
    const result = validateCampusPack({ ...(meta as Record<string, unknown>), ...packData })
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('数量与迁移前一致', () => {
    expect(packData.zones).toHaveLength(7)
    expect(packData.buildings).toHaveLength(75)
    expect(packData.roads).toHaveLength(14)
    expect(packData.waters).toHaveLength(2)
    expect(packData.fields).toHaveLength(5)
    expect(packData.trees).toHaveLength(0)
    expect(packData.pois).toHaveLength(0)
    expect(packData.roadNetwork.nodes).toHaveLength(39)
    expect(packData.roadNetwork.edges).toHaveLength(42)
    expect(packData.roadNetwork.segments).toHaveLength(42)
  })

  it('分区 footprint 改为 polygon，渲染提示字段原样保留', () => {
    legacy.zones.forEach((raw, index) => {
      const zone = packData.zones[index]
      const source = raw as { footprint?: number[][]; category: string; center: number[]; size: number[]; color: string }
      if (source.footprint) expect(zone.polygon).toEqual(source.footprint)
      expect(zone.category).toBe(source.category)
      expect(zone.center).toEqual(source.center)
      expect(zone.size).toEqual(source.size)
      expect(zone.color).toBe(source.color)
    })
  })

  it('建筑 footprint 由 position/size 生成逆时针矩形，提示字段保留', () => {
    legacy.buildings.forEach((raw, index) => {
      const source = raw as { position: number[]; size: number[]; footprint?: number[][]; height: number }
      const building = packData.buildings[index]
      const [x, z] = source.position
      const [width, depth] = source.size
      expect(building.position).toEqual(source.position)
      expect(building.size).toEqual(source.size)
      if (!source.footprint) {
        expect(building.footprint).toEqual([
          [x - width / 2, z - depth / 2],
          [x + width / 2, z - depth / 2],
          [x + width / 2, z + depth / 2],
          [x - width / 2, z + depth / 2],
        ])
      }
      if (!source.footprint) {
        let area = 0
        building.footprint.forEach(([px, pz], vertex) => {
          const [nx, nz] = building.footprint[(vertex + 1) % building.footprint.length]
          area += px * nz - nx * pz
        })
        expect(area).toBeGreaterThan(0)
      }
    })
  })

  it('道路 / 水体 / 场地 / 树木原样映射', () => {
    for (const key of ['roads', 'waters', 'fields', 'trees', 'pois'] as const) {
      expect(packData[key]).toEqual(legacy[key])
    }
  })

  it('路网节点 position → at，segments 同时保留在 edges 与 segments', () => {
    const raw = legacy.roadNetwork as unknown as {
      nodes: Array<{ position: number[]; kind?: string; sourceIds?: string[] }>
      segments: Array<Record<string, unknown>>
    }
    packData.roadNetwork.nodes.forEach((node, index) => {
      expect(node.at).toEqual(raw.nodes[index].position)
      expect(node.kind).toBe(raw.nodes[index].kind)
      expect(node.sourceIds).toEqual(raw.nodes[index].sourceIds)
    })
    packData.roadNetwork.edges.forEach((edge, index) => {
      const source = raw.segments[index]
      expect(edge.from).toBe(source.from)
      expect(edge.to).toBe(source.to)
      for (const key of ['kind', 'width', 'class', 'surface', 'access', 'centerline', 'sourceIds'] as const) {
        if (source[key] !== undefined) expect((edge as Record<string, unknown>)[key]).toEqual(source[key])
      }
      const centerline = source.centerline as number[][]
      const expected = centerline.slice(1).reduce((sum, point, pointIndex) => {
        const previous = centerline[pointIndex]
        return sum + Math.hypot(point[0] - previous[0], point[1] - previous[1])
      }, 0) || source.width
      expect(edge.cost).toBe(expected)
    })
    expect(packData.roadNetwork.segments).toEqual(raw.segments)
  })

  it('campus.json 不含 meta 字段，迁移函数输出与已落盘 pack 数据一致', () => {
    expect(Object.keys(packData)).not.toEqual(expect.arrayContaining(['schema', 'id', 'name', 'license', 'bounds']))
    expect(migrateCampusData(legacy)).toEqual(packData)
  })

  it('页面默认数据源来自 pack 且行为等价', () => {
    const data = createDefaultCampusData()
    expect(data.name).toBe((meta as { name: string }).name)
    expect(data.buildings).toHaveLength(75)
    expect(data.zones).toHaveLength(7)
    expect(data.roadNetwork.nodes.length).toBeGreaterThanOrEqual(39)
    expect(data.roadNetwork.segments.length).toBeGreaterThanOrEqual(42)
    expect(data.roads.filter((road) => road.id.startsWith('walk-')).length).toBeGreaterThanOrEqual(10)
  })
})
