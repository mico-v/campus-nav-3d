import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CAMPUS_PACK_SCHEMA,
  isCampusPack,
  validateCampusPack,
  type CampusPack,
} from '../packages/campus-schema/src/index'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as unknown
}

function basePack(): CampusPack {
  return {
    schema: CAMPUS_PACK_SCHEMA,
    id: 'demo-empty',
    name: '最小示例校园',
    crs: 'local-meters',
    origin: { lat: 31.2, lng: 120.5 },
    bounds: { min: [-100, -100], max: [100, 100] },
    units: 'meter',
    license: 'CC-BY-SA-4.0',
    zones: [
      {
        id: 'central',
        name: '中心区',
        polygon: [
          [0, 0],
          [50, 0],
          [50, 50],
          [0, 50],
        ],
      },
    ],
    buildings: [
      {
        id: 'b-library',
        name: '图书馆',
        category: 'library',
        footprint: [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
        ],
        height: 18,
        levels: [
          {
            index: 1,
            name: '1F',
            elevation: 0,
            height: 4.5,
            verticals: [{ id: 'st-a', kind: 'stairs', at: [1, 1], to: 2 }],
          },
          { index: 2, name: '2F', elevation: 4.5, height: 4.5 },
        ],
      },
    ],
    roadNetwork: {
      nodes: [
        { id: 'n1', at: [0, 0] },
        { id: 'n2', at: [10, 0] },
      ],
      edges: [{ from: 'n1', to: 'n2', cost: 10 }],
    },
    pois: [{ id: 'p-gate', name: '东门', at: [90, 0], building: null }],
  }
}

function issueCodes(pack: unknown): string[] {
  return validateCampusPack(pack).issues.map((issue) => issue.code)
}

describe('campus-pack/2 schema 文件', () => {
  it('JSON Schema 文件存在且声明了 v2 标题与必填字段', () => {
    const schema = readJson('packages/campus-schema/schema/campus-pack-2.json') as {
      title: string
      required: string[]
      $defs: Record<string, unknown>
    }
    expect(schema.title).toBe('Campus Pack v2')
    expect(schema.required).toContain('schema')
    expect(schema.required).toContain('bounds')
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining(['building', 'level', 'roadNetwork', 'poi']),
    )
  })

  it('仓内 usts-tianping 的 pack.json 通过校验', () => {
    const pack = readJson('packs/usts-tianping/pack.json')
    const result = validateCampusPack(pack)
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })
})

describe('campus-pack/2 校验器', () => {
  it('完整的最小包通过校验，并通过类型守卫', () => {
    const pack = basePack()
    expect(validateCampusPack(pack).issues).toEqual([])
    expect(isCampusPack(pack)).toBe(true)
  })

  it('缺 schema 或版本不对时拒绝，报 meta.schema', () => {
    const pack = { ...basePack(), schema: 'campus-pack/1' } as unknown
    expect(issueCodes(pack)).toContain('meta.schema')
  })

  it('id 不是小写连字符 slug 时拒绝，报 meta.id', () => {
    const pack = { ...basePack(), id: 'Demo_Empty' } as unknown
    const codes = issueCodes(pack)
    expect(codes).toContain('meta.id')
  })

  it('bounds 的 min 不小于 max 时拒绝', () => {
    const pack = { ...basePack(), bounds: { min: [100, 0], max: [0, 100] } } as unknown
    expect(issueCodes(pack)).toContain('bounds.not-increasing')
  })

  it('坐标含非有限数时拒绝，并指出具体顶点路径', () => {
    const pack = basePack()
    pack.buildings![0]!.footprint = [
      [0, 0],
      [Number.NaN, 0],
      [20, 20],
    ]
    const result = validateCampusPack(pack)
    const issue = result.issues.find((entry) => entry.code === 'point.invalid')
    expect(issue?.path).toBe('buildings[0].footprint[1]')
  })

  it('楼层 elevation 不严格递增时拒绝', () => {
    const pack = basePack()
    pack.buildings![0]!.levels = [
      { index: 1, name: '1F', elevation: 4.5, height: 4.5 },
      { index: 2, name: '2F', elevation: 4.5, height: 4.5 },
    ]
    expect(issueCodes(pack)).toContain('level.elevation.order')
  })

  it('建筑 id 重复时报 building.id.duplicate', () => {
    const pack = basePack()
    pack.buildings = [pack.buildings![0]!, { ...pack.buildings![0]! }]
    expect(issueCodes(pack)).toContain('building.id.duplicate')
  })

  it('路网边指向不存在的节点时报 unknown', () => {
    const pack = basePack()
    pack.roadNetwork!.edges = [{ from: 'n1', to: 'n9' }]
    expect(issueCodes(pack)).toContain('roadEdge.to.unknown')
  })

  it('POI 引用了不存在的建筑时报 poi.building.unknown', () => {
    const pack = basePack()
    pack.pois = [{ id: 'p-gate', name: '东门', at: [90, 0], building: 'b-nowhere' }]
    expect(issueCodes(pack)).toContain('poi.building.unknown')
  })

  it('竖向连接指向自己所在楼层时报 vertical.to.self', () => {
    const pack = basePack()
    pack.buildings![0]!.levels![0]!.verticals = [{ id: 'st-a', kind: 'stairs', at: [1, 1], to: 1 }]
    expect(issueCodes(pack)).toContain('vertical.to.self')
  })

  it('非对象输入返回单条 pack.invalid，不抛异常', () => {
    expect(issueCodes('not a pack')).toEqual(['pack.invalid'])
    expect(issueCodes(null)).toEqual(['pack.invalid'])
  })

  it('带渲染提示的旧结构（roads / waters / fields / trees）能通过', () => {
    const pack: CampusPack = {
      ...basePack(),
      zones: [
        {
          id: 'central',
          name: '中心区',
          category: 'academic',
          polygon: [
            [0, 0],
            [50, 0],
            [50, 50],
          ],
          center: [25, 25],
          size: [50, 50],
          color: '#eef7dd',
        },
      ],
      buildings: [
        {
          id: 'b-library',
          name: '图书馆',
          footprint: [
            [0, 0],
            [20, 0],
            [20, 20],
          ],
          height: 18,
          position: [10, 10],
          size: [20, 20],
          color: '#dbe4f0',
          zoneId: 'central',
        },
      ],
      roads: [{ id: 'road-10', points: [[0, 0], [10, 10]], width: 3.2, kind: 'road', sourceIds: ['road-10'] }],
      waters: [
        { id: 'osm-water-1', name: '湖', center: [5, 5], size: [10, 10], color: '#7dd3fc', footprint: [[0, 0], [10, 0], [10, 10]] },
      ],
      fields: [
        { id: 'osm-field-1', name: 'basketball', footprint: [[0, 0], [5, 0], [5, 5]], center: [2.5, 2.5], size: [5, 5], color: '#38bdf8', stripeColor: '#bbf7d0' },
      ],
      trees: [{ id: 'tree-1', at: [1, 1], radius: 1.5, color: '#2f7d32' }],
      roadNetwork: {
        nodes: [
          { id: 'n1', at: [0, 0], kind: 'waypoint', sourceIds: ['road-10'] },
          { id: 'n2', at: [10, 0] },
        ],
        edges: [
          {
            from: 'n1',
            to: 'n2',
            width: 3.2,
            class: 'walkway',
            surface: 'concrete',
            access: { pedestrian: true, bicycle: true },
            centerline: [[0, 0], [10, 0]],
            sourceIds: ['road-10'],
          },
        ],
        segments: [{ id: 'road-10--1', from: 'n1', to: 'n2' }],
      },
    }
    expect(validateCampusPack(pack).issues).toEqual([])
  })

  it('道路折线不足两点、颜色非十六进制、size 非正数时均报错', () => {
    const pack = basePack() as CampusPack
    pack.roads = [{ id: 'road-10', points: [[0, 0]] }]
    pack.fields = [
      { id: 'osm-field-1', name: 'basketball', footprint: [[0, 0], [5, 0], [5, 5]], color: 'blue' },
    ]
    pack.buildings![0]!.size = [-1, 20]
    const codes = issueCodes(pack)
    expect(codes).toContain('polygon.too-few-vertices')
    expect(codes).toContain('color.invalid')
    expect(codes).toContain('building.size')
  })
})
