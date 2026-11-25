import packDataJson from '../../packs/usts-tianping/campus.json'
import packMetaJson from '../../packs/usts-tianping/pack.json'
import { migrateCampusData } from '../../packages/campus-schema/src/migrate'
import { normalizeCampusData } from './roadNormalization'
import { validateCampusDataValue } from './campusValidation'
import { enhanceCampusData } from './campusEnhancements'
import type { RoadAccess, RoadClass, RoadNetwork, RoadSurface } from './roadNetwork'
import type { CampusFloor } from './pack-schema'
import { M5A_DEMO_BUILDING_FIELDS } from './m5aDemoFields'

export type ZoneCategory = 'dorm' | 'academic' | 'landscape' | 'sports' | 'service' | 'admin'

export const buildingCategoryOptions = [
  'dorm',
  'academic',
  'landscape',
  'sports',
  'service',
  'admin',
  'library',
  'gate',
  'canteen',
  'poi',
] as const

export type BuildingCategory = (typeof buildingCategoryOptions)[number]

export interface Zone {
  id: string
  name: string
  category: ZoneCategory
  center: [number, number]
  size: [number, number]
  color: string
  footprint?: [number, number][]
}

/** M5-A：室内入口的展示信息；level 与 M2-A floors 的 level 对齐。 */
export interface BuildingEntrance {
  level?: number
  name?: string
  position?: [number, number]
}

export interface Building {
  id: string
  name: string
  /** 搜索别名；pack 里 `aliases` 与旧 `alias` 在适配层归一到这里。 */
  aliases?: string[]
  category: BuildingCategory
  position: [number, number]
  size: [number, number]
  height: number
  color?: string
  /** Optional until the campus is subdivided into authoritative zones. */
  zoneId?: string
  footprint?: [number, number][]
  /** 简介；旧 pack 缺失时由 UI 层回落。 */
  info?: string
  /** M2-A 的楼层定义；与室内楼层条共用同一份数据。 */
  floors?: Array<Partial<CampusFloor> & { level: number }>
  /** 公共服务设施列表；旧 pack 缺失时由 UI 层回落。 */
  facilities?: string[]
  entrance?: BuildingEntrance
}

export interface Road {
  id: string
  /** Optional human-readable label; id remains the stable routing key. */
  name?: string
  points: [number, number][]
  width: number
  color?: string
  /** Optional explicit display classification; legacy data falls back to id rules. */
  kind?: 'graph' | 'road' | 'canal'
  roadClass?: RoadClass
  surface?: RoadSurface
  access?: RoadAccess
  oneWay?: boolean
  speed?: number
  sidewalk?: boolean
  /** IDs of legacy/source records represented by this canonical road. */
  sourceIds?: string[]
  /** Routing/debug provenance; never rendered as an additional road. */
  routing?: { sourceIds: string[] }
}

export interface WaterBody {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  footprint?: [number, number][]
}

export interface FieldArea {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  stripeColor?: string
  footprint?: [number, number][]
}

export interface PoiMarker {
  id: string
  name: string
  /** 搜索别名；pack 里 `aliases` 与旧 `alias` 在适配层归一到这里。 */
  aliases?: string[]
  kind: 'landmark' | 'service' | 'gate'
  position: [number, number, number]
  color?: string
  sourceBuildingId?: string
  info?: string
}

/** Static, editable map data. Navigation results are runtime-only and are not persisted here. */
export interface MapDataset {
  name: string
  bounds: { width: number; depth: number }
  zones: Zone[]
  buildings: Building[]
  roads: Road[]
  /** Explicit routable topology; legacy imports may omit it until normalization. */
  roadNetwork?: RoadNetwork
  waters: WaterBody[]
  fields: FieldArea[]
  trees: [number, number][]
  pois: PoiMarker[]
}

/** Backwards-compatible name used by the editor and renderer. */
export type CampusData = MapDataset

/** Data after import normalization; this is the shape used by rendering and navigation. */
export type CanonicalCampusData = Omit<MapDataset, 'roadNetwork'> & { roadNetwork: RoadNetwork }

// Sources: graph positions and connectivity from ZDaneel/usts-navigation-graph commit 6f251d8;
// named OpenStreetMap building footprints are fitted into the graph coordinate system using matched landmarks.

function packToLegacyData(data: unknown, meta: unknown): CampusData {
  const migrated = migrateCampusData(data)
  const pack = migrated
  // migrate 只保留 core schema 字段；M5-A 的展示字段直接从原始 pack 透传，
  // 老 pack 没有这些字段时保持 undefined，交给下游回落。
  const rawBuildings = new Map(
    ((data as { buildings?: Array<Record<string, unknown>> })?.buildings ?? [])
      .filter((raw) => raw && typeof raw.id === 'string')
      .map((raw) => [raw.id as string, raw]),
  )
  const rawPois = new Map(
    ((data as { pois?: Array<Record<string, unknown>> })?.pois ?? [])
      .filter((raw) => raw && typeof raw.id === 'string')
      .map((raw) => [raw.id as string, raw]),
  )
  const normalizedAliases = (aliases: unknown, legacyAlias: unknown): string[] | undefined => {
    const source = aliases ?? legacyAlias
    if (!Array.isArray(source)) return undefined
    const values = source.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    return values.length ? values : undefined
  }
  const network = pack.roadNetwork!
  const zones: Zone[] = pack.zones!.map((zone) => ({
    id: zone.id,
    name: zone.name,
    category: zone.category as ZoneCategory,
    center: zone.center!,
    size: zone.size!,
    color: zone.color!,
    footprint: zone.polygon as [number, number][],
  }))
  const buildings: Building[] = pack.buildings!.map((building) => {
    const raw = rawBuildings.get(building.id) ?? {}
    const floors = Array.isArray(raw.floors) ? raw.floors as CampusFloor[] : undefined
    const facilities = Array.isArray(raw.facilities) ? raw.facilities.filter((item): item is string => typeof item === 'string') : undefined
    const rawEntrance = raw.entrance as BuildingEntrance | undefined
    return {
      id: building.id,
      name: building.name,
      aliases: normalizedAliases(raw.aliases, raw.alias),
      category: building.category as BuildingCategory,
      position: building.position!,
      size: building.size!,
      height: building.height,
      color: building.color,
      zoneId: building.zoneId,
      footprint: building.footprint as [number, number][],
      info: typeof raw.info === 'string' ? raw.info : undefined,
      floors,
      facilities,
      entrance: rawEntrance && typeof rawEntrance === 'object' ? rawEntrance : undefined,
    }
  })
  const roads: Road[] = pack.roads!.map((road) => ({
    id: road.id,
    name: road.name,
    points: road.points as [number, number][],
    width: road.width ?? 1,
    kind: road.kind as Road['kind'],
    sourceIds: road.sourceIds,
  }))
  const waters: WaterBody[] = pack.waters!.map((water) => ({
    id: water.id,
    name: water.name,
    center: water.center!,
    size: water.size!,
    color: water.color,
    footprint: water.footprint as [number, number][] | undefined,
  }))
  const fields: FieldArea[] = pack.fields!.map((field) => ({
    id: field.id,
    name: field.name,
    center: field.center!,
    size: field.size!,
    color: field.color,
    stripeColor: field.stripeColor,
    footprint: field.footprint as [number, number][],
  }))
  const packPois: PoiMarker[] = pack.pois!.map((poi) => {
    const raw = (rawPois.get(poi.id) ?? {}) as Record<string, unknown> & { kind?: string; tags?: string[]; elevation?: number }
    const at = poi.at!
    return {
      id: poi.id,
      name: poi.name,
      aliases: normalizedAliases(raw.aliases, raw.alias),
      kind: (typeof raw.kind === 'string' ? raw.kind : raw.tags?.includes('gate') ? 'gate' : 'landmark') as PoiMarker['kind'],
      position: [at[0], at[1], typeof raw.elevation === 'number' ? raw.elevation : 0] as [number, number, number],
      color: raw.color as string | undefined,
      sourceBuildingId: typeof raw.building === 'string' ? raw.building : undefined,
      info: typeof raw.info === 'string' ? raw.info : Array.isArray(raw.tags) ? raw.tags[0] : undefined,
    }
  })
  // 室内 POI 与 pack POI 可能同名（例如「KFC」与「KFC（二食堂店）」），判重只认 id，
  // 同名不是重复。原装配层按 id 跳过，这里沿用同一口径，避免把室内 POI 静默吃掉。
  const poiIds = new Set(packPois.map((poi) => poi.id))
  const indoorPois: PoiMarker[] = []
  for (const raw of (data as { buildings?: Array<Record<string, unknown>> })?.buildings ?? []) {
    if (!Array.isArray(raw?.floors)) continue
    for (const floor of raw.floors as Array<Record<string, unknown>>) {
      if (!Array.isArray(floor?.rooms)) continue
      for (const room of floor.rooms as Array<Record<string, unknown>>) {
        if (typeof room?.id !== 'string' || typeof room.name !== 'string' || poiIds.has(room.id)) continue
        poiIds.add(room.id)
        const center = (raw.position ?? pack.buildings!.find((building) => building.id === raw.id)?.position ?? [0, 0]) as [number, number]
        const level = typeof floor.level === 'number' ? floor.level : 0
        indoorPois.push({
          id: room.id,
          name: room.name,
          aliases: normalizedAliases(room.aliases, room.alias),
          kind: (typeof room.kind === 'string' && ['service', 'dining', 'shop'].includes(room.kind) ? 'service' : 'landmark') as PoiMarker['kind'],
          position: [center[0], level * 4, center[1]] as [number, number, number],
          sourceBuildingId: typeof raw.id === 'string' ? raw.id : undefined,
          info: typeof room.name === 'string' ? room.name : undefined,
        })
      }
    }
  }

  return {
    name: String((meta as Record<string, unknown>).name),
    bounds: {
      width: (meta as { bounds: { min: [number, number]; max: [number, number] } }).bounds.max[0] - (meta as { bounds: { min: [number, number]; max: [number, number] } }).bounds.min[0],
      depth: (meta as { bounds: { min: [number, number]; max: [number, number] } }).bounds.max[1] - (meta as { bounds: { min: [number, number]; max: [number, number] } }).bounds.min[1],
    },
    zones,
    buildings,
    roads,
    waters,
    fields,
    trees: pack.trees!.map((tree) => tree.at as [number, number]),
    // pack 的 POI 带 at/level/tags 等字段；编辑器按位置与可选信息读取这里的一份即可，
    // 不给渲染层凭空造新 POI。位置补上第三维高度，POI kind 由 tags 回落。
    pois: [...packPois, ...indoorPois],
    roadNetwork: {
      nodes: network.nodes.map((node) => ({
        id: node.id,
        position: node.at as [number, number],
        kind: node.kind as import('./roadNetwork').RoadNodeKind,
        sourceIds: node.sourceIds,
      })),
      segments: network.segments as unknown as RoadNetwork['segments'],
    },
  }
}


const baseCampusData: CampusData = packToLegacyData(packDataJson, packMetaJson)

export function cloneCampusData(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}

/** Apply presentation data fixes without mutating the source returned by the editor API. */
export function prepareCampusData(data: CampusData): CanonicalCampusData {
  const prepared = cloneCampusData(data)
  enhanceCampusData(prepared)
  return normalizeCampusData(prepared)
}

export function createDefaultCampusData(): CanonicalCampusData {
  const data = prepareCampusData(baseCampusData)
  // 当前 pack 还没有 M5-A 的展示字段；只在默认演示数据里补几栋楼的楼层/入口/设施，
  // 让 UI 有真实可点的例子。其余建筑保持缺字段状态，走详情面板的回落路径。
  for (const building of data.buildings) {
    const demo = M5A_DEMO_BUILDING_FIELDS[building.id]
    if (!demo) continue
    if (!building.floors?.length && demo.floors) building.floors = demo.floors
    if (!building.facilities?.length && demo.facilities) building.facilities = demo.facilities
    if (!building.info && demo.info) building.info = demo.info
    if (!building.entrance && demo.entrance) building.entrance = demo.entrance
  }
  return data
}

/** Return actionable errors before an edited dataset is serialized. */
export function validateCampusData(data: CampusData): string[] {
  return validateCampusDataValue(data)
}
