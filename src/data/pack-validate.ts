/**
 * M2-A：在既有 campus-pack/2 结构校验之上，校验可选的 floors / connectors。
 *
 * 老 pack 不带这两个字段时，结果与 `validateCampusPack` 完全一致。
 * 这里只报结构问题，不做几何面积、可达性等语义检查。
 */
import { validateCampusPack } from '../../packages/campus-schema/src/index'
import type { PackIssue, PackValidationResult, Point } from '../../packages/campus-schema/src/index'
import { FLOOR_CONNECTOR_KINDS, type FloorConnectorKind } from './pack-schema'

type UnknownRecord = Record<string, unknown>

interface FloorIndex {
  buildingIds: Set<string>
  levelsByBuilding: Map<string, Set<number>>
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
}

function isPolygon(value: unknown): value is Point[] {
  return Array.isArray(value) && value.length >= 3 && value.every(isPoint)
}

/** 校验问题的稳定 code，调用方和测试按这些 code 分组、断言。 */
export const FLOOR_ISSUE_CODES = {
  floorsInvalid: 'floors.invalid',
  floorInvalid: 'floor.invalid',
  floorLevelInvalid: 'floor.level.invalid',
  floorLevelDuplicate: 'floor.level.duplicate',
  floorName: 'floor.name',
  floorFootprintInvalid: 'floor.footprint.invalid',
  floorHeight: 'floor.height',
  connectorsInvalid: 'connectors.invalid',
  connectorInvalid: 'connector.invalid',
  connectorId: 'connector.id',
  connectorIdDuplicate: 'connector.id.duplicate',
  connectorKind: 'connector.kind',
  connectorPosition: 'connector.position',
  connectorKindDuplicate: 'connector.kind.duplicate',
  connectorFromInvalid: 'connector.from.invalid',
  connectorToInvalid: 'connector.to.invalid',
  connectorFromBuilding: 'connector.from.building',
  connectorToBuilding: 'connector.to.building',
  connectorFromLevel: 'connector.from.level',
  connectorToLevel: 'connector.to.level',
  connectorFromBuildingUnknown: 'connector.from.building.unknown',
  connectorToBuildingUnknown: 'connector.to.building.unknown',
  connectorFromLevelUnknown: 'connector.from.level.unknown',
  connectorToLevelUnknown: 'connector.to.level.unknown',
} as const

/** code → 人话模板；错误文案集中一处，避免各处拼出不一致或空泛的信息。 */
const FLOOR_ISSUE_MESSAGES: Record<string, (context: Record<string, string | number>) => string> = {
  [FLOOR_ISSUE_CODES.floorsInvalid]: () => 'floors 必须是数组',
  [FLOOR_ISSUE_CODES.floorInvalid]: () => '楼层必须是对象',
  [FLOOR_ISSUE_CODES.floorLevelInvalid]: () => 'level 必须是整数（0 为一层，负数为地下）',
  [FLOOR_ISSUE_CODES.floorLevelDuplicate]: ({ level }) => `楼内 level 重复：${level}`,
  [FLOOR_ISSUE_CODES.floorName]: () => 'name 不能为空',
  [FLOOR_ISSUE_CODES.floorFootprintInvalid]: () => 'footprint 至少需要 3 个有限坐标点',
  [FLOOR_ISSUE_CODES.floorHeight]: () => 'height 必须大于 0',
  [FLOOR_ISSUE_CODES.connectorsInvalid]: () => 'connectors 必须是数组',
  [FLOOR_ISSUE_CODES.connectorInvalid]: () => '连接必须是对象',
  [FLOOR_ISSUE_CODES.connectorId]: () => 'id 不能为空（建议小写连字符 slug）',
  [FLOOR_ISSUE_CODES.connectorIdDuplicate]: ({ id }) => `连接 id 重复：${id}`,
  [FLOOR_ISSUE_CODES.connectorKind]: ({ kinds }) => `kind 只能是 ${kinds}`,
  [FLOOR_ISSUE_CODES.connectorPosition]: () => 'position 必须是两个有限数字',
  [FLOOR_ISSUE_CODES.connectorKindDuplicate]: ({ endpoint, kind, id }) =>
    `同一对楼层 ${endpoint} 的 ${kind} 连接重复（已有连接 ${id}）`,
  [FLOOR_ISSUE_CODES.connectorFromInvalid]: () => 'from 必须是 { building, level }',
  [FLOOR_ISSUE_CODES.connectorToInvalid]: () => 'to 必须是 { building, level }',
  [FLOOR_ISSUE_CODES.connectorFromBuilding]: () => 'from.building 不能为空',
  [FLOOR_ISSUE_CODES.connectorToBuilding]: () => 'to.building 不能为空',
  [FLOOR_ISSUE_CODES.connectorFromLevel]: () => 'from.level 必须是整数（0 为一层，负数为地下）',
  [FLOOR_ISSUE_CODES.connectorToLevel]: () => 'to.level 必须是整数（0 为一层，负数为地下）',
  [FLOOR_ISSUE_CODES.connectorFromBuildingUnknown]: ({ building }) => `from 引用的建筑不存在：${building}`,
  [FLOOR_ISSUE_CODES.connectorToBuildingUnknown]: ({ building }) => `to 引用的建筑不存在：${building}`,
  [FLOOR_ISSUE_CODES.connectorFromLevelUnknown]: ({ endpoint }) => `from 引用的楼层不存在：${endpoint}`,
  [FLOOR_ISSUE_CODES.connectorToLevelUnknown]: ({ endpoint }) => `to 引用的楼层不存在：${endpoint}`,
}

function add(
  issues: PackIssue[],
  path: string,
  code: string,
  context: Record<string, string | number> = {},
): void {
  const message = FLOOR_ISSUE_MESSAGES[code]?.(context) ?? '校验失败'
  issues.push({ path, code, message })
}

/** 遍历建筑，顺带收集楼层号索引，供 connectors 引用检查复用。 */
function indexBuildings(buildings: unknown, issues: PackIssue[]): FloorIndex {
  const index: FloorIndex = {
    buildingIds: new Set(),
    levelsByBuilding: new Map(),
  }
  if (!Array.isArray(buildings)) return index

  buildings.forEach((building, buildingIndex) => {
    if (!isRecord(building)) return
    const buildingPath = `buildings[${buildingIndex}]`
    const id = isNonEmptyString(building.id) ? building.id : null
    if (id) index.buildingIds.add(id)

    const floors = building.floors
    if (floors === undefined) return
    const levels = new Set<number>()
    if (id) index.levelsByBuilding.set(id, levels)
    if (!Array.isArray(floors)) {
      add(issues, `${buildingPath}.floors`, FLOOR_ISSUE_CODES.floorsInvalid)
      return
    }

    floors.forEach((floor, floorIndex) => {
      const path = `${buildingPath}.floors[${floorIndex}]`
      if (!isRecord(floor)) {
        add(issues, path, FLOOR_ISSUE_CODES.floorInvalid)
        return
      }
      if (!isInteger(floor.level)) {
        add(issues, `${path}.level`, FLOOR_ISSUE_CODES.floorLevelInvalid)
      } else {
        if (levels.has(floor.level)) {
          add(issues, `${path}.level`, FLOOR_ISSUE_CODES.floorLevelDuplicate, { level: floor.level })
        }
        levels.add(floor.level)
      }
      if (!isNonEmptyString(floor.name)) {
        add(issues, `${path}.name`, FLOOR_ISSUE_CODES.floorName)
      }
      if (floor.footprint !== undefined && !isPolygon(floor.footprint)) {
        add(issues, `${path}.footprint`, FLOOR_ISSUE_CODES.floorFootprintInvalid)
      }
      if (floor.height !== undefined && (!isFiniteNumber(floor.height) || floor.height <= 0)) {
        add(issues, `${path}.height`, FLOOR_ISSUE_CODES.floorHeight)
      }
    })
  })
  return index
}

interface EndpointValue {
  building: string
  level: number
}

/** 端点展示串；带上 building 前缀，错误信息能直接定位。 */
function endpointLabel(endpoint: EndpointValue): string {
  return `${endpoint.building} level ${endpoint.level}`
}

function checkEndpoint(
  value: unknown,
  side: 'from' | 'to',
  path: string,
  index: FloorIndex,
  issues: PackIssue[],
): EndpointValue | null {
  const invalidCode = side === 'from' ? FLOOR_ISSUE_CODES.connectorFromInvalid : FLOOR_ISSUE_CODES.connectorToInvalid
  const buildingCode = side === 'from' ? FLOOR_ISSUE_CODES.connectorFromBuilding : FLOOR_ISSUE_CODES.connectorToBuilding
  const levelCode = side === 'from' ? FLOOR_ISSUE_CODES.connectorFromLevel : FLOOR_ISSUE_CODES.connectorToLevel
  const buildingUnknownCode = side === 'from'
    ? FLOOR_ISSUE_CODES.connectorFromBuildingUnknown
    : FLOOR_ISSUE_CODES.connectorToBuildingUnknown
  const levelUnknownCode = side === 'from'
    ? FLOOR_ISSUE_CODES.connectorFromLevelUnknown
    : FLOOR_ISSUE_CODES.connectorToLevelUnknown

  if (!isRecord(value)) {
    add(issues, path, invalidCode)
    return null
  }
  const { building, level } = value
  let valid = true
  if (!isNonEmptyString(building)) {
    add(issues, `${path}.building`, buildingCode)
    valid = false
  }
  if (!isInteger(level)) {
    add(issues, `${path}.level`, levelCode)
    valid = false
  }
  if (!valid) return null

  const buildingId = building as string
  const floorLevel = level as number
  const endpoint: EndpointValue = { building: buildingId, level: floorLevel }
  if (!index.buildingIds.has(buildingId)) {
    add(issues, `${path}.building`, buildingUnknownCode, { building: buildingId })
  } else {
    const levels = index.levelsByBuilding.get(buildingId)
    if (!levels || !levels.has(floorLevel)) {
      add(issues, `${path}.level`, levelUnknownCode, { endpoint: endpointLabel(endpoint) })
    }
  }
  return endpoint
}

function checkConnectors(value: unknown, index: FloorIndex, issues: PackIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    add(issues, 'connectors', FLOOR_ISSUE_CODES.connectorsInvalid)
    return
  }

  const ids = new Set<string>()
  const seen = new Map<string, string>()
  value.forEach((connector, connectorIndex) => {
    const path = `connectors[${connectorIndex}]`
    if (!isRecord(connector)) {
      add(issues, path, FLOOR_ISSUE_CODES.connectorInvalid)
      return
    }
    const id = isNonEmptyString(connector.id) ? connector.id : null
    if (!id) {
      add(issues, `${path}.id`, FLOOR_ISSUE_CODES.connectorId)
    } else if (ids.has(id)) {
      add(issues, `${path}.id`, FLOOR_ISSUE_CODES.connectorIdDuplicate, { id })
    } else {
      ids.add(id)
    }
    const kind = connector.kind
    const kindValid = typeof kind === 'string' && FLOOR_CONNECTOR_KINDS.includes(kind as FloorConnectorKind)
    if (!kindValid) {
      add(issues, `${path}.kind`, FLOOR_ISSUE_CODES.connectorKind, { kinds: FLOOR_CONNECTOR_KINDS.join(' / ') })
    }
    if (connector.position !== undefined && !isPoint(connector.position)) {
      add(issues, `${path}.position`, FLOOR_ISSUE_CODES.connectorPosition)
    }

    const from = checkEndpoint(connector.from, 'from', `${path}.from`, index, issues)
    const to = checkEndpoint(connector.to, 'to', `${path}.to`, index, issues)
    if (!from || !to || !kindValid) return

    const key = JSON.stringify([from.building, from.level, to.building, to.level, kind])
    const firstId = seen.get(key)
    if (firstId !== undefined) {
      add(issues, path, FLOOR_ISSUE_CODES.connectorKindDuplicate, {
        endpoint: `${endpointLabel(from)} → ${endpointLabel(to)}`,
        kind,
        id: firstId,
      })
    } else {
      seen.set(key, id ?? path)
    }
  })
}

/**
 * 校验合并后的 pack：先跑 campus-pack/2 的基础校验，再叠加 floors / connectors。
 * 输入不是对象时直接返回基础校验的 `pack.invalid`，不抛异常。
 */
export function validateFloorPack(value: unknown): PackValidationResult {
  const base = validateCampusPack(value)
  if (!isRecord(value)) return base

  const issues = [...base.issues]
  const index = indexBuildings(value.buildings, issues)
  checkConnectors(value.connectors, index, issues)
  return { ok: issues.length === 0, issues }
}

export function isFloorAwarePack(value: unknown): boolean {
  return validateFloorPack(value).ok
}
