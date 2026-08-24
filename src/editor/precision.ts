import type { CampusData, Road } from '../data/campusData.ts'
import type { Point } from './geometry.ts'

export type EditorMode = 'select' | 'pan' | 'add-road' | 'reshape' | 'split-merge' | 'area'
export type SnapKind = 'vertex' | 'intersection' | 'anchor' | 'grid' | 'angle' | 'free'
export interface SnapCandidate { point: Point; kind: SnapKind; distance: number; roadIndex?: number; vertexIndex?: number }
export interface SnapOptions { gridSize: number; snapDistance: number; grid: boolean; angle: boolean; angleStep?: number }

export function snapToGrid(point: Point, spacing: number): Point {
  if (!Number.isFinite(spacing) || spacing <= 0) return [point[0], point[1]]
  return [Math.round(point[0] / spacing) * spacing, Math.round(point[1] / spacing) * spacing]
}

export function nearestNode(roads: Pick<Road, 'points'>[], target: Point, maxDistance = Infinity): SnapCandidate | null {
  let best: SnapCandidate | null = null
  roads.forEach((road, roadIndex) => road.points.forEach((point, vertexIndex) => {
    const distance = Math.hypot(point[0] - target[0], point[1] - target[1])
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { point: [point[0], point[1]], kind: 'vertex', distance, roadIndex, vertexIndex }
  }))
  return best
}

export function nearestSegment(roads: Pick<Road, 'points'>[], target: Point, maxDistance = Infinity): (SnapCandidate & { segmentIndex: number }) | null {
  let best: (SnapCandidate & { segmentIndex: number }) | null = null
  roads.forEach((road, roadIndex) => road.points.slice(0, -1).forEach((a, segmentIndex) => {
    const b = road.points[segmentIndex + 1]
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const lengthSquared = dx * dx + dz * dz
    const t = lengthSquared ? Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / lengthSquared)) : 0
    const point: Point = [a[0] + t * dx, a[1] + t * dz]
    const distance = Math.hypot(point[0] - target[0], point[1] - target[1])
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { point, kind: 'intersection', distance, roadIndex, segmentIndex }
  }))
  return best
}

export function snapPoint(point: Point, roads: Pick<Road, 'points'>[], anchors: Point[] = [], options: SnapOptions): SnapCandidate {
  const candidates: SnapCandidate[] = []
  const node = nearestNode(roads, point, options.snapDistance)
  if (node) candidates.push(node)
  const segment = nearestSegment(roads, point, options.snapDistance)
  if (segment) candidates.push(segment)
  anchors.forEach((anchor) => {
    const distance = Math.hypot(anchor[0] - point[0], anchor[1] - point[1])
    if (distance <= options.snapDistance) candidates.push({ point: [anchor[0], anchor[1]], kind: 'anchor', distance })
  })
  // Explicit precedence: vertex, intersection, anchor, then grid.
  const rank: Record<SnapKind, number> = { vertex: 0, intersection: 1, anchor: 2, grid: 3, angle: 4, free: 5 }
  candidates.sort((a, b) => rank[a.kind] - rank[b.kind] || a.distance - b.distance)
  if (candidates[0]) return candidates[0]
  if (options.grid) {
    const grid = snapToGrid(point, options.gridSize)
    return { point: grid, kind: 'grid', distance: Math.hypot(grid[0] - point[0], grid[1] - point[1]) }
  }
  return { point: [point[0], point[1]], kind: 'free', distance: 0 }
}

export function snapAngle(origin: Point, point: Point, step = 45): Point {
  const angle = Math.atan2(point[1] - origin[1], point[0] - origin[0])
  const radians = (Math.max(1, step) * Math.PI) / 180
  const snapped = Math.round(angle / radians) * radians
  const length = Math.hypot(point[0] - origin[0], point[1] - origin[1])
  return [origin[0] + Math.cos(snapped) * length, origin[1] + Math.sin(snapped) * length]
}

export function splitRoad(road: Road, segmentIndex: number, point: Point): Road[] {
  if (segmentIndex < 0 || segmentIndex >= road.points.length - 1) return [road]
  const split = [point, ...road.points.slice(segmentIndex + 1)]
  const firstId = `${road.id}-a`
  const secondId = `${road.id}-b`
  const inheritedSourceIds = [...new Set(road.sourceIds ?? [road.id])]
  const routingSourceIds = [...new Set([...(road.routing?.sourceIds ?? []), ...inheritedSourceIds])]
  const first: Road = { ...road, id: firstId, points: [...road.points.slice(0, segmentIndex + 1), point], sourceIds: [firstId], routing: { sourceIds: routingSourceIds } }
  const second: Road = { ...road, id: secondId, points: split, sourceIds: [secondId], routing: { sourceIds: routingSourceIds } }
  return [first, second]
}

function effectiveAccess(road: Road): { pedestrian: boolean; bicycle: boolean; vehicle: boolean } {
  return road.access ?? { pedestrian: true, bicycle: true, vehicle: false }
}

/**
 * Merge only roads that describe the same physical corridor. Attribute
 * conflicts are rejected instead of silently producing a road whose width,
 * access or direction changes in the middle.
 */
function compatibleRoadAttributes(a: Road, b: Road): boolean {
  const same = (left: unknown, right: unknown): boolean => left === right
  if (Math.abs(a.width - b.width) > 1e-6) return false
  if ((a.kind ?? 'road') !== (b.kind ?? 'road')) return false
  if (a.roadClass !== undefined && b.roadClass !== undefined && !same(a.roadClass, b.roadClass)) return false
  if ((a.surface ?? 'concrete') !== (b.surface ?? 'concrete')) return false
  const accessA = effectiveAccess(a), accessB = effectiveAccess(b)
  if (accessA.pedestrian !== accessB.pedestrian || accessA.bicycle !== accessB.bicycle || accessA.vehicle !== accessB.vehicle) return false
  if ((a.oneWay ?? false) !== (b.oneWay ?? false)) return false
  if (a.speed !== undefined && b.speed !== undefined && Math.abs(a.speed - b.speed) > 1e-6) return false
  if (a.sidewalk !== undefined && b.sidewalk !== undefined && a.sidewalk !== b.sidewalk) return false
  if (a.color !== undefined && b.color !== undefined && a.color.toLowerCase() !== b.color.toLowerCase()) return false
  return true
}

export function mergeRoads(a: Road, b: Road): Road | null {
  const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6
  if (!compatibleRoadAttributes(a, b)) return null
  const a0 = a.points[0], a1 = a.points[a.points.length - 1], b0 = b.points[0], b1 = b.points[b.points.length - 1]
  const sourceIds = [...new Set([...(a.sourceIds ?? [a.id]), ...(b.sourceIds ?? [b.id])])]
  const routingSourceIds = [...new Set([...(a.routing?.sourceIds ?? []), ...(b.routing?.sourceIds ?? []), ...sourceIds])]
  const metadata = {
    sourceIds: [...new Set([a.id, b.id, ...sourceIds])],
    routing: { sourceIds: routingSourceIds },
    ...(a.roadClass !== undefined || b.roadClass !== undefined ? { roadClass: a.roadClass ?? b.roadClass } : {}),
    ...(a.speed !== undefined || b.speed !== undefined ? { speed: a.speed ?? b.speed } : {}),
    ...(a.sidewalk !== undefined || b.sidewalk !== undefined ? { sidewalk: a.sidewalk ?? b.sidewalk } : {}),
    ...(a.color !== undefined || b.color !== undefined ? { color: a.color ?? b.color } : {}),
  }
  if (same(a1, b0)) return { ...a, points: [...a.points, ...b.points.slice(1)], ...metadata }
  if (same(a0, b1)) return { ...a, points: [...b.points, ...a.points.slice(1)], ...metadata }
  if (same(a0, b0)) return { ...a, points: [...a.points.slice().reverse(), ...b.points.slice(1)], ...metadata }
  if (same(a1, b1)) return { ...a, points: [...a.points, ...b.points.slice(0, -1).reverse()], ...metadata }
  return null
}

export function splitCanonicalRoad(data: CampusData, roadIndex: number, segmentIndex: number, point: Point): void {
  const road = data.roads[roadIndex]
  if (!road) return
  const parts = splitRoad(road, segmentIndex, point)
  if (parts.length === 2) data.roads.splice(roadIndex, 1, ...parts)
}

export function mergeCanonicalRoads(data: CampusData, firstIndex: number, secondIndex: number): boolean {
  const first = data.roads[firstIndex], second = data.roads[secondIndex]
  if (!first || !second) return false
  const merged = mergeRoads(first, second)
  if (!merged) return false
  const keep = Math.min(firstIndex, secondIndex)
  const remove = Math.max(firstIndex, secondIndex)
  data.roads.splice(remove, 1)
  data.roads.splice(keep, 1, merged)
  return true
}
