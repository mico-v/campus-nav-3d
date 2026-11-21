// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CAMPUS_PACK_SCHEMA } from '../packages/campus-schema/src/index'
import type { FloorAwareCampusPack, FloorConnector } from '../src/data/pack-schema'
import { FLOOR_ISSUE_CODES, validateFloorPack } from '../src/data/pack-validate'

function floorPack(): FloorAwareCampusPack {
  return {
    schema: CAMPUS_PACK_SCHEMA,
    id: 'demo-connector-check',
    name: '竖向连接校验测试校园',
    crs: 'local-meters',
    origin: { lat: 31.2, lng: 120.5 },
    bounds: { min: [-100, -100], max: [100, 100] },
    units: 'meter',
    license: 'CC-BY-SA-4.0',
    buildings: [
      {
        id: 'lib',
        name: '图书馆',
        footprint: [[0, 0], [20, 0], [20, 20], [0, 20]],
        height: 18,
        floors: [
          { level: -1, name: 'B1' },
          { level: 0, name: '1F' },
          { level: 1, name: '2F' },
        ],
      },
      {
        id: 'hall',
        name: '教学楼',
        footprint: [[40, 0], [60, 0], [60, 20], [40, 20]],
        height: 12,
        floors: [
          { level: 0, name: '1F' },
          { level: 1, name: '2F' },
        ],
      },
    ],
  }
}

function connector(
  id: string,
  from: FloorConnector['from'],
  to: FloorConnector['to'],
  kind: FloorConnector['kind'] = 'stairs',
): FloorConnector {
  return { id, from, to, kind }
}

function issueOf(pack: FloorAwareCampusPack, code: string) {
  return validateFloorPack(pack).issues.find((issue) => issue.code === code)
}

describe('M2-A 竖向连接表：端点存在 / 去重 / 跨楼合法', () => {
  it('跨楼连廊与楼内楼梯同时存在时通过（level 0 为一层，负数为地下）', () => {
    const pack = floorPack()
    pack.connectors = [
      connector('b1-to-1f', { building: 'lib', level: -1 }, { building: 'lib', level: 0 }),
      connector('skybridge', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }, 'elevator'),
      connector('ramp-1f', { building: 'hall', level: 0 }, { building: 'hall', level: 1 }, 'ramp'),
      connector('reverse', { building: 'hall', level: 1 }, { building: 'lib', level: 1 }),
    ]
    expect(validateFloorPack(pack).issues).toEqual([])
  })

  it('跨楼连接按目标楼自己的 floors 校验楼层，不套用来源楼', () => {
    const pack = floorPack()
    // lib 有 -1，hall 没有；-1 出现在 to 侧必须报 hall 缺层。
    pack.connectors = [connector('bad-cross', { building: 'lib', level: -1 }, { building: 'hall', level: -1 })]
    const issue = issueOf(pack, FLOOR_ISSUE_CODES.connectorToLevelUnknown)
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('connectors[0].to.level')
    expect(issue?.message).toContain('hall')
    expect(issue?.message).toContain('-1')
  })

  it('from/to 引用不存在的建筑：双侧都报错，并指明是哪一侧', () => {
    const pack = floorPack()
    pack.connectors = [connector('ghost', { building: 'ghost-from', level: 0 }, { building: 'ghost-to', level: 0 })]
    const issues = validateFloorPack(pack).issues
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorFromBuildingUnknown, path: 'connectors[0].from.building' }),
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorToBuildingUnknown, path: 'connectors[0].to.building' }),
    ]))
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorFromBuildingUnknown)?.message).toContain('ghost-from')
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorToBuildingUnknown)?.message).toContain('ghost-to')
  })

  it('from/to 引用不存在的楼层：双侧都报错，并指明楼层', () => {
    const pack = floorPack()
    pack.connectors = [connector('bad-level', { building: 'lib', level: 9 }, { building: 'hall', level: 8 })]
    const issues = validateFloorPack(pack).issues
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorFromLevelUnknown, path: 'connectors[0].from.level' }),
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorToLevelUnknown, path: 'connectors[0].to.level' }),
    ]))
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorFromLevelUnknown)?.message).toContain('9')
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorToLevelUnknown)?.message).toContain('8')
  })

  it('端点形状非法或 level 非整数时给出独立错误信息，不与「楼层不存在」混淆', () => {
    const pack = floorPack()
    pack.connectors = [
      { id: 'shape', from: null, to: { building: '', level: 1.5 }, kind: 'stairs' } as unknown as FloorConnector,
    ]
    const issues = validateFloorPack(pack).issues
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorFromInvalid, path: 'connectors[0].from' }),
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorToBuilding, path: 'connectors[0].to.building' }),
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorToLevel, path: 'connectors[0].to.level' }),
    ]))
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorFromInvalid)?.message).toContain('from')
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorToLevel)?.message).toContain('整数')
    expect(issues.map((issue) => issue.code)).not.toContain(FLOOR_ISSUE_CODES.connectorToLevelUnknown)
  })

  it('同一对楼层同一种 kind 重复时报错，信息含端点、kind 与首条 id', () => {
    const pack = floorPack()
    pack.connectors = [
      connector('stairs-main', { building: 'lib', level: 0 }, { building: 'lib', level: 1 }),
      connector('stairs-copy', { building: 'lib', level: 0 }, { building: 'lib', level: 1 }),
    ]
    const issue = issueOf(pack, FLOOR_ISSUE_CODES.connectorKindDuplicate)
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('connectors[1]')
    expect(issue?.message).toContain('stairs-main')
    expect(issue?.message).toContain('stairs')
  })

  it('跨楼同层同 kind 重复也按端点去重；反向与不同 kind 仍合法', () => {
    const duplicate = floorPack()
    duplicate.connectors = [
      connector('bridge-a', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }, 'elevator'),
      connector('bridge-b', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }, 'elevator'),
    ]
    expect(issueOf(duplicate, FLOOR_ISSUE_CODES.connectorKindDuplicate)).toBeDefined()

    const allowed = floorPack()
    allowed.connectors = [
      connector('bridge-a', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }, 'elevator'),
      connector('bridge-back', { building: 'hall', level: 1 }, { building: 'lib', level: 1 }, 'elevator'),
      connector('bridge-stairs', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }),
    ]
    expect(validateFloorPack(allowed).issues).toEqual([])
  })

  it('连接 id 重复单独报错，不吞掉端点与 kind 的校验', () => {
    const pack = floorPack()
    pack.connectors = [
      connector('dup-id', { building: 'lib', level: 0 }, { building: 'lib', level: 1 }),
      connector('dup-id', { building: 'lib', level: 1 }, { building: 'hall', level: 1 }, 'ramp'),
    ]
    const issues = validateFloorPack(pack).issues
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FLOOR_ISSUE_CODES.connectorIdDuplicate, path: 'connectors[1].id' }),
    ]))
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorIdDuplicate)?.message).toContain('dup-id')
    expect(issues.map((issue) => issue.code)).not.toContain(FLOOR_ISSUE_CODES.connectorKindDuplicate)
  })

  it('kind 非法与 connectors 非数组仍给出可读错误信息', () => {
    const badKind = floorPack()
    badKind.connectors = [
      connector('escalator', { building: 'lib', level: 0 }, { building: 'lib', level: 1 }, 'escalator' as FloorConnector['kind']),
    ]
    const kindIssue = issueOf(badKind, FLOOR_ISSUE_CODES.connectorKind)
    expect(kindIssue?.message).toContain('stairs')
    expect(kindIssue?.message).toContain('elevator')
    expect(kindIssue?.message).toContain('ramp')

    const notArray = floorPack()
    notArray.connectors = {} as unknown as FloorConnector[]
    expect(issueOf(notArray, FLOOR_ISSUE_CODES.connectorsInvalid)?.message).toContain('数组')
  })

  it('老 pack 不带 floors / connectors 时结果保持不变', () => {
    const legacy = floorPack()
    delete legacy.buildings![0]!.floors
    delete legacy.buildings![1]!.floors
    delete legacy.connectors
    expect(validateFloorPack(legacy).issues).toEqual([])
    expect(validateFloorPack(legacy).ok).toBe(true)
  })

  it('所有 M2-A 问题的 message 都非空且带具体上下文', () => {
    const pack = floorPack()
    pack.connectors = [
      connector('ghost', { building: 'ghost', level: -7 }, { building: 'hall', level: 2 }, 'escalator' as FloorConnector['kind']),
      connector('ghost', { building: 'ghost', level: -7 }, { building: 'hall', level: 2 }, 'escalator' as FloorConnector['kind']),
    ]
    const issues = validateFloorPack(pack).issues
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(issue.message.trim().length).toBeGreaterThan(0)
    }
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorFromBuildingUnknown)?.message).toContain('ghost')
    expect(issueOf(pack, FLOOR_ISSUE_CODES.connectorIdDuplicate)?.message).toContain('ghost')
  })
})
