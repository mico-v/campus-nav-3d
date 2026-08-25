import type { CampusData } from './campusData'
import { validateRoadNetwork } from './roadNetwork'
import { validateRoadTopologyConsistency } from './roadNormalization'

const BUILDING_CATEGORIES = new Set(['dorm', 'academic', 'landscape', 'sports', 'service', 'admin', 'library', 'gate', 'canteen', 'poi'])
const ZONE_CATEGORIES = new Set(['dorm', 'academic', 'landscape', 'sports', 'service', 'admin'])
const ROAD_KINDS = new Set(['graph', 'road', 'canal'])
const POI_KINDS = new Set(['landmark', 'service', 'gate'])

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown, dimensions: number): value is number[] {
  return Array.isArray(value) && value.length === dimensions && value.every(isFiniteNumber)
}

function samePoint(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function orientation(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function onSegment(a: readonly number[], b: readonly number[], p: readonly number[]): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
}

function segmentsIntersect(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  const eps = 1e-9
  if (Math.abs(abC) <= eps && onSegment(a, b, c)) return true
  if (Math.abs(abD) <= eps && onSegment(a, b, d)) return true
  if (Math.abs(cdA) <= eps && onSegment(c, d, a)) return true
  if (Math.abs(cdB) <= eps && onSegment(c, d, b)) return true
  return (abC > eps) !== (abD > eps) && (cdA > eps) !== (cdB > eps)
}

function polygonProblems(points: unknown): string[] {
  if (!Array.isArray(points)) return ['不是数组']
  if (points.length < 3) return ['至少需要 3 个顶点']
  const errors: string[] = []
  if (!points.every((point) => isPoint(point, 2))) errors.push('存在无效顶点坐标')
  if (errors.length) return errors
  const polygon = points as number[][]
  const duplicate = polygon.some((point, index) => polygon.some((other, otherIndex) => index !== otherIndex && samePoint(point, other)))
  if (duplicate) errors.push('存在重复顶点')
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const next = polygon[(i + 1) % polygon.length]
    area += polygon[i][0] * next[1] - next[0] * polygon[i][1]
  }
  if (Math.abs(area) < 1e-9) errors.push('面积为零')
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    for (let j = i + 1; j < polygon.length; j += 1) {
      if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue
      const c = polygon[j]
      const d = polygon[(j + 1) % polygon.length]
      if (segmentsIntersect(a, b, c, d)) errors.push('存在自相交边界')
    }
  }
  return [...new Set(errors)]
}

function checkId(value: unknown, label: string, errors: string[]): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} 缺少有效 id`)
    return false
  }
  return true
}

function checkBox(value: RecordValue, label: string, errors: string[]): void {
  if (!isPoint(value.center, 2)) errors.push(`${label} center 坐标无效`)
  if (!isPoint(value.size, 2) || value.size.some((item) => item <= 0)) errors.push(`${label} size 尺寸无效`)
}

function checkOptionalPolygon(value: RecordValue, label: string, errors: string[]): void {
  if (value.footprint === undefined) return
  for (const problem of polygonProblems(value.footprint)) errors.push(`${label} footprint ${problem}`)
}

/** Shared strict validation used by both the editor and the save API. */
export function validateCampusDataValue(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['campus data 必须是对象']
  if ('routes' in value) errors.push('静态地图数据不能包含 routes；导航路线只能存在于运行时结果')
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('name 必须是非空字符串')
  if (!isRecord(value.bounds) || !isFiniteNumber(value.bounds.width) || !isFiniteNumber(value.bounds.depth) || value.bounds.width <= 0 || value.bounds.depth <= 0) {
    errors.push('bounds.width/depth 必须是正数')
  }

  const keys = ['zones', 'buildings', 'roads', 'waters', 'fields', 'trees', 'pois'] as const
  for (const key of keys) if (!Array.isArray(value[key])) errors.push(`${key} 必须是数组`)
  if (errors.some((error) => error.includes('必须是数组'))) return errors

  const collections = [
    ['区域', value.zones], ['建筑', value.buildings], ['道路', value.roads],
    ['水体', value.waters], ['操场', value.fields], ['POI', value.pois],
  ] as Array<[string, unknown[]]>
  const ids = new Set<string>()
  for (const [kind, items] of collections) {
    items.forEach((item, index) => {
      if (!isRecord(item)) { errors.push(`${kind}[${index}] 必须是对象`); return }
      if (checkId(item.id, `${kind}[${index}]`, errors)) {
        if (ids.has(item.id)) errors.push(`id 重复：${item.id}`)
        ids.add(item.id)
      }
    })
  }

  const zones = value.zones as unknown[]
  const zoneIds = new Set(zones.filter(isRecord).map((zone) => typeof zone.id === 'string' ? zone.id : ''))
  const buildingIds = new Set((value.buildings as unknown[]).filter(isRecord).map((building) => typeof building.id === 'string' ? building.id : ''))

  ;(value.zones as unknown[]).forEach((raw, index) => {
    if (!isRecord(raw)) return
    if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push(`区域[${index}] name 无效`)
    if (!ZONE_CATEGORIES.has(String(raw.category))) errors.push(`区域[${index}] category 无效`)
    checkBox(raw, `区域 ${String(raw.id)}`, errors)
    checkOptionalPolygon(raw, `区域 ${String(raw.id)}`, errors)
    if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) errors.push(`区域 ${String(raw.id)} color 无效`)
  })
  ;(value.buildings as unknown[]).forEach((raw, index) => {
    if (!isRecord(raw)) return
    if (typeof raw.name !== 'string') errors.push(`建筑[${index}] name 无效`)
    if (!BUILDING_CATEGORIES.has(String(raw.category))) errors.push(`建筑[${index}] category 无效`)
    if (!isPoint(raw.position, 2)) errors.push(`建筑[${index}] position 坐标无效`)
    if (!isPoint(raw.size, 2) || raw.size.some((item) => item <= 0)) errors.push(`建筑[${index}] size 尺寸无效`)
    if (!isFiniteNumber(raw.height) || raw.height < 0) errors.push(`建筑[${index}] height 无效`)
    checkOptionalPolygon(raw, `建筑 ${String(raw.id)}`, errors)
    if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color))) errors.push(`建筑 ${String(raw.id)} color 无效`)
    if (raw.zoneId !== undefined && (typeof raw.zoneId !== 'string' || !zoneIds.has(raw.zoneId))) errors.push(`建筑 ${String(raw.id)} zoneId 不存在`)
  })
  ;(value.roads as unknown[]).forEach((raw) => {
    if (!isRecord(raw)) return
    const id = String(raw.id)
    if (raw.name !== undefined && (typeof raw.name !== 'string' || !raw.name.trim())) errors.push(`道路 ${id} name 无效`)
    const points = raw.points
    if (!Array.isArray(points) || points.length < 2) errors.push(`道路 ${id} 至少需要 2 个节点`)
    else {
      points.forEach((point, pointIndex) => {
        if (!isPoint(point, 2)) errors.push(`道路 ${id} 节点 ${pointIndex + 1} 坐标无效`)
        if (pointIndex > 0 && isPoint(point, 2) && isPoint(points[pointIndex - 1], 2) && samePoint(point, points[pointIndex - 1])) errors.push(`道路 ${id} 存在零长度线段`)
      })
    }
    if (!isFiniteNumber(raw.width) || raw.width <= 0) errors.push(`道路 ${id} width 无效`)
    if (raw.kind !== undefined && !ROAD_KINDS.has(String(raw.kind))) errors.push(`道路 ${id} kind 无效`)
    if (raw.roadClass !== undefined && !['main', 'secondary', 'walkway', 'service', 'cycleway'].includes(String(raw.roadClass))) errors.push(`道路 ${id} roadClass 无效`)
    if (raw.surface !== undefined && !['asphalt', 'concrete', 'paving', 'gravel'].includes(String(raw.surface))) errors.push(`道路 ${id} surface 无效`)
    if (raw.oneWay !== undefined && typeof raw.oneWay !== 'boolean') errors.push(`道路 ${id} oneWay 无效`)
    if (raw.sidewalk !== undefined && typeof raw.sidewalk !== 'boolean') errors.push(`道路 ${id} sidewalk 无效`)
    if (raw.speed !== undefined && (!isFiniteNumber(raw.speed) || raw.speed <= 0)) errors.push(`道路 ${id} speed 无效`)
    const access = raw.access
    if (access !== undefined && (!isRecord(access) || !['pedestrian', 'bicycle', 'vehicle'].every((key) => typeof access[key] === 'boolean'))) errors.push(`道路 ${id} access 无效`)
    if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color))) errors.push(`道路 ${id} color 无效`)
    if (raw.sourceIds !== undefined && (!Array.isArray(raw.sourceIds) || !raw.sourceIds.every((source) => typeof source === 'string'))) errors.push(`道路 ${id} sourceIds 无效`)
  })
  ;(['waters', 'fields'] as const).forEach((key) => (value[key] as unknown[]).forEach((raw) => {
    if (!isRecord(raw)) return
    const label = `${key === 'waters' ? '水体' : '操场'} ${String(raw.id)}`
    if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push(`${label} name 无效`)
    checkBox(raw, label, errors)
    checkOptionalPolygon(raw, label, errors)
    for (const colorKey of ['color', ...(key === 'fields' ? ['stripeColor'] : [])]) {
      const color = raw[colorKey]
      if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) errors.push(`${label} ${colorKey} 无效`)
    }
  }))
  ;(value.trees as unknown[]).forEach((point, index) => { if (!isPoint(point, 2)) errors.push(`树木 ${index + 1} 坐标无效`) })
  ;(value.pois as unknown[]).forEach((raw) => {
    if (!isRecord(raw)) return
    const id = String(raw.id)
    if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push(`POI ${id} name 无效`)
    if (!POI_KINDS.has(String(raw.kind))) errors.push(`POI ${id} kind 无效`)
    if (!isPoint(raw.position, 3)) errors.push(`POI ${id} position 坐标无效`)
    if (raw.sourceBuildingId !== undefined && (typeof raw.sourceBuildingId !== 'string' || !buildingIds.has(raw.sourceBuildingId))) errors.push(`POI ${id} sourceBuildingId 不存在`)
    if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color))) errors.push(`POI ${id} color 无效`)
  })
  if (value.roadNetwork !== undefined) {
    if (!isRecord(value.roadNetwork) || !Array.isArray(value.roadNetwork.nodes) || !Array.isArray(value.roadNetwork.segments)) {
      errors.push('roadNetwork 必须包含 nodes 和 segments 数组')
    } else {
      const network = value.roadNetwork as CampusData['roadNetwork'] & object
      errors.push(...validateRoadNetwork(network).map((error) => `roadNetwork：${error}`))
      errors.push(...validateRoadTopologyConsistency(value.roads as CampusData['roads'], network).map((error) => `roadNetwork：${error}`))
    }
  }
  return [...new Set(errors)]
}

export function assertValidCampusData(value: unknown): asserts value is CampusData {
  const errors = validateCampusDataValue(value)
  if (errors.length) throw new Error(errors.slice(0, 8).join('；') + (errors.length > 8 ? `（还有 ${errors.length - 8} 项）` : ''))
}
