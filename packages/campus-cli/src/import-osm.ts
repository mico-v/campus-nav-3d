/**
 * OSM Overpass 导出 -> campus-pack/2 L1 建筑片段。
 *
 * 几何纯手写：WGS84 经纬度按导出中心投影到本地米，鞋带公式算面积。
 * OSM 派生数据带 ODbL 1.0 许可与署名，避免下游误当成自有数据。
 */

import type { CampusBuilding, CampusPackData, Point } from '../../campus-schema/src/index.ts'

export const OSM_LICENSE = 'ODbL-1.0'
export const OSM_ATTRIBUTION = 'Building footprints © OpenStreetMap contributors, available under ODbL 1.0'

const EARTH_RADIUS = 6_371_008.8
const DEG = Math.PI / 180

type UnknownRecord = Record<string, unknown>

export interface OsmNode {
  id: number
  lat: number
  lon: number
}

export interface OsmWay {
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

export interface OsmExport {
  elements?: unknown[]
}

export interface ImportOsmOptions {
  /** 最小建筑面积，单位平方米；小于该值的轮廓丢弃。默认 20。 */
  minArea?: number
  /** 覆盖默认许可；用于包级合并时保留包自己的 license。 */
  license?: string
  /** 追加署名条目；有 OSM 派生建筑时自动带上 ODbL 署名。 */
  attribution?: string[]
  /** 合并到已有 pack；已有建筑的 id / footprint / name 等人工字段优先。 */
  base?: Record<string, unknown> | CampusPackData
  /** 生成建筑默认高度（米），已有建筑不受影响。默认 8。 */
  defaultHeight?: number
}

export interface ImportOsmResult {
  pack: Record<string, unknown>
  stats: {
    ways: number
    kept: number
    skippedNoGeometry: number
    skippedSmallArea: number
    skippedNoName: number
    skippedDuplicateId: number
  }
}

interface Candidate {
  id: string
  name: string
  footprint: Point[]
  area: number
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidOsmNode(value: unknown): value is OsmNode {
  return (
    isRecord(value) &&
    value.type === 'node' &&
    isFiniteNumber(value.id) &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon)
  )
}

function isValidOsmWay(value: unknown): value is OsmWay {
  if (!isRecord(value) || value.type !== 'way' || !isFiniteNumber(value.id) || !Array.isArray(value.nodes)) return false
  if (!value.nodes.every(isFiniteNumber)) return false
  if (value.tags !== undefined && !isRecord(value.tags)) return false
  return true
}

/** 经纬度按导出中心做等距圆柱投影，局部小片面积误差可忽略。 */
function localProject(node: OsmNode, lat0: number, lon0: number): Point {
  return [
    (node.lon - lon0) * DEG * EARTH_RADIUS * Math.cos(lat0 * DEG),
    (node.lat - lat0) * DEG * EARTH_RADIUS,
  ]
}

/** 鞋带公式；返回平方米。 */
export function polygonArea(vertices: readonly Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index]!
    const [x2, y2] = vertices[(index + 1) % vertices.length]!
    twiceArea += x1 * y2 - x2 * y1
  }
  return Math.abs(twiceArea) / 2
}

function centroid(vertices: readonly Point[]): Point {
  let x = 0
  let y = 0
  for (const [px, py] of vertices) {
    x += px
    y += py
  }
  return [x / vertices.length, y / vertices.length]
}

/** slug 用于稳定 id；中文等非 ASCII 用 osm-<wayId> 兜底。 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'osm'
}

function toBuildingId(wayId: number, name: string): string {
  const source = slugify(name)
  const suffix = `${wayId}`
  const base = source.length > 40 ? source.slice(0, 40).replace(/-+$/, '') : source
  return `osm-${base}-${suffix}`
}

function cleanFootprint(points: Point[]): Point[] {
  const unique: Point[] = []
  for (const point of points) {
    const last = unique[unique.length - 1]
    if (last && last[0] === point[0] && last[1] === point[1]) continue
    unique.push(point)
  }
  if (unique.length > 1) {
    const first = unique[0]!
    const last = unique[unique.length - 1]!
    if (first[0] === last[0] && first[1] === last[1]) unique.pop()
  }
  return unique
}

function mergeAttribution(existing: unknown, packChanged: boolean): string[] {
  const merged = new Set<string>()
  if (Array.isArray(existing)) {
    for (const item of existing) if (typeof item === 'string' && item.trim()) merged.add(item)
  }
  if (packChanged) merged.add(OSM_ATTRIBUTION)
  return [...merged]
}

/**
 * 把 Overpass 导出转成 campus-pack/2 片段。
 * 只抽带 name 的 building way；无名称、过小、闭合失败的轮廓直接跳过。
 */
export function importOsmFromExport(exported: unknown, options: ImportOsmOptions = {}): ImportOsmResult {
  if (!isRecord(exported) || !Array.isArray(exported.elements)) {
    throw new TypeError('OSM 导出格式无效：缺少 elements 数组')
  }

  const minArea = options.minArea ?? 20
  const defaultHeight = options.defaultHeight ?? 8
  const nodes = new Map<number, OsmNode>()
  const ways: OsmWay[] = []
  for (const element of exported.elements) {
    if (isValidOsmNode(element)) nodes.set(element.id, element)
    else if (isValidOsmWay(element)) ways.push(element)
  }

  const nodeList = [...nodes.values()]
  const lat0 = nodeList.length > 0 ? nodeList.reduce((sum, node) => sum + node.lat, 0) / nodeList.length : 0
  const lon0 = nodeList.length > 0 ? nodeList.reduce((sum, node) => sum + node.lon, 0) / nodeList.length : 0

  const stats: ImportOsmResult['stats'] = {
    ways: ways.length,
    kept: 0,
    skippedNoGeometry: 0,
    skippedSmallArea: 0,
    skippedNoName: 0,
    skippedDuplicateId: 0,
  }
  const candidates: Candidate[] = []
  const seenIds = new Set<string>()

  for (const way of ways) {
    if (!way.tags || !way.tags.building) {
      stats.skippedNoGeometry += 1
      continue
    }
    const name = way.tags.name?.trim() ?? ''
    if (!name) {
      stats.skippedNoName += 1
      continue
    }
    const points = way.nodes
      .map((id) => nodes.get(id))
      .filter((node): node is OsmNode => node !== undefined)
      .map((node) => localProject(node, lat0, lon0))
    const footprint = cleanFootprint(points)
    if (footprint.length < 3) {
      stats.skippedNoGeometry += 1
      continue
    }
    const area = polygonArea(footprint)
    if (area < minArea) {
      stats.skippedSmallArea += 1
      continue
    }
    const id = toBuildingId(way.id, name)
    if (seenIds.has(id)) {
      stats.skippedDuplicateId += 1
      continue
    }
    seenIds.add(id)
    candidates.push({ id, name, footprint, area })
  }

  const imports: CampusBuilding[] = candidates.map(({ id, name, footprint }) => {
    const [x, y] = centroid(footprint)
    return {
      id,
      name,
      footprint,
      height: defaultHeight,
      position: [x, y],
      }
  })
  stats.kept = imports.length

  const base = isRecord(options.base) ? { ...options.base } : {}
  const baseAttribution = Array.isArray(base.attribution) ? [...base.attribution] : []
  const baseBuildings = Array.isArray(base.buildings) ? [...base.buildings] : []
  const byId = new Map<string, UnknownRecord>()
  for (const building of baseBuildings) {
    if (isRecord(building) && typeof building.id === 'string') byId.set(building.id, building)
  }
  for (const building of imports) {
    const existing = byId.get(building.id)
    if (!existing) {
      baseBuildings.push(building)
      continue
    }
    // 人工字段优先：已有值保留，缺失字段用 OSM 结果补齐。
    baseBuildings[baseBuildings.indexOf(existing)] = { ...building, ...existing }
  }
  base.buildings = baseBuildings

  const packChanged = imports.length > 0
  const license = options.license ?? (typeof base.license === 'string' && base.license ? base.license : OSM_LICENSE)
  base.license = license
  const importedAttribution = mergeAttribution(baseAttribution, packChanged)
  const extraAttribution = Array.isArray(options.attribution) ? options.attribution : []
  base.attribution = [...new Set([...importedAttribution, ...extraAttribution])]

  return { pack: base, stats }
}
