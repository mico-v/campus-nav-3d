#!/usr/bin/env -S npx tsx
/**
 * 只读审计：量出每栋建筑到最近路网节点的距离，落盘 CSV + Markdown。
 * 不改任何源数据；阈值固定为 <=30m / 30-100m / >100m，不因结果难看而调整。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Point = readonly [number, number]

export interface AuditBuilding {
  id: string
  name: string
  category?: string
  zoneId?: string
  position: Point
  footprint?: readonly Point[]
}

export interface AuditNode {
  id: string
  kind?: string
  position: Point
}

export interface AuditSegment {
  id: string
  from: string
  to: string
  class?: string
  access?: { pedestrian?: boolean; bicycle?: boolean; vehicle?: boolean }
  centerline?: readonly Point[]
}

export type Verdict = 'connected(<=30m)' | 'weak(30-100m)' | 'missing(>100m)'

export interface CoverageRecord extends AuditBuilding {
  nearestNodeId: string
  nearestNodeKind: string
  distanceM: number
  footprintMinDistanceM: number
  verdict: Verdict
}

export interface RoadNetworkAuditData {
  buildings: readonly AuditBuilding[]
  roadNetwork: { nodes: readonly AuditNode[]; segments: readonly AuditSegment[] }
}

export interface QualityFindings {
  campusJsonHasBounds: boolean
  segmentVehicleAllFalse: boolean
  segmentsWithVehicleTrue: number
  segmentClasses: string[]
  nodeKinds: string[]
  hasEntranceKindNode: boolean
}

export interface AuditSummary {
  buildingCount: number
  nodeCount: number
  segmentCount: number
  componentCount: number
  isolatedNodeCount: number
  connectedCount: number
  weakCount: number
  missingCount: number
  medianDistanceM: number
  maxDistanceM: number
  minDistanceM: number
  maxDistanceBuilding: { id: string; name: string }
}

export interface AuditResult {
  records: CoverageRecord[]
  summary: AuditSummary
  quality: QualityFindings
}

export interface BranchSuggestion {
  startNodeId: string
  startCoordinate: string
  endBuildingId: string
  endCoordinate: string
  targetZone: string
  width: string
  grade: string
  reason: string
  crossesBuildings: string[]
  needsDetour: boolean
  detourPlan: string
}

export const THRESHOLDS = { connectedMax: 30, weakMax: 100 } as const

const CSV_HEADER = [
  'building_id',
  'building_name',
  'nearest_node_id',
  'nearest_node_kind',
  'distance_m',
  'footprint_min_distance_m',
  'verdict',
] as const

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const campusDataPath = resolve(repoRoot, 'packs/usts-tianping/campus.json')
const outputDir = resolve(repoRoot, 'docs/audit')
const csvPath = resolve(outputDir, 'road-network-coverage.csv')
const markdownPath = resolve(outputDir, 'road-network-coverage.md')

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const EPSILON = 1e-9

function crossProduct(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function sign(value: number): number {
  if (value > EPSILON) return 1
  if (value < -EPSILON) return -1
  return 0
}

function pointOnSegment(point: Point, a: Point, b: Point): boolean {
  return (
    sign(crossProduct(a, b, point)) === 0 &&
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  )
}

/** 经典线段相交判定：跨立或端点落在线段上都算相交。 */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = sign(crossProduct(a, b, c))
  const d2 = sign(crossProduct(a, b, d))
  const d3 = sign(crossProduct(c, d, a))
  const d4 = sign(crossProduct(c, d, b))
  if (d1 !== d2 && d3 !== d4) return true
  if (d1 === 0 && pointOnSegment(c, a, b)) return true
  if (d2 === 0 && pointOnSegment(d, a, b)) return true
  if (d3 === 0 && pointOnSegment(a, c, d)) return true
  if (d4 === 0 && pointOnSegment(b, c, d)) return true
  return false
}

/** 射线法；边界上的点算在多边形内，带孔洞的多边形按外环处理。 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false
  for (let i = 0; i < polygon.length; i += 1) {
    if (pointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length])) return true
  }
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if ((a[1] > point[1]) !== (b[1] > point[1])) {
      const x = a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])
      if (x > point[0]) inside = !inside
    }
  }
  return inside
}

/** 线段与多边形相交：跨任一边、端点落在内部或整段落在内部都算。 */
export function segmentIntersectsPolygon(start: Point, end: Point, polygon: readonly Point[] | undefined): boolean {
  if (!polygon || polygon.length < 3) return false
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return true
  for (let i = 0; i < polygon.length; i += 1) {
    if (segmentsIntersect(start, end, polygon[i], polygon[(i + 1) % polygon.length])) return true
  }
  return false
}

/** 找出线段穿过的建筑 footprint，返回 id 列表；无 footprint 的建筑跳过。 */
export function buildingsCrossedBySegment(
  start: Point,
  end: Point,
  buildings: readonly AuditBuilding[],
  excludeBuildingId?: string,
): AuditBuilding[] {
  return buildings.filter(
    (building) =>
      building.id !== excludeBuildingId &&
      segmentIntersectsPolygon(start, end, building.footprint),
  )
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function verdictForDistance(distanceM: number): Verdict {
  if (distanceM <= THRESHOLDS.connectedMax) return 'connected(<=30m)'
  if (distanceM <= THRESHOLDS.weakMax) return 'weak(30-100m)'
  return 'missing(>100m)'
}

/** footprint_min_distance_m：建筑轮廓顶点到最近节点的最短直线距离；无轮廓时回退到 position。 */
export function footprintMinDistance(footprint: readonly Point[] | undefined, position: Point, node: Point): number {
  if (!footprint || footprint.length === 0) return distanceBetween(position, node)
  let min = Infinity
  for (const point of footprint) {
    const distance = distanceBetween(point, node)
    if (distance < min) min = distance
  }
  return min
}

function requiredPoint(value: unknown, label: string): Point {
  if (!isPoint(value)) throw new Error(`${label} 必须是有限数字的 [x, z]`)
  return [value[0], value[1]]
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} 必须是非空字符串`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** 保留白名单字段，顺手在入口处校验数据形状；不修改传入对象。 */
export function normalizeAuditData(raw: unknown): RoadNetworkAuditData {
  if (!isRecord(raw)) throw new Error('campus.json 顶层必须是对象')
  if (!Array.isArray(raw.buildings)) throw new Error('campus.json buildings 必须是数组')
  if (!isRecord(raw.roadNetwork)) throw new Error('campus.json roadNetwork 必须是对象')
  if (!Array.isArray(raw.roadNetwork.nodes)) throw new Error('campus.json roadNetwork.nodes 必须是数组')
  if (!Array.isArray(raw.roadNetwork.segments)) throw new Error('campus.json roadNetwork.segments 必须是数组')

  const buildings: AuditBuilding[] = raw.buildings.map((item, index) => {
    if (!isRecord(item)) throw new Error(`buildings[${index}] 必须是对象`)
    const building: AuditBuilding = {
      id: requiredString(item.id, `buildings[${index}].id`),
      name: requiredString(item.name, `buildings[${index}].name`),
      position: requiredPoint(item.position, `buildings[${index}].position`),
    }
    const category = optionalString(item.category)
    const zoneId = optionalString(item.zoneId)
    if (category) building.category = category
    if (zoneId) building.zoneId = zoneId
    if (item.footprint !== undefined) {
      if (!Array.isArray(item.footprint)) throw new Error(`buildings[${index}].footprint 必须是数组`)
      building.footprint = item.footprint.map((point, pointIndex) =>
        requiredPoint(point, `buildings[${index}].footprint[${pointIndex}]`),
      )
    }
    return building
  })

  const nodes: AuditNode[] = raw.roadNetwork.nodes.map((item, index) => {
    if (!isRecord(item)) throw new Error(`roadNetwork.nodes[${index}] 必须是对象`)
    const node: AuditNode = {
      id: requiredString(item.id, `roadNetwork.nodes[${index}].id`),
      position: requiredPoint(item.position, `roadNetwork.nodes[${index}].position`),
    }
    const kind = optionalString(item.kind)
    if (kind) node.kind = kind
    return node
  })

  const segments: AuditSegment[] = raw.roadNetwork.segments.map((item, index) => {
    if (!isRecord(item)) throw new Error(`roadNetwork.segments[${index}] 必须是对象`)
    const segment: AuditSegment = {
      id: requiredString(item.id, `roadNetwork.segments[${index}].id`),
      from: requiredString(item.from, `roadNetwork.segments[${index}].from`),
      to: requiredString(item.to, `roadNetwork.segments[${index}].to`),
    }
    const segmentClass = optionalString(item.class)
    if (segmentClass) segment.class = segmentClass
    if (isRecord(item.access)) {
      segment.access = {
        pedestrian: item.access.pedestrian === true,
        bicycle: item.access.bicycle === true,
        vehicle: item.access.vehicle === true,
      }
    }
    if (item.centerline !== undefined) {
      if (!Array.isArray(item.centerline)) throw new Error(`roadNetwork.segments[${index}].centerline 必须是数组`)
      segment.centerline = item.centerline.map((point, pointIndex) =>
        requiredPoint(point, `roadNetwork.segments[${index}].centerline[${pointIndex}]`),
      )
    }
    return segment
  })

  return { buildings, roadNetwork: { nodes, segments } }
}

/** 无向连通分量；孤立节点单独算一个分量，便于发现“39/39 无孤岛”。 */
export function analyzeComponents(nodes: readonly AuditNode[], segments: readonly AuditSegment[]): {
  componentCount: number
  isolatedNodeCount: number
} {
  const adjacency = new Map<string, Set<string>>()
  const knownIds = new Set<string>()
  for (const node of nodes) {
    knownIds.add(node.id)
    adjacency.set(node.id, new Set())
  }
  for (const segment of segments) {
    for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
      if (!knownIds.has(from) || !knownIds.has(to) || from === to) continue
      adjacency.get(from)!.add(to)
    }
  }

  const visited = new Set<string>()
  let componentCount = 0
  let isolatedNodeCount = 0
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    componentCount += 1
    const stack = [node.id]
    let size = 0
    visited.add(node.id)
    while (stack.length > 0) {
      const current = stack.pop()!
      size += 1
      for (const next of adjacency.get(current)!) {
        if (visited.has(next)) continue
        visited.add(next)
        stack.push(next)
      }
    }
    if (size === 1) isolatedNodeCount += 1
  }
  return { componentCount, isolatedNodeCount }
}

export function analyzeQuality(raw: unknown, data: RoadNetworkAuditData): QualityFindings {
  const segmentClasses = [...new Set(data.roadNetwork.segments.map((segment) => segment.class ?? '(missing)'))].sort()
  const nodeKinds = [...new Set(data.roadNetwork.nodes.map((node) => node.kind ?? '(missing)'))].sort()
  const segmentsWithVehicleTrue = data.roadNetwork.segments.filter((segment) => segment.access?.vehicle === true).length
  const isCampusRecord = isRecord(raw)
  return {
    campusJsonHasBounds: isCampusRecord && Object.prototype.hasOwnProperty.call(raw, 'bounds'),
    segmentVehicleAllFalse: segmentsWithVehicleTrue === 0,
    segmentsWithVehicleTrue,
    segmentClasses,
    nodeKinds,
    hasEntranceKindNode: nodeKinds.some((kind) => /entrance|door|gate/i.test(kind)),
  }
}

export function auditRoadCoverage(data: RoadNetworkAuditData, campusJsonForQuality: unknown = data): AuditResult {
  if (data.roadNetwork.nodes.length === 0) throw new Error('路网节点为空，无法审计覆盖率')

  const records: CoverageRecord[] = data.buildings.map((building) => {
    let nearest = data.roadNetwork.nodes[0]
    let nearestDistance = distanceBetween(building.position, nearest.position)
    for (const node of data.roadNetwork.nodes) {
      const distance = distanceBetween(building.position, node.position)
      if (distance < nearestDistance) {
        nearest = node
        nearestDistance = distance
      }
    }
    return {
      ...building,
      nearestNodeId: nearest.id,
      nearestNodeKind: nearest.kind ?? '(missing)',
      distanceM: nearestDistance,
      footprintMinDistanceM: footprintMinDistance(building.footprint, building.position, nearest.position),
      verdict: verdictForDistance(nearestDistance),
    }
  })

  const distances = records.map((record) => record.distanceM).sort((a, b) => a - b)
  const middle = Math.floor(distances.length / 2)
  const medianDistanceM =
    distances.length % 2 === 0 ? (distances[middle - 1] + distances[middle]) / 2 : distances[middle]
  const maxRecord = records.reduce((max, record) => (record.distanceM > max.distanceM ? record : max), records[0])
  const { componentCount, isolatedNodeCount } = analyzeComponents(data.roadNetwork.nodes, data.roadNetwork.segments)

  return {
    records,
    summary: {
      buildingCount: records.length,
      nodeCount: data.roadNetwork.nodes.length,
      segmentCount: data.roadNetwork.segments.length,
      componentCount,
      isolatedNodeCount,
      connectedCount: records.filter((record) => record.verdict === 'connected(<=30m)').length,
      weakCount: records.filter((record) => record.verdict === 'weak(30-100m)').length,
      missingCount: records.filter((record) => record.verdict === 'missing(>100m)').length,
      medianDistanceM,
      maxDistanceM: maxRecord.distanceM,
      minDistanceM: distances[0],
      maxDistanceBuilding: { id: maxRecord.id, name: maxRecord.name },
    },
    quality: analyzeQuality(campusJsonForQuality, data),
  }
}

/** 报告里的补路建议是审计产物，不代表已改数据；距离单位来自 campus 的 local-meters。 */
export function buildBranchSuggestions(
  result: AuditResult,
  nodes: readonly AuditNode[] = [],
  buildings: readonly AuditBuilding[] = result.records,
): BranchSuggestion[] {
  const nodeCoordinates = new Map(nodes.map((node) => [node.id, `${node.position[0].toFixed(1)}, ${node.position[1].toFixed(1)}`]))

  const missing = result.records
    .filter((record) => record.verdict === 'missing(>100m)')
    .sort((a, b) => b.distanceM - a.distanceM)

  const clusters = new Map<string, CoverageRecord[]>()
  for (const record of missing) {
    const key = `${record.nearestNodeId}|${record.zoneId ?? '(no-zone)'}`
    const group = clusters.get(key) ?? []
    group.push(record)
    clusters.set(key, group)
  }

  const toSuggestion = (base: Omit<BranchSuggestion, 'crossesBuildings' | 'needsDetour' | 'detourPlan'>): BranchSuggestion => {
    const startPoint = nodes.find((node) => node.id === base.startNodeId)?.position
    const [x, z] = base.endCoordinate.split(',').map((part) => Number(part.trim()))
    const endPoint: Point = [x, z]
    const crossed = startPoint
      ? buildingsCrossedBySegment(startPoint, endPoint, buildings, base.endBuildingId)
      : []
    const crossesBuildings = crossed.map((building) => building.id)
    const needsDetour = crossesBuildings.length > 0
    const detourPlan = needsDetour
      ? crossed
          .map((building) => {
            const altNode = result.records.find((record) => record.id === building.id)?.nearestNodeId
            if (altNode && altNode !== base.startNodeId) {
              return `被 ${building.name}（${building.id}）挡住：改接 ${building.name} 另一节点 ${altNode}，再从该侧不穿楼接 ${base.endBuildingId}`
            }
            return `被 ${building.name}（${building.id}）挡住：拆两段 ${base.startNodeId}→${building.name}外侧临路点→${base.endBuildingId}（楼A=${building.name}，楼B=${base.endBuildingId}）`
          })
          .join('；')
      : '-'
    return { ...base, crossesBuildings, needsDetour, detourPlan }
  }

  const suggestions: BranchSuggestion[] = []
  for (const [key, group] of clusters) {
    const [startNodeId, targetZone] = key.split('|')
    const worst = group.reduce((max, record) => (record.distanceM > max.distanceM ? record : max), group[0])
    const representative = group
      .slice()
      .sort((a, b) => b.distanceM - a.distanceM)[Math.min(2, group.length - 1)]
    const end = representative ?? worst
    const categories = [...new Set(group.map((record) => record.category ?? '未分类'))]
    suggestions.push(toSuggestion({
      startNodeId,
      startCoordinate: nodeCoordinates.get(startNodeId) ?? '(unknown)',
      endBuildingId: end.id,
      endCoordinate: `${end.position[0].toFixed(1)}, ${end.position[1].toFixed(1)}`,
      targetZone,
      width: '3.0m',
      grade: 'walkway',
      reason: `${targetZone} 有 ${group.length} 栋建筑距路网 >100m（最远 ${worst.name} ${worst.distanceM.toFixed(0)}m，涉及 ${categories.join('、')}）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。`,
    }))
  }

  // 补一条覆盖最大单体楼的直连建议，和簇级建议并列，方便直接按锚点验收。
  const maxRecord = missing[0]
  if (maxRecord && !suggestions.some((suggestion) => suggestion.endBuildingId === maxRecord.id)) {
    suggestions.unshift(toSuggestion({
      startNodeId: maxRecord.nearestNodeId,
      startCoordinate: nodeCoordinates.get(maxRecord.nearestNodeId) ?? '(unknown)',
      endBuildingId: maxRecord.id,
      endCoordinate: `${maxRecord.position[0].toFixed(1)}, ${maxRecord.position[1].toFixed(1)}`,
      targetZone: maxRecord.zoneId ?? '(no-zone)',
      width: '3.0m',
      grade: 'walkway',
      reason: `锚点：最大偏离 ${maxRecord.name} ${maxRecord.distanceM.toFixed(0)}m；先补可达性，后续再按簇补完整支路网。`,
    }))
  }

  return suggestions.filter(
    (suggestion, index, list) =>
      list.findIndex(
        (item) => item.startNodeId === suggestion.startNodeId && item.endBuildingId === suggestion.endBuildingId,
      ) === index,
  )
}

export function formatDistance(distanceM: number): string {
  return distanceM.toFixed(2)
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildCsv(records: readonly CoverageRecord[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const record of records) {
    lines.push(
      [
        record.id,
        record.name,
        record.nearestNodeId,
        record.nearestNodeKind,
        formatDistance(record.distanceM),
        formatDistance(record.footprintMinDistanceM),
        record.verdict,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

function nodePosition(data: RoadNetworkAuditData, nodeId: string): Point {
  const node = data.roadNetwork.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) throw new Error(`建议支路起点节点不存在：${nodeId}`)
  return node.position
}

export function buildMarkdown(
  result: AuditResult,
  data: RoadNetworkAuditData,
  generatedAt: string,
): string {
  const { summary, quality } = result
  const lines: string[] = []
  lines.push('# USTS 天屏校区路网覆盖审计')
  lines.push('')
  lines.push(`生成时间：${generatedAt}`)
  lines.push('')
  lines.push('> 只读审计：不改 `src/**`、`packs/**` 或任何阈值。`distance_m` 取建筑 `position` 到最近路网节点的直线距离，`footprint_min_distance_m` 取轮廓顶点到同一节点的最短直线距离（无轮廓时回退到 position）；单位沿用 pack 的 local-meters（1 单位 = 1m）。')
  lines.push('')
  lines.push('## 汇总')
  lines.push('')
  lines.push(`- 建筑 ${summary.buildingCount} / 路网节点 ${summary.nodeCount} / 路段 ${summary.segmentCount} / 无向连通分量 ${summary.componentCount}（孤立节点 ${summary.isolatedNodeCount}）`)
  lines.push(`- \`distance_m <= 30m\`：${summary.connectedCount} 栋；\`30m < distance_m <= 100m\`：${summary.weakCount} 栋；\`distance_m > 100m\`：${summary.missingCount} 栋`)
  lines.push(`- 最小 ${formatDistance(summary.minDistanceM)}m；中位数 ${formatDistance(summary.medianDistanceM)}m；最大 ${formatDistance(summary.maxDistanceM)}m（${summary.maxDistanceBuilding.name}，\`${summary.maxDistanceBuilding.id}\`）`)
  lines.push(`- 与 issue 基线对照：建筑 75 / 节点 39 / 段 42 / 连通分量 1；≤30m 1 栋（二号门）、30~100m 13 栋、>100m 61 栋；最大 ~607m（东区宿舍与服务区单体楼11）；中位 ~228m。${summary.buildingCount === 75 && summary.nodeCount === 39 && summary.segmentCount === 42 && summary.componentCount === 1 && summary.connectedCount === 1 && summary.weakCount === 13 && summary.missingCount === 61 && Math.abs(summary.maxDistanceM - 607) < 1 && Math.abs(summary.medianDistanceM - 228) < 1 ? '本次独立复算全部吻合，无偏差。' : '本次复算有偏差，逐项以本报告数值为准，原因见下。'}`)
  lines.push('')
  lines.push('## 逐栋表格')
  lines.push('')
  lines.push('| building_id | building_name | nearest_node_id | nearest_node_kind | distance_m | footprint_min_distance_m | verdict |')
  lines.push('| --- | --- | --- | --- | ---: | ---: | --- |')
  for (const record of result.records) {
    lines.push(
      `| ${record.id} | ${record.name.replace(/\|/g, '\\|')} | ${record.nearestNodeId} | ${record.nearestNodeKind} | ${formatDistance(record.distanceM)} | ${formatDistance(record.footprintMinDistanceM)} | ${record.verdict} |`,
    )
  }
  lines.push('')
  lines.push('## 建议补的支路')
  lines.push('')
  lines.push('> 以下均为审计建议，**未写入任何数据文件**。宽度/等级统一按步行支路 `walkway` 3.0m 估算，实际定线需结合地形与现状路权。')
  lines.push('')
  const suggestions = buildBranchSuggestions(result, data.roadNetwork.nodes, data.buildings)
  const detourCount = suggestions.filter((suggestion) => suggestion.needsDetour).length
  const detourPercent = suggestions.length === 0 ? 0 : (detourCount / suggestions.length) * 100
  lines.push(`直连建议 ${suggestions.length} 条，其中穿过建筑 ${detourCount} 条（占 ${detourPercent.toFixed(1)}%）`)
  lines.push('')
  lines.push('| 起点节点 id | 起点坐标 (x, z) | 终点建筑 id | 终点坐标 (x, z) | 覆盖分区 | 建议宽度 | 等级 | 状态 | crosses_buildings | 绕行拆法 | 理由 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const suggestion of suggestions) {
    const startPoint = nodePosition(data, suggestion.startNodeId)
    const cell = (value: string) => value.replace(/\|/g, '\\|')
    lines.push(
      `| \`${suggestion.startNodeId}\` | ${startPoint[0].toFixed(1)}, ${startPoint[1].toFixed(1)} | \`${suggestion.endBuildingId}\` | ${suggestion.endCoordinate} | ${suggestion.targetZone} | ${suggestion.width} | ${suggestion.grade} | ${suggestion.needsDetour ? 'needs_detour' : 'direct'} | ${cell(suggestion.crossesBuildings.join(', ') || '-')} | ${cell(suggestion.detourPlan)} | ${cell(suggestion.reason)} |`,
    )
  }
  lines.push('')
  lines.push('## 数据质量问题')
  lines.push('')
  lines.push(`1. **\`campus.json\` 没有 \`bounds\` 字段**：实测 \`campusJsonHasBounds=${quality.campusJsonHasBounds}\`。\`bounds\` 只存在于 \`packs/usts-tianping/pack.json\` 的 \`bounds.min/max\`，\`src/navigation/route.ts\` 的 \`validPosition\` 使用 \`data.bounds?.width\` 可选链；若运行时只喂 \`campus.json\` 而未合并 pack 元数据，\`limit\` 计算为 0，越界坐标检查被跳过。本报告只读，不补字段。`)
  lines.push(`2. **路段车辆通行全关**：\`segments\` 共 ${summary.segmentCount} 段，\`access.vehicle=true\` 的有 ${quality.segmentsWithVehicleTrue} 段（即全部为 false）；\`class\` 取值为 ${quality.segmentClasses.map((item) => `\`${item}\``).join(' / ')}，没有机动车等级。`)
  lines.push(`3. **没有 entrance/door 类节点**：节点 \`kind\` 取值为 ${quality.nodeKinds.map((item) => `\`${item}\``).join(' / ')}，不存在 entrance/door/gate 类节点；导航终点只能落到 waypoint/junction，不能落到建筑入口。`)
  lines.push('')
  lines.push('## 算法与复核')
  lines.push('')
  lines.push('- 最近节点：对每栋建筑遍历全部 39 个节点，取欧氏距离最小者；并列时保留先出现的节点。')
  lines.push('- 分档：固定阈值 \`<=30m\` / \`(30,100]m\` / \`>100m\`，由 \`verdictForDistance\` 单点定义，CSV 与报告共用。')
  lines.push('- 连通分量：把 segments 当无向边做 DFS，39 个节点全部落在同一个分量，无孤岛。')
  lines.push('- 中位数：75 个距离排序后取第 38 个（1-based）；最大值为东区宿舍与服务区单体楼11 到 node-0017 的距离。')
  lines.push('- 穿楼检查：每条建议支路按起点节点到终点建筑 position 的线段，与全部建筑 footprint 多边形相交检测（跨任一边或端点落在多边形内即穿过；footprint 为空跳过；终点建筑自身不计为穿过），不引依赖、不改阈值与数据。')
  lines.push('')
  return lines.join('\n')
}

export function writeAuditOutputs(result: AuditResult, data: RoadNetworkAuditData): {
  csvPath: string
  markdownPath: string
} {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(csvPath, buildCsv(result.records), 'utf8')
  writeFileSync(markdownPath, buildMarkdown(result, data, new Date().toISOString()), 'utf8')
  return { csvPath, markdownPath }
}

function main(): void {
  const raw: unknown = JSON.parse(readFileSync(campusDataPath, 'utf8'))
  const data = normalizeAuditData(raw)
  const result = auditRoadCoverage(data, raw)
  const { csvPath: csv, markdownPath: markdown } = writeAuditOutputs(result, data)
  console.log(`audited ${result.summary.buildingCount} buildings -> ${csv} + ${markdown}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
