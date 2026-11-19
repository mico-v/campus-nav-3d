/**
 * 旧单文件 `campus.json`（现为 `tests/fixtures/legacy-campus.json`）→ `campus-pack/2` 静态数据映射。
 *
 * 这里只做结构转换，不做几何补全或精度修正；`campus-pack/2` 的校验放在
 * `validateCampusPack({ ...meta, ...data })`。
 */

import type {
  CampusBuilding,
  CampusPackData,
  CampusRoadNetwork,
  CampusZone,
  Point,
  RoadEdge,
} from './index'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function point(value: unknown, label: string): Point {
  if (!Array.isArray(value) || value.length !== 2 || value.every((item) => typeof item === 'number' && Number.isFinite(item)) === false) {
    throw new Error(`${label} 必须是两个有限数字组成的坐标`)
  }
  return [value[0], value[1]]
}

function positivePair(value: unknown, label: string): Point {
  const pair = point(value, label)
  if (pair[0] <= 0 || pair[1] <= 0) throw new Error(`${label} 的宽高必须大于 0`)
  return pair
}

function rectFromCenterSize(center: Point, size: Point): Point[] {
  const [x, z] = center
  const [width, depth] = size
  const halfWidth = width / 2
  const halfDepth = depth / 2
  return [
    [x - halfWidth, z - halfDepth],
    [x + halfWidth, z - halfDepth],
    [x + halfWidth, z + halfDepth],
    [x - halfWidth, z + halfDepth],
  ]
}

function pointList(value: unknown, label: string, minLength = 2): Point[] {
  if (!Array.isArray(value) || value.length < minLength) throw new Error(`${label} 至少需要 ${minLength} 个点`)
  return value.map((item, index) => point(item, `${label}[${index}]`))
}

function withPolygon<T extends UnknownRecord>(raw: T, centerKey: 'center' | 'position', label: string): T & { polygon: Point[] } {
  if (raw.footprint !== undefined) {
    return { ...raw, polygon: pointList(raw.footprint, `${label}.footprint`, 3) }
  }
  if (raw[centerKey] === undefined) {
    throw new Error(`${label}.${centerKey} 缺失，无法生成 polygon`)
  }
  return { ...raw, polygon: rectFromCenterSize(point(raw[centerKey], `${label}.${centerKey}`), positivePair(raw.size, `${label}.size`)) }
}

function zone(raw: UnknownRecord, index: number): CampusZone {
  const withFootprint = withPolygon(raw, 'center', `zones[${index}]`)
  const result: CampusZone = {
    id: String(withFootprint.id),
    name: String(withFootprint.name),
    polygon: withFootprint.polygon,
  }
  if (withFootprint.category !== undefined) result.category = String(withFootprint.category)
  if (withFootprint.center !== undefined) result.center = point(withFootprint.center, `zones[${index}].center`)
  if (withFootprint.size !== undefined) result.size = positivePair(withFootprint.size, `zones[${index}].size`)
  if (withFootprint.color !== undefined) result.color = String(withFootprint.color)
  return result
}

function building(raw: UnknownRecord, index: number): CampusBuilding {
  const withFootprint = withPolygon(raw, 'position', `buildings[${index}]`)
  const result: CampusBuilding = {
    id: String(withFootprint.id),
    name: String(withFootprint.name),
    footprint: withFootprint.polygon,
    height: Number(withFootprint.height),
  }
  if (withFootprint.aliases !== undefined) result.aliases = withFootprint.aliases as string[]
  if (withFootprint.category !== undefined) result.category = String(withFootprint.category)
  if (withFootprint.position !== undefined) result.position = point(withFootprint.position, `buildings[${index}].position`)
  if (withFootprint.size !== undefined) result.size = positivePair(withFootprint.size, `buildings[${index}].size`)
  if (withFootprint.color !== undefined) result.color = String(withFootprint.color)
  if (withFootprint.zoneId !== undefined) result.zoneId = String(withFootprint.zoneId)
  if (withFootprint.levels !== undefined) result.levels = withFootprint.levels as CampusBuilding['levels']
  return result
}

function polylineLength(points: Point[]): number {
  let length = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1])
  }
  return length
}

/** 保留所有字段；只改 nodes.position → at、segments → edges + 迁移期 segments。 */
export function migrateRoadNetwork(raw: unknown): CampusRoadNetwork {
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.segments)) {
    throw new Error('roadNetwork 必须包含 nodes 与 segments 数组')
  }
  const nodes = raw.nodes.map((item, index) => {
    if (!isRecord(item)) throw new Error(`roadNetwork.nodes[${index}] 不是对象`)
    if (item.position === undefined) throw new Error(`roadNetwork.nodes[${index}].position 缺失`)
    return { ...item, id: String(item.id), at: point(item.position, `roadNetwork.nodes[${index}].position`) }
  })
  const edges: RoadEdge[] = raw.segments.map((item, index) => {
    if (!isRecord(item)) throw new Error(`roadNetwork.segments[${index}] 不是对象`)
    const centerline = item.centerline === undefined ? undefined : pointList(item.centerline, `roadNetwork.segments[${index}].centerline`)
    const width = item.width === undefined ? undefined : Number(item.width)
    if (width !== undefined && (!(width > 0))) throw new Error(`roadNetwork.segments[${index}].width 必须大于 0`)
    const cost = (centerline ? polylineLength(centerline) : 0) || width
    if (cost === undefined || !(cost > 0)) {
      throw new Error(`roadNetwork.segments[${index}] 缺少可用的 centerline 或 width，无法计算 cost`)
    }
    const edge: RoadEdge = { from: String(item.from), to: String(item.to), cost }
    for (const key of ['kind', 'width', 'class', 'surface', 'access', 'centerline', 'sourceIds'] as const) {
      if (item[key] !== undefined) {
        Object.assign(edge, { [key]: item[key] })
      }
    }
    return edge
  })
  return {
    nodes,
    edges,
    segments: raw.segments as Record<string, unknown>[],
  }
}

/** 把旧版静态数据完整映射成 v2 的 `campus.json`（元数据仍留在 `pack.json`）。 */
export function migrateCampusData(raw: unknown): CampusPackData {
  if (!isRecord(raw)) throw new Error('campus data 必须是对象')
  const requiredArrays = ['zones', 'buildings', 'roads', 'waters', 'fields', 'trees', 'pois'] as const
  for (const key of requiredArrays) {
    if (!Array.isArray(raw[key])) throw new Error(`${key} 必须是数组`)
  }
  if (raw.roadNetwork === undefined) throw new Error('roadNetwork 缺失')

  return {
    zones: (raw.zones as UnknownRecord[]).map(zone),
    buildings: (raw.buildings as UnknownRecord[]).map(building),
    roads: raw.roads as CampusPackData['roads'],
    waters: raw.waters as CampusPackData['waters'],
    fields: raw.fields as CampusPackData['fields'],
    trees: raw.trees as CampusPackData['trees'],
    pois: raw.pois as CampusPackData['pois'],
    roadNetwork: migrateRoadNetwork(raw.roadNetwork),
  }
}
