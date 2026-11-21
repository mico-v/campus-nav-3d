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

function add(issues: PackIssue[], path: string, code: string, message: string): void {
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
      add(issues, `${buildingPath}.floors`, 'floors.invalid', 'floors 必须是数组')
      return
    }

    floors.forEach((floor, floorIndex) => {
      const path = `${buildingPath}.floors[${floorIndex}]`
      if (!isRecord(floor)) {
        add(issues, path, 'floor.invalid', '楼层必须是对象')
        return
      }
      if (!isInteger(floor.level)) {
        add(issues, `${path}.level`, 'floor.level.invalid', 'level 必须是整数（0 为一层，负数为地下）')
      } else {
        if (levels.has(floor.level)) {
          add(issues, `${path}.level`, 'floor.level.duplicate', `楼内 level 重复：${floor.level}`)
        }
        levels.add(floor.level)
      }
      if (!isNonEmptyString(floor.name)) {
        add(issues, `${path}.name`, 'floor.name', 'name 不能为空')
      }
      if (floor.footprint !== undefined && !isPolygon(floor.footprint)) {
        add(issues, `${path}.footprint`, 'floor.footprint.invalid', 'footprint 至少需要 3 个有限坐标点')
      }
      if (floor.height !== undefined && (!isFiniteNumber(floor.height) || floor.height <= 0)) {
        add(issues, `${path}.height`, 'floor.height', 'height 必须大于 0')
      }
    })
  })
  return index
}

interface EndpointValue {
  building: string
  level: number
}

function checkEndpoint(
  value: unknown,
  side: 'from' | 'to',
  path: string,
  index: FloorIndex,
  issues: PackIssue[],
): EndpointValue | null {
  if (!isRecord(value)) {
    add(issues, path, `connector.${side}.invalid`, `${side} 必须是 { building, level }`)
    return null
  }
  const { building, level } = value
  let valid = true
  if (!isNonEmptyString(building)) {
    add(issues, `${path}.building`, `connector.${side}.building`, 'building 不能为空')
    valid = false
  }
  if (!isInteger(level)) {
    add(issues, `${path}.level`, `connector.${side}.level`, 'level 必须是整数')
    valid = false
  }
  if (!valid) return null

  const buildingId = building as string
  const floorLevel = level as number
  if (!index.buildingIds.has(buildingId)) {
    add(issues, `${path}.building`, `connector.${side}.building.unknown`, `建筑不存在：${buildingId}`)
  } else {
    const levels = index.levelsByBuilding.get(buildingId)
    if (!levels || !levels.has(floorLevel)) {
      add(issues, `${path}.level`, `connector.${side}.level.unknown`, `楼层不存在：${buildingId} level ${floorLevel}`)
    }
  }
  return { building: buildingId, level: floorLevel }
}

function checkConnectors(value: unknown, index: FloorIndex, issues: PackIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    add(issues, 'connectors', 'connectors.invalid', 'connectors 必须是数组')
    return
  }

  const seen = new Map<string, number>()
  value.forEach((connector, connectorIndex) => {
    const path = `connectors[${connectorIndex}]`
    if (!isRecord(connector)) {
      add(issues, path, 'connector.invalid', '连接必须是对象')
      return
    }
    if (!isNonEmptyString(connector.id)) {
      add(issues, `${path}.id`, 'connector.id', 'id 不能为空')
    }
    const kind = connector.kind
    const kindValid = typeof kind === 'string' && FLOOR_CONNECTOR_KINDS.includes(kind as FloorConnectorKind)
    if (!kindValid) {
      add(issues, `${path}.kind`, 'connector.kind', `kind 只能是 ${FLOOR_CONNECTOR_KINDS.join(' / ')}`)
    }
    if (connector.position !== undefined && !isPoint(connector.position)) {
      add(issues, `${path}.position`, 'connector.position', 'position 必须是两个有限数字')
    }

    const from = checkEndpoint(connector.from, 'from', `${path}.from`, index, issues)
    const to = checkEndpoint(connector.to, 'to', `${path}.to`, index, issues)
    if (!from || !to || !kindValid) return

    const key = JSON.stringify([from.building, from.level, to.building, to.level, kind])
    if (seen.has(key)) {
      add(issues, path, 'connector.kind.duplicate', '同一对楼层的同种连接不能重复')
    } else {
      seen.set(key, connectorIndex)
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
