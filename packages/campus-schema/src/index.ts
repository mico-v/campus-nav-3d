/**
 * campus-pack/2 的类型与入口校验。
 *
 * 这里只描述「数据长什么样」：无 Three.js、无 DOM、无第三方依赖，能在 Node 里直接跑。
 * 几何自检、拓扑可达、命名规范等更重的检查在 `campus-validate`（M1-S2）里做，
 * 本模块只拦结构性错误，好让 CLI 与前端共用同一份判定。
 */

export const CAMPUS_PACK_SCHEMA = 'campus-pack/2' as const

export type CampusPackSchema = typeof CAMPUS_PACK_SCHEMA

export type Point = [number, number]

export interface CampusBounds {
  min: Point
  max: Point
}

export interface CampusOrigin {
  lat: number
  lng: number
  rotation?: number
}

export interface CampusZone {
  id: string
  name: string
  category?: string
  polygon: Point[]
}

export interface CampusUnit {
  id: string
  name: string
  polygon: Point[]
  capacity?: number
  type?: string
  tags?: string[]
}

export type PortalKind = 'door' | 'gate' | 'entrance' | 'exit'

export interface CampusPortal {
  id: string
  kind: PortalKind
  at: Point
  to?: string | null
}

export type VerticalKind = 'stairs' | 'elevator' | 'escalator' | 'ramp'

export interface CampusVertical {
  id: string
  kind: VerticalKind
  at: Point
  to: number
}

export interface CampusLevel {
  index: number
  name: string
  elevation: number
  height: number
  outline?: Point[]
  units?: CampusUnit[]
  portals?: CampusPortal[]
  verticals?: CampusVertical[]
}

export interface CampusBuilding {
  id: string
  name: string
  aliases?: string[]
  category?: string
  footprint: Point[]
  height: number
  levels?: CampusLevel[]
}

export interface RoadNode {
  id: string
  at: Point
}

export interface RoadEdge {
  from: string
  to: string
  cost?: number
  kind?: string
}

export interface CampusRoadNetwork {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

export interface IndoorNode {
  id: string
  at: Point
  level: number
  building: string
}

export interface IndoorEdge {
  from: string
  to: string
  cost?: number
}

export interface CampusIndoorNetwork {
  nodes: IndoorNode[]
  edges: IndoorEdge[]
}

export interface CampusPoi {
  id: string
  name: string
  at: Point
  level?: number
  building?: string | null
  tags?: string[]
}

/** `pack.json`：只描述包本身，不含几何。 */
export interface CampusPackMeta {
  schema: CampusPackSchema
  id: string
  name: string
  crs: 'local-meters' | 'wgs84'
  origin?: CampusOrigin
  bounds: CampusBounds
  units: 'meter'
  license: string
  attribution?: string[]
  branding?: {
    logo?: string
    colors?: Record<string, string>
  }
}

/** `campus.json`：L0/L1 静态数据；L3 动态内容不在这里。 */
export interface CampusPackData {
  zones?: CampusZone[]
  buildings?: CampusBuilding[]
  roadNetwork?: CampusRoadNetwork
  indoorNetwork?: CampusIndoorNetwork
  pois?: CampusPoi[]
}

export type CampusPack = CampusPackMeta & CampusPackData

export interface PackIssue {
  /** 出错位置，例如 `buildings[3].height`。 */
  path: string
  /** 稳定的机器可读代码，供 CLI 分组与测试断言。 */
  code: string
  message: string
}

export interface PackValidationResult {
  ok: boolean
  issues: PackIssue[]
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CRS_VALUES = new Set(['local-meters', 'wgs84'])
const PORTAL_KINDS = new Set(['door', 'gate', 'entrance', 'exit'])
const VERTICAL_KINDS = new Set(['stairs', 'elevator', 'escalator', 'ramp'])

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSlug(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
}

/** 校验器内部使用：收集错误，不抛异常。 */
class Collector {
  readonly issues: PackIssue[] = []

  add(path: string, code: string, message: string): void {
    this.issues.push({ path, code, message })
  }

  /** 校验一个 point；返回是否合法，方便调用方决定要不要继续读坐标。 */
  point(value: unknown, path: string): boolean {
    if (!isPoint(value)) {
      this.add(path, 'point.invalid', '坐标必须是两个有限数字')
      return false
    }
    return true
  }

  polygon(value: unknown, path: string, options: { minVertices?: number; required?: boolean } = {}): boolean {
    const minVertices = options.minVertices ?? 3
    if (value === undefined) {
      if (options.required) this.add(path, 'polygon.missing', '缺少多边形')
      return false
    }
    if (!Array.isArray(value)) {
      this.add(path, 'polygon.invalid', '多边形必须是顶点数组')
      return false
    }
    if (value.length < minVertices) {
      this.add(path, 'polygon.too-few-vertices', `多边形至少需要 ${minVertices} 个顶点`)
      return false
    }
    let ok = true
    value.forEach((vertex, index) => {
      if (!this.point(vertex, `${path}[${index}]`)) ok = false
    })
    return ok
  }

  slug(value: unknown, path: string, code = 'id.invalid'): boolean {
    if (!isSlug(value)) {
      this.add(path, code, 'id 必须是小写连字符 slug，例如 `usts-tianping`')
      return false
    }
    return true
  }
}

function checkBounds(collector: Collector, value: unknown, path: string): void {
  if (!isRecord(value)) {
    collector.add(path, 'bounds.invalid', 'bounds 必须含 min 与 max 两个坐标')
    return
  }
  const minOk = collector.point(value.min, `${path}.min`)
  const maxOk = collector.point(value.max, `${path}.max`)
  if (!minOk || !maxOk) return
  const [minX, minY] = value.min as Point
  const [maxX, maxY] = value.max as Point
  if (!(minX < maxX && minY < maxY)) {
    collector.add(path, 'bounds.not-increasing', 'bounds 的 min 必须严格小于 max')
  }
}

function checkMeta(collector: Collector, pack: UnknownRecord): void {
  if (pack.schema !== CAMPUS_PACK_SCHEMA) {
    collector.add('schema', 'meta.schema', `schema 必须是 \`${CAMPUS_PACK_SCHEMA}\``)
  }
  collector.slug(pack.id, 'id', 'meta.id')
  if (!isNonEmptyString(pack.name)) collector.add('name', 'meta.name', 'name 不能为空')
  if (typeof pack.crs !== 'string' || !CRS_VALUES.has(pack.crs)) {
    collector.add('crs', 'meta.crs', 'crs 只能是 `local-meters` 或 `wgs84`')
  }
  if (pack.units !== 'meter') collector.add('units', 'meta.units', 'units 目前只支持 `meter`')
  if (!isNonEmptyString(pack.license)) collector.add('license', 'meta.license', 'license 不能为空')
  checkBounds(collector, pack.bounds, 'bounds')

  if (pack.origin !== undefined) {
    if (!isRecord(pack.origin)) {
      collector.add('origin', 'meta.origin', 'origin 必须是对象')
    } else {
      if (!isFiniteNumber(pack.origin.lat) || Math.abs(pack.origin.lat) > 90) {
        collector.add('origin.lat', 'meta.origin.lat', 'lat 必须是 [-90, 90] 内的数字')
      }
      if (!isFiniteNumber(pack.origin.lng) || Math.abs(pack.origin.lng) > 180) {
        collector.add('origin.lng', 'meta.origin.lng', 'lng 必须是 [-180, 180] 内的数字')
      }
    }
  }

  if (pack.attribution !== undefined) {
    if (!Array.isArray(pack.attribution) || !pack.attribution.every(isNonEmptyString)) {
      collector.add('attribution', 'meta.attribution', 'attribution 必须是非空字符串数组')
    }
  }
}

function checkIdsUnique(collector: Collector, ids: string[], path: string, code: string): void {
  const seen = new Set<string>()
  ids.forEach((id, index) => {
    if (seen.has(id)) collector.add(`${path}[${index}].id`, code, `id 重复：${id}`)
    seen.add(id)
  })
}

function checkZones(collector: Collector, zones: unknown): void {
  if (!Array.isArray(zones)) {
    collector.add('zones', 'zones.invalid', 'zones 必须是数组')
    return
  }
  zones.forEach((zone, index) => {
    const path = `zones[${index}]`
    if (!isRecord(zone)) {
      collector.add(path, 'zone.invalid', '分区必须是对象')
      return
    }
    collector.slug(zone.id, `${path}.id`)
    if (!isNonEmptyString(zone.name)) collector.add(`${path}.name`, 'zone.name', 'name 不能为空')
    collector.polygon(zone.polygon, `${path}.polygon`, { required: true })
  })
  checkIdsUnique(
    collector,
    zones.filter((zone): zone is UnknownRecord => isRecord(zone) && isSlug(zone.id)).map((zone) => zone.id as string),
    'zones',
    'zone.id.duplicate',
  )
}

function checkLevels(collector: Collector, levels: unknown, buildingPath: string): void {
  if (!Array.isArray(levels)) {
    collector.add(`${buildingPath}.levels`, 'levels.invalid', 'levels 必须是数组')
    return
  }
  let previousElevation: number | null = null
  const indices: number[] = []
  levels.forEach((level, index) => {
    const path = `${buildingPath}.levels[${index}]`
    if (!isRecord(level)) {
      collector.add(path, 'level.invalid', '楼层必须是对象')
      return
    }
    if (!Number.isInteger(level.index)) {
      collector.add(`${path}.index`, 'level.index', 'index 必须是整数')
    } else {
      indices.push(level.index as number)
    }
    if (!isNonEmptyString(level.name)) collector.add(`${path}.name`, 'level.name', 'name 不能为空')
    if (!isFiniteNumber(level.elevation)) {
      collector.add(`${path}.elevation`, 'level.elevation', 'elevation 必须是有限数字')
    } else {
      if (previousElevation !== null && level.elevation <= previousElevation) {
        collector.add(`${path}.elevation`, 'level.elevation.order', '楼层 elevation 必须严格递增')
      }
      previousElevation = level.elevation
    }
    if (!isFiniteNumber(level.height) || level.height <= 0) {
      collector.add(`${path}.height`, 'level.height', 'height 必须大于 0')
    }
    if (level.outline !== undefined) collector.polygon(level.outline, `${path}.outline`)

    if (level.units !== undefined) {
      if (!Array.isArray(level.units)) {
        collector.add(`${path}.units`, 'level.units', 'units 必须是数组')
      } else {
        level.units.forEach((unit, unitIndex) => {
          const unitPath = `${path}.units[${unitIndex}]`
          if (!isRecord(unit)) {
            collector.add(unitPath, 'unit.invalid', '房间必须是对象')
            return
          }
          collector.slug(unit.id, `${unitPath}.id`)
          if (!isNonEmptyString(unit.name)) collector.add(`${unitPath}.name`, 'unit.name', 'name 不能为空')
          collector.polygon(unit.polygon, `${unitPath}.polygon`, { required: true })
        })
      }
    }

    if (level.portals !== undefined) {
      if (!Array.isArray(level.portals)) {
        collector.add(`${path}.portals`, 'level.portals', 'portals 必须是数组')
      } else {
        level.portals.forEach((portal, portalIndex) => {
          const portalPath = `${path}.portals[${portalIndex}]`
          if (!isRecord(portal)) {
            collector.add(portalPath, 'portal.invalid', '门必须是对象')
            return
          }
          if (!isNonEmptyString(portal.id)) collector.add(`${portalPath}.id`, 'portal.id', 'id 不能为空')
          if (typeof portal.kind !== 'string' || !PORTAL_KINDS.has(portal.kind)) {
            collector.add(`${portalPath}.kind`, 'portal.kind', 'kind 不是支持的门类型')
          }
          collector.point(portal.at, `${portalPath}.at`)
        })
      }
    }

    if (level.verticals !== undefined) {
      if (!Array.isArray(level.verticals)) {
        collector.add(`${path}.verticals`, 'level.verticals', 'verticals 必须是数组')
      } else {
        level.verticals.forEach((vertical, verticalIndex) => {
          const verticalPath = `${path}.verticals[${verticalIndex}]`
          if (!isRecord(vertical)) {
            collector.add(verticalPath, 'vertical.invalid', '竖向连接必须是对象')
            return
          }
          if (!isNonEmptyString(vertical.id)) collector.add(`${verticalPath}.id`, 'vertical.id', 'id 不能为空')
          if (typeof vertical.kind !== 'string' || !VERTICAL_KINDS.has(vertical.kind)) {
            collector.add(`${verticalPath}.kind`, 'vertical.kind', 'kind 不是支持的竖向连接类型')
          }
          collector.point(vertical.at, `${verticalPath}.at`)
          if (!Number.isInteger(vertical.to)) {
            collector.add(`${verticalPath}.to`, 'vertical.to', 'to 必须是目标楼层序号（整数）')
          } else if (vertical.to === level.index) {
            collector.add(`${verticalPath}.to`, 'vertical.to.self', '竖向连接不能指向自己所在楼层')
          }
        })
      }
    }
  })
  const duplicateIndex = indices.find((value, index) => indices.indexOf(value) !== index)
  if (duplicateIndex !== undefined) {
    collector.add(`${buildingPath}.levels`, 'level.index.duplicate', `楼层序号重复：${duplicateIndex}`)
  }
}

function checkBuildings(collector: Collector, buildings: unknown): void {
  if (!Array.isArray(buildings)) {
    collector.add('buildings', 'buildings.invalid', 'buildings 必须是数组')
    return
  }
  buildings.forEach((building, index) => {
    const path = `buildings[${index}]`
    if (!isRecord(building)) {
      collector.add(path, 'building.invalid', '建筑必须是对象')
      return
    }
    collector.slug(building.id, `${path}.id`)
    if (!isNonEmptyString(building.name)) collector.add(`${path}.name`, 'building.name', 'name 不能为空')
    collector.polygon(building.footprint, `${path}.footprint`, { required: true })
    if (!isFiniteNumber(building.height) || building.height < 0) {
      collector.add(`${path}.height`, 'building.height', 'height 必须是非负数字')
    }
    if (building.levels !== undefined) checkLevels(collector, building.levels, path)
  })
  checkIdsUnique(
    collector,
    buildings.filter((building): building is UnknownRecord => isRecord(building) && isSlug(building.id)).map((building) => building.id as string),
    'buildings',
    'building.id.duplicate',
  )
}

function checkRoadNetwork(collector: Collector, network: unknown): void {
  if (!isRecord(network)) {
    collector.add('roadNetwork', 'roadNetwork.invalid', 'roadNetwork 必须是对象')
    return
  }
  const nodes = network.nodes
  if (!Array.isArray(nodes)) {
    collector.add('roadNetwork.nodes', 'roadNetwork.nodes.invalid', 'nodes 必须是数组')
  } else {
    nodes.forEach((node, index) => {
      const path = `roadNetwork.nodes[${index}]`
      if (!isRecord(node)) {
        collector.add(path, 'roadNode.invalid', '节点必须是对象')
        return
      }
      if (!isNonEmptyString(node.id)) collector.add(`${path}.id`, 'roadNode.id', 'id 不能为空')
      collector.point(node.at, `${path}.at`)
    })
    checkIdsUnique(
      collector,
      nodes.filter((node): node is UnknownRecord => isRecord(node) && isNonEmptyString(node.id)).map((node) => node.id as string),
      'roadNetwork.nodes',
      'roadNode.id.duplicate',
    )
  }

  const edges = network.edges
  if (!Array.isArray(edges)) {
    collector.add('roadNetwork.edges', 'roadNetwork.edges.invalid', 'edges 必须是数组')
    return
  }
  const nodeIds = new Set(
    Array.isArray(nodes)
      ? nodes.filter((node): node is UnknownRecord => isRecord(node) && isNonEmptyString(node.id)).map((node) => node.id as string)
      : [],
  )
  edges.forEach((edge, index) => {
    const path = `roadNetwork.edges[${index}]`
    if (!isRecord(edge)) {
      collector.add(path, 'roadEdge.invalid', '边必须是对象')
      return
    }
    if (!isNonEmptyString(edge.from)) {
      collector.add(`${path}.from`, 'roadEdge.from', 'from 不能为空')
    } else if (!nodeIds.has(edge.from)) {
      collector.add(`${path}.from`, 'roadEdge.from.unknown', `from 指向不存在的节点：${edge.from}`)
    }
    if (!isNonEmptyString(edge.to)) {
      collector.add(`${path}.to`, 'roadEdge.to', 'to 不能为空')
    } else if (!nodeIds.has(edge.to)) {
      collector.add(`${path}.to`, 'roadEdge.to.unknown', `to 指向不存在的节点：${edge.to}`)
    }
    if (edge.from === edge.to && isNonEmptyString(edge.from)) {
      collector.add(path, 'roadEdge.self-loop', '边不能自己连自己')
    }
    if (edge.cost !== undefined && (!isFiniteNumber(edge.cost) || edge.cost <= 0)) {
      collector.add(`${path}.cost`, 'roadEdge.cost', 'cost 必须大于 0')
    }
  })
}

function checkIndoorNetwork(collector: Collector, network: unknown): void {
  if (!isRecord(network)) {
    collector.add('indoorNetwork', 'indoorNetwork.invalid', 'indoorNetwork 必须是对象')
    return
  }
  const nodes = network.nodes
  if (!Array.isArray(nodes)) {
    collector.add('indoorNetwork.nodes', 'indoorNetwork.nodes.invalid', 'nodes 必须是数组')
    return
  }
  nodes.forEach((node, index) => {
    const path = `indoorNetwork.nodes[${index}]`
    if (!isRecord(node)) {
      collector.add(path, 'indoorNode.invalid', '室内节点必须是对象')
      return
    }
    if (!isNonEmptyString(node.id)) collector.add(`${path}.id`, 'indoorNode.id', 'id 不能为空')
    collector.point(node.at, `${path}.at`)
    if (!Number.isInteger(node.level)) collector.add(`${path}.level`, 'indoorNode.level', 'level 必须是整数')
    if (!isNonEmptyString(node.building)) collector.add(`${path}.building`, 'indoorNode.building', 'building 不能为空')
  })
}

function checkPois(collector: Collector, pois: unknown, buildingIds: Set<string>): void {
  if (!Array.isArray(pois)) {
    collector.add('pois', 'pois.invalid', 'pois 必须是数组')
    return
  }
  pois.forEach((poi, index) => {
    const path = `pois[${index}]`
    if (!isRecord(poi)) {
      collector.add(path, 'poi.invalid', 'POI 必须是对象')
      return
    }
    collector.slug(poi.id, `${path}.id`)
    if (!isNonEmptyString(poi.name)) collector.add(`${path}.name`, 'poi.name', 'name 不能为空')
    collector.point(poi.at, `${path}.at`)
    if (typeof poi.building === 'string' && poi.building.length > 0 && !buildingIds.has(poi.building)) {
      collector.add(`${path}.building`, 'poi.building.unknown', `建筑不存在：${poi.building}`)
    }
  })
  checkIdsUnique(
    collector,
    pois.filter((poi): poi is UnknownRecord => isRecord(poi) && isSlug(poi.id)).map((poi) => poi.id as string),
    'pois',
    'poi.id.duplicate',
  )
}

/**
 * 校验一个 `pack.json + campus.json` 合并后的对象（或单独传 `pack.json`）。
 * 只做结构性检查，返回全部问题而不是首个问题，方便 CLI 一次全报。
 */
export function validateCampusPack(value: unknown): PackValidationResult {
  const collector = new Collector()
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', code: 'pack.invalid', message: '包必须是对象' }] }
  }

  checkMeta(collector, value)
  if (value.zones !== undefined) checkZones(collector, value.zones)
  if (value.buildings !== undefined) checkBuildings(collector, value.buildings)
  if (value.roadNetwork !== undefined) checkRoadNetwork(collector, value.roadNetwork)
  if (value.indoorNetwork !== undefined) checkIndoorNetwork(collector, value.indoorNetwork)
  if (value.pois !== undefined) {
    const buildingIds = new Set(
      Array.isArray(value.buildings)
        ? value.buildings
            .filter((building): building is UnknownRecord => isRecord(building) && isSlug(building.id))
            .map((building) => building.id as string)
        : [],
    )
    checkPois(collector, value.pois, buildingIds)
  }

  return { ok: collector.issues.length === 0, issues: collector.issues }
}

export function isCampusPack(value: unknown): value is CampusPack {
  return validateCampusPack(value).ok
}
