import type { Road } from './campusData'

export type RoadNodeKind = 'junction' | 'entrance' | 'poi-anchor' | 'waypoint'
export type RoadClass = 'main' | 'secondary' | 'walkway' | 'service' | 'cycleway'
export type RoadSurface = 'asphalt' | 'concrete' | 'paving' | 'gravel'

export interface RoadAccess {
  pedestrian: boolean
  bicycle: boolean
  vehicle: boolean
}

export interface RoadNode {
  id: string
  position: [number, number]
  kind: RoadNodeKind
  /** Source road IDs touching this node; used to preserve node identity while editing. */
  sourceIds?: string[]
}

export interface RoadSegment {
  id: string
  from: string
  to: string
  centerline: [number, number][]
  width: number
  class: RoadClass
  surface: RoadSurface
  access: RoadAccess
  kind?: 'graph' | 'road' | 'canal'
  color?: string
  oneWay?: boolean
  speed?: number
  sidewalk?: boolean
  elevation?: number
  sourceIds?: string[]
}

export interface RoadNetwork {
  nodes: RoadNode[]
  segments: RoadSegment[]
}

export interface RoadNetworkBuildOptions {
  /** Distance used to turn near-coincident endpoints/intersections into one node. */
  snapTolerance?: number
  /** Split segments at crossings instead of leaving crossings as visual-only overlaps. */
  splitIntersections?: boolean
}

const DEFAULT_SNAP_TOLERANCE = 1

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function interpolate(a: readonly number[], b: readonly number[], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function almostEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

function samePoint(a: readonly number[], b: readonly number[], tolerance: number): boolean {
  return distance(a, b) <= tolerance
}

function pointOnSegmentDistance(point: readonly number[], a: readonly number[], b: readonly number[]): { distance: number; t: number } {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 1e-12) return { distance: distance(point, a), t: 0 }
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared))
  return { distance: distance(point, [a[0] + dx * t, a[1] + dz * t]), t }
}

function roadClass(road: Pick<Road, 'width' | 'kind'>): RoadClass {
  if (road.kind === 'canal') return 'service'
  if (road.width >= 20) return 'main'
  if (road.width <= 6) return 'walkway'
  return 'secondary'
}

function addUniqueCut(cuts: Array<{ segment: number; t: number; point: [number, number] }>, cut: { segment: number; t: number; point: [number, number] }, _tolerance: number): void {
  if (cuts.some((existing) => existing.segment === cut.segment && almostEqual(existing.t, cut.t, 1e-7))) return
  cuts.push(cut)
}

interface SegmentIntersection {
  t: number
  u: number
  point: [number, number]
}

function intersection(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], _tolerance: number): SegmentIntersection | null {
  const rX = b[0] - a[0]
  const rZ = b[1] - a[1]
  const sX = d[0] - c[0]
  const sZ = d[1] - c[1]
  const denominator = rX * sZ - rZ * sX
  if (Math.abs(denominator) <= 1e-9) return null
  const qX = c[0] - a[0]
  const qZ = c[1] - a[1]
  const t = (qX * sZ - qZ * sX) / denominator
  const u = (qX * rZ - qZ * rX) / denominator
  // `tolerance` is the world snap distance, not a parametric extension of
  // the segment. Using it here would accept intersections far outside long
  // segments whenever the snap distance is greater than one world unit.
  const parameterTolerance = 1e-9
  if (t < -parameterTolerance || t > 1 + parameterTolerance || u < -parameterTolerance || u > 1 + parameterTolerance) return null
  const clampedT = Math.max(0, Math.min(1, t))
  const point = interpolate(a, b, clampedT)
  return { t: clampedT, u: Math.max(0, Math.min(1, u)), point }
}

function nodeFor(nodes: RoadNode[], point: [number, number], tolerance: number): RoadNode {
  const existing = nodes.find((node) => samePoint(node.position, point, tolerance))
  if (existing) return existing
  const node: RoadNode = {
    id: `node-${String(nodes.length + 1).padStart(4, '0')}`,
    position: [point[0], point[1]],
    kind: 'waypoint',
  }
  nodes.push(node)
  return node
}

function addPiece(points: [number, number][], road: Road, nodes: RoadNode[], segments: RoadSegment[], tolerance: number, pieceIndex: number): void {
  const cleaned: [number, number][] = []
  points.forEach((point) => {
    if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], point, tolerance)) cleaned.push([point[0], point[1]])
  })
  if (cleaned.length < 2 || samePoint(cleaned[0], cleaned[cleaned.length - 1], tolerance)) return
  const from = nodeFor(nodes, cleaned[0], tolerance)
  const to = nodeFor(nodes, cleaned[cleaned.length - 1], tolerance)
  if (from.id === to.id) return
  segments.push({
    id: `${road.id}--${pieceIndex}`,
    from: from.id,
    to: to.id,
    centerline: cleaned,
    width: road.width,
    class: road.roadClass ?? roadClass(road),
    surface: road.surface ?? 'concrete',
    access: road.access ?? { pedestrian: true, bicycle: true, vehicle: false },
    kind: road.kind,
    color: road.color,
    ...(road.oneWay === undefined ? {} : { oneWay: road.oneWay }),
    ...(road.speed === undefined ? {} : { speed: road.speed }),
    ...(road.sidewalk === undefined ? {} : { sidewalk: road.sidewalk }),
    sourceIds: [...new Set(road.sourceIds ?? [road.id])],
  })
}

function splitRoad(road: Road, cuts: Array<{ segment: number; t: number; point: [number, number] }>, nodes: RoadNode[], segments: RoadSegment[], tolerance: number): void {
  const isClosed = road.points.length >= 4 && samePoint(road.points[0], road.points[road.points.length - 1], tolerance)
  if (isClosed) {
    // A closed authored road stores its first point again at the end. Build
    // every edge explicitly, including the closing edge, so the graph really
    // contains a loop instead of stopping at the penultimate vertex.
    const ring = road.points.slice(0, -1)
    const bySegment = new Map<number, Array<{ t: number; point: [number, number] }>>()
    cuts.forEach((cut) => {
      const list = bySegment.get(cut.segment) ?? []
      list.push({ t: cut.t, point: cut.point })
      bySegment.set(cut.segment, list)
    })
    let pieceIndex = 1
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index]
      const end = ring[(index + 1) % ring.length]
      const piece: [number, number][] = [start]
      for (const cut of (bySegment.get(index) ?? []).sort((a, b) => a.t - b.t)) {
        if (cut.t > 1e-7 && cut.t < 1 - 1e-7) piece.push(cut.point)
      }
      piece.push(end)
      addPiece(piece, road, nodes, segments, tolerance, pieceIndex)
      pieceIndex += 1
    }
    return
  }
  const bySegment = new Map<number, Array<{ t: number; point: [number, number] }>>()
  cuts.forEach((cut) => {
    const list = bySegment.get(cut.segment) ?? []
    list.push({ t: cut.t, point: cut.point })
    bySegment.set(cut.segment, list)
  })
  const pieces: [number, number][][] = []
  let current: [number, number][] = [road.points[0]]
  for (let index = 0; index < road.points.length - 1; index += 1) {
    const segmentCuts = (bySegment.get(index) ?? []).sort((a, b) => a.t - b.t)
    for (const cut of segmentCuts) {
      const point = cut.point
      if (!samePoint(current[current.length - 1], point, tolerance)) current.push(point)
      if (cut.t > 1e-7 && cut.t < 1 - 1e-7) {
        pieces.push(current)
        current = [point]
      } else if (cut.t >= 1 - 1e-7 && index < road.points.length - 2) {
        // A crossing can already be materialized as a shared source vertex
        // after a node drag. Split at that vertex as well, otherwise the
        // network would visually meet but keep one unsplittable bend segment.
        pieces.push(current)
        current = [point]
      }
    }
    const end = road.points[index + 1]
    if (!samePoint(current[current.length - 1], end, tolerance)) current.push(end)
  }
  if (current.length >= 2) pieces.push(current)
  pieces.forEach((piece, index) => addPiece(piece, road, nodes, segments, tolerance, index + 1))
}

/** Convert legacy polyline roads into a routable graph with explicit nodes and split crossings. */
export function buildRoadNetwork(roads: Road[], options: RoadNetworkBuildOptions = {}): RoadNetwork {
  const tolerance = Math.max(1e-6, options.snapTolerance ?? DEFAULT_SNAP_TOLERANCE)
  const splitIntersections = options.splitIntersections !== false
  const cuts = roads.map(() => [] as Array<{ segment: number; t: number; point: [number, number] }>)
  if (splitIntersections) {
    for (let firstRoad = 0; firstRoad < roads.length; firstRoad += 1) {
      const self = roads[firstRoad]
      for (let firstSegment = 0; firstSegment < self.points.length - 1; firstSegment += 1) {
        for (let secondSegment = firstSegment + 2; secondSegment < self.points.length - 1; secondSegment += 1) {
          const hit = intersection(self.points[firstSegment], self.points[firstSegment + 1], self.points[secondSegment], self.points[secondSegment + 1], tolerance)
          if (!hit) continue
          addUniqueCut(cuts[firstRoad], { segment: firstSegment, t: hit.t, point: hit.point }, tolerance)
          addUniqueCut(cuts[firstRoad], { segment: secondSegment, t: hit.u, point: hit.point }, tolerance)
        }
      }
      for (let secondRoad = firstRoad + 1; secondRoad < roads.length; secondRoad += 1) {
        const first = roads[firstRoad]
        const second = roads[secondRoad]
        for (let firstSegment = 0; firstSegment < first.points.length - 1; firstSegment += 1) {
          for (let secondSegment = 0; secondSegment < second.points.length - 1; secondSegment += 1) {
            const hit = intersection(first.points[firstSegment], first.points[firstSegment + 1], second.points[secondSegment], second.points[secondSegment + 1], tolerance)
            if (!hit) continue
            addUniqueCut(cuts[firstRoad], { segment: firstSegment, t: hit.t, point: hit.point }, tolerance)
            addUniqueCut(cuts[secondRoad], { segment: secondSegment, t: hit.u, point: hit.point }, tolerance)
          }
        }
      }
    }
  }
  const nodes: RoadNode[] = []
  const segments: RoadSegment[] = []
  roads.forEach((road, index) => splitRoad(road, cuts[index], nodes, segments, tolerance))
  const degree = new Map<string, number>()
  segments.forEach((segment) => {
    degree.set(segment.from, (degree.get(segment.from) ?? 0) + 1)
    degree.set(segment.to, (degree.get(segment.to) ?? 0) + 1)
  })
  nodes.forEach((node) => { node.kind = (degree.get(node.id) ?? 0) >= 3 ? 'junction' : 'waypoint' })
  // A crossing created by splitting two independent segments has degree four;
  // endpoint merging can temporarily leave it at degree two, so classify any
  // node shared by multiple source roads as a junction as well.
  const sourceRoadsByNode = new Map<string, Set<string>>()
  segments.forEach((segment) => {
    const sourceIds = segment.sourceIds ?? [segment.id]
    for (const nodeId of [segment.from, segment.to]) {
      const sources = sourceRoadsByNode.get(nodeId) ?? new Set<string>()
      sourceIds.forEach((sourceId) => sources.add(sourceId))
      sourceRoadsByNode.set(nodeId, sources)
    }
  })
  nodes.forEach((node) => {
    if ((sourceRoadsByNode.get(node.id)?.size ?? 0) >= 2) node.kind = 'junction'
    const sourceIds = [...(sourceRoadsByNode.get(node.id) ?? [])].sort()
    if (sourceIds.length) node.sourceIds = sourceIds
  })
  return { nodes, segments }
}

export function validateRoadNetwork(network: RoadNetwork): string[] {
  const errors: string[] = []
  const nodeKinds = new Set<RoadNodeKind>(['junction', 'entrance', 'poi-anchor', 'waypoint'])
  const roadClasses = new Set<RoadClass>(['main', 'secondary', 'walkway', 'service', 'cycleway'])
  const surfaces = new Set<RoadSurface>(['asphalt', 'concrete', 'paving', 'gravel'])
  const nodeIds = new Set<string>()
  network.nodes.forEach((node) => {
    if (!node.id.trim()) errors.push('道路节点缺少 id')
    if (nodeIds.has(node.id)) errors.push(`道路节点 id 重复：${node.id}`)
    nodeIds.add(node.id)
    if (!Number.isFinite(node.position[0]) || !Number.isFinite(node.position[1])) errors.push(`道路节点 ${node.id} 坐标无效`)
    if (!nodeKinds.has(node.kind)) errors.push(`道路节点 ${node.id} 类型无效`)
    if (node.sourceIds !== undefined && (!Array.isArray(node.sourceIds) || !node.sourceIds.every((id) => typeof id === 'string' && id.trim()))) errors.push(`道路节点 ${node.id} sourceIds 无效`)
  })
  const segmentIds = new Set<string>()
  network.segments.forEach((segment) => {
    if (!segment.id.trim()) errors.push('道路段缺少 id')
    if (segmentIds.has(segment.id)) errors.push(`道路段 id 重复：${segment.id}`)
    segmentIds.add(segment.id)
    if (!nodeIds.has(segment.from) || !nodeIds.has(segment.to)) errors.push(`道路段 ${segment.id} 引用了不存在的节点`)
    if (segment.from === segment.to) errors.push(`道路段 ${segment.id} 的起终点相同`)
    if (segment.centerline.length < 2) errors.push(`道路段 ${segment.id} 至少需要 2 个中心线点`)
    if (!Number.isFinite(segment.width) || segment.width <= 0) errors.push(`道路段 ${segment.id} 宽度无效`)
    segment.centerline.forEach((point, index) => {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) errors.push(`道路段 ${segment.id} 中心线 ${index + 1} 坐标无效`)
      if (index > 0 && point[0] === segment.centerline[index - 1][0] && point[1] === segment.centerline[index - 1][1]) errors.push(`道路段 ${segment.id} 存在零长度线段`)
    })
    if (!roadClasses.has(segment.class)) errors.push(`道路段 ${segment.id} class 无效`)
    if (!surfaces.has(segment.surface)) errors.push(`道路段 ${segment.id} surface 无效`)
    if (!segment.access || !(['pedestrian', 'bicycle', 'vehicle'] as const).every((key) => typeof segment.access[key] === 'boolean')) errors.push(`道路段 ${segment.id} access 无效`)
    if (segment.oneWay !== undefined && typeof segment.oneWay !== 'boolean') errors.push(`道路段 ${segment.id} oneWay 无效`)
    if (segment.speed !== undefined && (!Number.isFinite(segment.speed) || segment.speed <= 0)) errors.push(`道路段 ${segment.id} speed 无效`)
    if (segment.sourceIds !== undefined && (!Array.isArray(segment.sourceIds) || !segment.sourceIds.every((id) => typeof id === 'string' && id.trim()))) errors.push(`道路段 ${segment.id} sourceIds 无效`)
  })
  return [...new Set(errors)]
}

function roadBelongsToNode(road: Road, node: RoadNode): boolean {
  const sourceIds = new Set(road.sourceIds ?? [road.id])
  if (node.sourceIds?.some((sourceId) => sourceIds.has(sourceId))) return true
  return road.points.some((point) => samePoint(point, node.position, DEFAULT_SNAP_TOLERANCE))
}

/**
 * Move one generated topology node back into its editable source polylines.
 * Junctions that were created by crossing segments are materialized as a new
 * vertex in every touching source road, so subsequent edits remain connected.
 */
export function moveRoadNode(roads: Road[], network: RoadNetwork, nodeId: string, position: [number, number], tolerance = 1): boolean {
  const node = network.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return false
  let changed = false
  for (const road of roads) {
    if (!roadBelongsToNode(road, node)) continue
    let touched = false
    for (let index = 0; index < road.points.length; index += 1) {
      if (samePoint(road.points[index], node.position, tolerance)) {
        road.points[index] = [position[0], position[1]]
        touched = true
      }
    }
    if (!touched) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const hit = pointOnSegmentDistance(node.position, road.points[index], road.points[index + 1])
        if (hit.distance > tolerance || hit.t <= 1e-6 || hit.t >= 1 - 1e-6) continue
        road.points.splice(index + 1, 0, [position[0], position[1]])
        touched = true
        break
      }
    }
    changed = changed || touched
  }
  return changed
}

/** Delete an ordinary waypoint from its source polyline. Junction deletion is
 * intentionally blocked because removing it would recreate the crossing on
 * the next topology rebuild. */
export function removeRoadNode(roads: Road[], network: RoadNetwork, nodeId: string, tolerance = 1): boolean {
  const node = network.nodes.find((candidate) => candidate.id === nodeId)
  if (!node || node.kind === 'junction') return false
  let removed = false
  for (const road of roads) {
    if (!roadBelongsToNode(road, node) || road.points.length <= 2) continue
    const index = road.points.findIndex((point) => samePoint(point, node.position, tolerance))
    if (index < 0) continue
    const isClosed = road.points.length >= 4 && samePoint(road.points[0], road.points[road.points.length - 1], tolerance)
    if (isClosed && (index === 0 || index === road.points.length - 1)) continue
    // Interior vertices are the normal case. An ordinary terminal waypoint
    // may also be deleted when the source road still has two points left.
    road.points.splice(index, 1)
    removed = true
  }
  return removed
}

/** Move a node onto a nearby node so the next topology rebuild collapses them. */
export function mergeRoadNodes(roads: Road[], network: RoadNetwork, sourceNodeId: string, targetNodeId: string, tolerance = 1): boolean {
  if (sourceNodeId === targetNodeId) return false
  const source = network.nodes.find((node) => node.id === sourceNodeId)
  const target = network.nodes.find((node) => node.id === targetNodeId)
  if (!source || !target || distance(source.position, target.position) > tolerance) return false
  return moveRoadNode(roads, network, sourceNodeId, target.position, tolerance)
}
