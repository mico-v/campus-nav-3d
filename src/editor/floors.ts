/**
 * M2-B 编辑器侧楼层工具：只读当前 pack 楼层与竖向连接，不引入新数据字段。
 *
 * 楼层来源分两路：M2-A 的 `floors`（新）优先，老数据退回 `levels[].index`。
 * 连接来源同理：M2-A 的 `connectors` 优先，老数据展开 `levels[].verticals`。
 */
import type { CampusData, Building } from '../data/campusData.ts'
import type { CampusFloor, CampusRoom } from '../data/pack-schema.ts'

interface FloorLike { index: number; level?: number; name?: string; elevation?: number; height?: number; verticals?: { id: string; kind: string; at?: [number, number]; to: number }[] }
interface ConnectorLike { id: string; kind: string; from: { building: string; level: number }; to: { building: string; level: number } }
type RoomLike = { id: string; name: string; aliases?: string[]; kind?: string }
type BuildingWithFloors = Building & { floors?: (FloorLike & { index?: number })[]; levels?: FloorLike[] }

export type FloorRange = number[]

export interface ConnectorRow {
  id: string
  kind: string
  from: number
  to: number
}

/** 取值来自建筑楼层定义；无楼层数据时给 `[0]`，让下拉仍有单一选项。 */
export function levelRange(levels: readonly (FloorLike | number)[] | undefined | null): FloorRange {
  if (!Array.isArray(levels) || levels.length === 0) return [0]
  const indices = levels
    .map((item) => typeof item === 'number' ? item : (item.index ?? item.level)!)
    .filter((value): value is number => Number.isInteger(value))
  return indices.length ? [...new Set(indices)].sort((a, b) => a - b) : [0]
}

/** 楼层越界时静默夹取到合法层，不抛异常。 */
export function clampFloor(level: unknown, levels: readonly (FloorLike | number)[] | undefined | null): number {
  const range = levelRange(levels)
  const value = typeof level === 'number' ? level : Number(level)
  if (!Number.isFinite(value)) return range[0]
  return range.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, range[0])
}

function floorsOf(building: Building): FloorLike[] | undefined {
  const floors = (building as BuildingWithFloors).floors
  return Array.isArray(floors) && floors.length > 0 ? floors : undefined
}

function legacyLevelsOf(building: Building): FloorLike[] | undefined {
  const levels = (building as BuildingWithFloors).levels
  return Array.isArray(levels) && levels.length > 0 ? levels : undefined
}

/** 当前建筑的楼层定义：新 `floors` 优先，老 `levels` 兜底。 */
export function buildingFloorLevels(building: Building | undefined): FloorLike[] {
  if (!building) return []
  return (floorsOf(building) ?? legacyLevelsOf(building) ?? [])
    .filter((level): level is FloorLike => Boolean(level) && Number.isInteger((level as FloorLike & { index?: number }).index ?? level.level!))
}

/** 当前建筑的合法楼层序号，供下拉使用。 */
export function floorRangeOf(building: Building | undefined): FloorRange {
  return levelRange(buildingFloorLevels(building))
}

/** 本栋楼的竖向连接表。M2-A 的 connectors 优先；老 `levels[].verticals` 展开成同结构。 */
export function listBuildingConnectors(data: CampusData, building: Building | undefined): ConnectorRow[] {
  if (!building) return []
  const rows: ConnectorRow[] = []
  const seen = new Set<string>()
  const add = (id: string, kind: string, from: number, to: number) => {
    const key = `${id}|${kind}|${from}|${to}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ id, kind, from, to })
  }
  const packConnectors = (data as CampusData & { connectors?: ConnectorLike[] }).connectors
  if (Array.isArray(packConnectors)) {
    for (const connector of packConnectors) {
      if (!connector || (connector.from?.building !== building.id && connector.to?.building !== building.id)) continue
      add(connector.id, connector.kind, connector.from.level, connector.to.level)
    }
    if (rows.length) return rows
  }
  for (const level of buildingFloorLevels(building)) {
    const verticals = level.verticals
    if (!Array.isArray(verticals)) continue
    for (const vertical of verticals) {
      if (!vertical || typeof vertical !== 'object') continue
      add(vertical.id, vertical.kind, level.index, vertical.to)
    }
  }
  return rows
}

export interface RoomRow {
  id: string
  name: string
  aliases: string[]
  kind?: CampusRoom['kind']
}

/** 当前楼层的房间列表：新 `floors[].rooms` 优先，老数据返回空数组（只读）。 */
export function floorRoomsOf(building: Building | undefined, level: number): RoomRow[] {
  const floors = (building as (Building & { floors?: (Partial<CampusFloor> & { rooms?: RoomLike[] })[] }) | undefined)?.floors
  const floor = floors?.find((item) => item.level === level)
  if (!Array.isArray(floor?.rooms)) return []
  return floor.rooms
    .filter((room) => Boolean(room) && typeof room.id === 'string' && typeof room.name === 'string')
    .map((room) => ({
      id: room.id,
      name: room.name,
      aliases: Array.isArray(room.aliases) ? room.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
      ...(room.kind ? { kind: room.kind as RoomRow['kind'] } : {}),
    }))
}
