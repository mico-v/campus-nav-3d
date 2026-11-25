// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAMPUS_PACK_SCHEMA } from '../packages/campus-schema/src/index'
import type { CampusFloor, FloorAwareCampusPack, FloorConnector } from '../src/data/pack-schema'
import { validateFloorPack } from '../src/data/pack-validate'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function basePack(): FloorAwareCampusPack {
  return {
    schema: CAMPUS_PACK_SCHEMA,
    id: 'demo-floors',
    name: '楼层测试校园',
    crs: 'local-meters',
    origin: { lat: 31.2, lng: 120.5 },
    bounds: { min: [-100, -100], max: [100, 100] },
    units: 'meter',
    license: 'CC-BY-SA-4.0',
    buildings: [
      {
        id: 'b-lib',
        name: '图书馆',
        footprint: [[0, 0], [20, 0], [20, 20], [0, 20]],
        height: 18,
      },
      {
        id: 'b-hall',
        name: '教学楼',
        footprint: [[40, 0], [60, 0], [60, 20], [40, 20]],
        height: 12,
      },
    ],
  }
}

function floor(level: number, name = `L${level}`): CampusFloor {
  return { level, name }
}

function connector(
  kind: FloorConnector['kind'],
  from: FloorConnector['from'],
  to: FloorConnector['to'],
  id = `conn-${kind}`,
): FloorConnector {
  return { id, from, to, kind }
}

function addFloors(pack: FloorAwareCampusPack): void {
  pack.buildings![0]!.floors = [floor(-1, 'B1'), floor(0, '1F'), floor(1, '2F')]
  pack.buildings![1]!.floors = [floor(0, '1F'), floor(1, '2F')]
}

function floorPack(): FloorAwareCampusPack {
  const pack = basePack()
  addFloors(pack)
  return pack
}

function codes(pack: unknown): string[] {
  return validateFloorPack(pack).issues.map((issue) => issue.code)
}

describe('M2-A floors / connectors 数据模型', () => {
  it('老 pack（无 floors / connectors）照旧通过，结果无变化', () => {
    const legacy = basePack()
    expect(validateFloorPack(legacy).issues).toEqual([])
    expect(validateFloorPack(legacy).ok).toBe(true)
  })

  it('fixture 目录只落在 os.tmpdir()，不污染真实 packs/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pack-floor-'))
    try {
      expect(dir.startsWith(tmpdir())).toBe(true)
      expect(join(repoRoot, 'packs')).not.toBe(dir)
      expect(dir).not.toContain(join(repoRoot, 'packs'))
      const pack = floorPack()
      pack.connectors = [connector('stairs', { building: 'b-lib', level: 0 }, { building: 'b-lib', level: 1 })]
      expect(validateFloorPack(pack).issues).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('合法 floors + 跨楼 connectors 通过，level 0 为一层、负数为地下', () => {
    const pack = floorPack()
    pack.connectors = [
      connector('stairs', { building: 'b-lib', level: -1 }, { building: 'b-lib', level: 0 }),
      connector('elevator', { building: 'b-lib', level: 0 }, { building: 'b-lib', level: 1 }),
      connector('ramp', { building: 'b-lib', level: 1 }, { building: 'b-hall', level: 1 }, 'skybridge'),
    ]
    expect(validateFloorPack(pack).issues).toEqual([])
  })

  it('规则 1：同楼 level 重复时拒绝', () => {
    const pack = floorPack()
    pack.buildings![0]!.floors = [floor(0), floor(0)]
    expect(codes(pack)).toContain('floor.level.duplicate')
  })

  it('规则 2a：from/to 引用不存在的建筑时拒绝', () => {
    const pack = floorPack()
    pack.connectors = [connector('stairs', { building: 'b-lib', level: 0 }, { building: 'b-missing', level: 0 })]
    expect(codes(pack)).toContain('connector.to.building.unknown')
  })

  it('规则 2b：from/to 引用不存在的楼层时拒绝', () => {
    const pack = floorPack()
    pack.connectors = [connector('elevator', { building: 'b-lib', level: 0 }, { building: 'b-hall', level: 2 })]
    expect(codes(pack)).toContain('connector.to.level.unknown')
  })

  it('规则 3：kind 不在枚举内时拒绝', () => {
    const pack = floorPack()
    pack.connectors = [connector('escalator' as FloorConnector['kind'], { building: 'b-lib', level: 0 }, { building: 'b-lib', level: 1 })]
    expect(codes(pack)).toContain('connector.kind')
  })

  it('规则 4：同一对端点 + kind 重复时拒绝，反向或不同 kind 合法', () => {
    const pack = floorPack()
    const from = { building: 'b-lib', level: 0 }
    const to = { building: 'b-lib', level: 1 }
    pack.connectors = [
      connector('stairs', from, to),
      connector('stairs', { ...from }, { ...to }, 'dup'),
    ]
    expect(codes(pack)).toContain('connector.kind.duplicate')

    const reversible = floorPack()
    reversible.connectors = [
      connector('stairs', from, to),
      connector('stairs', to, from, 'reverse'),
      connector('elevator', from, to, 'other-kind'),
    ]
    expect(validateFloorPack(reversible).issues).toEqual([])
  })

  it('老 pack 不带 rooms 时校验通过，行为与之前一致', () => {
    const pack = floorPack()
    expect(pack.buildings![0]!.floors![0]!.rooms).toBeUndefined()
    expect(validateFloorPack(pack).issues).toEqual([])
  })

  it('rooms.id 重复时报错，信息带建筑名与楼层', () => {
    const pack = floorPack()
    pack.buildings![0]!.floors![0]!.rooms = [
      { id: 'kfc', name: 'KFC' },
      { id: 'kfc', name: 'KFC 复制' },
    ]
    const issue = validateFloorPack(pack).issues.find((item) => item.code === 'room.id.duplicate')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('图书馆')
    expect(issue?.message).toContain('-1')
  })

  it('rooms.level 引用不存在的楼层时报错', () => {
    const pack = floorPack()
    pack.buildings![0]!.floors![0]!.rooms = [
      { id: 'ghost', name: '幽灵', level: 9 },
    ]
    const issue = validateFloorPack(pack).issues.find((item) => item.code === 'room.level.unknown')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('图书馆')
    expect(issue?.message).toContain('9')
  })

  it('合法 rooms（仅 id/name/kind，无 polygon）通过校验', () => {
    const pack = floorPack()
    pack.buildings![0]!.floors![0]!.rooms = [
      { id: 'kfc', name: 'KFC', kind: 'service' },
      { id: 'coffee', name: '咖啡', aliases: ['咖啡店'] },
    ]
    expect(validateFloorPack(pack).issues).toEqual([])
  })

  it('非法 floors 结构（数组/层名/足迹/层高）也能报出', () => {
    const pack = floorPack()
    pack.buildings![0]!.floors = 'not-array' as unknown as CampusFloor[]
    expect(codes(pack)).toContain('floors.invalid')

    const malformed = floorPack()
    malformed.buildings![0]!.floors = [
      { level: 0, name: '', footprint: [[0, 0]] as never, height: 0 },
    ]
    const found = codes(malformed)
    expect(found).toEqual(expect.arrayContaining(['floor.name', 'floor.footprint.invalid', 'floor.height']))
  })
})
