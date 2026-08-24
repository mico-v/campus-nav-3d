import type { CampusData, Building, FieldArea, PoiMarker, Road, WaterBody, Zone } from '../data/campusData'
import { normalizeRoads } from '../data/roadNormalization'
import type { RoadNetwork, RoadSegment } from '../data/roadNetwork'

export type WorldPoint = [number, number]
export type AreaGeometry = Pick<Zone | WaterBody | FieldArea, 'center' | 'size' | 'footprint'>

/** Return the exact 2D footprint used by both the editor and the 3D renderer. */
export function areaPolygon(area: AreaGeometry): WorldPoint[] {
  if (area.footprint && area.footprint.length >= 3) return area.footprint
  const [x, z] = area.center
  const [width, depth] = area.size
  return [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ]
}

export function waterPolygon(water: Pick<WaterBody, 'center' | 'size' | 'footprint'>): WorldPoint[] {
  if (water.footprint && water.footprint.length >= 3) return water.footprint
  const points: WorldPoint[] = []
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2
    points.push([
      water.center[0] + (Math.cos(angle) * water.size[0]) / 2,
      water.center[1] + (Math.sin(angle) * water.size[1]) / 2,
    ])
  }
  return points
}

export function buildingPolygon(building: Pick<Building, 'position' | 'size' | 'footprint'>): WorldPoint[] {
  if (building.footprint && building.footprint.length >= 3) return building.footprint
  const [x, z] = building.position
  const [width, depth] = building.size
  return [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ]
}

export function pointInWorldPolygon(point: WorldPoint, polygon: WorldPoint[]): boolean {
  let inside = false
  const [px, pz] = point
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonExtent(points: WorldPoint[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

export function resolvedPoi(poi: PoiMarker, buildings: Pick<Building, 'id' | 'name' | 'position' | 'height' | 'color'>[]): PoiMarker {
  if (!poi.sourceBuildingId) return poi
  const building = buildings.find((candidate) => candidate.id === poi.sourceBuildingId)
  if (!building) return poi
  return {
    ...poi,
    name: building.name,
    color: poi.color ?? building.color,
    position: [building.position[0], building.height + 2, building.position[1]],
  }
}

export function resolvedPois(data: Pick<CampusData, 'buildings' | 'pois'>): PoiMarker[] {
  return data.pois.map((poi) => resolvedPoi(poi, data.buildings))
}


export type RoadDisplayKind = 'graph' | 'road' | 'canal'

export interface RoadDisplayOptions {
  showGraphRoads?: boolean
  showCanals?: boolean
  maxRoadWidth?: number
}

export interface DisplayRoad {
  id: string
  points: [number, number][]
  width: number
  color?: string
  surface?: 'asphalt' | 'concrete' | 'paving' | 'gravel'
  kind?: 'graph' | 'road' | 'canal'
  sourceIds?: string[]
  sidewalk?: boolean
  displayKind: RoadDisplayKind
}

export interface CampusBounds {
  center: [number, number]
  width: number
  depth: number
}

// Road width is authored data. Keep it intact by default; callers that need a
// presentation cap can still pass `maxRoadWidth` explicitly.
const DEFAULT_MAX_ROAD_WIDTH = Number.POSITIVE_INFINITY
const ROAD_KEY_PRECISION = 1
const DEFAULT_BOUNDS = { center: [0, 0] as [number, number], width: 1, depth: 1 }

export function classifyRoad(road: Pick<Road, 'id' | 'kind'>): RoadDisplayKind {
  if (road.kind) return road.kind
  const id = road.id.toLowerCase()
  if (id.includes('canal') || id.includes('waterway')) return 'canal'
  if (id.startsWith('graph-') || id.includes('graph-road')) return 'graph'
  return 'road'
}

function classifySegment(_segment: RoadSegment): RoadDisplayKind {
  return _segment.kind ?? 'road'
}

export function roadDisplayWidth(road: Pick<DisplayRoad, 'width' | 'displayKind'>): number {
  return Math.max(0.01, road.width)
}

function pointKey(point: [number, number]): string {
  return point.map((value) => value.toFixed(ROAD_KEY_PRECISION)).join(',')
}

function roadGeometryKey(points: [number, number][]): string {
  const forward = points.map(pointKey).join(';')
  const reverse = [...points].reverse().map(pointKey).join(';')
  return forward < reverse ? forward : reverse
}

export function getDisplayRoads(data: Pick<{ roads: Road[]; roadNetwork?: RoadNetwork }, 'roads' | 'roadNetwork'>, options: RoadDisplayOptions = {}): DisplayRoad[] {
  const maxRoadWidth = options.maxRoadWidth ?? DEFAULT_MAX_ROAD_WIDTH
  const seen = new Set<string>()
  const visible: DisplayRoad[] = []

  const sourceRoads: DisplayRoad[] = data.roadNetwork?.segments.map((segment) => ({
    id: segment.id,
    points: segment.centerline,
    width: segment.width,
    kind: segment.kind ?? 'road',
    color: segment.color,
    surface: segment.surface,
    sidewalk: segment.sidewalk,
    sourceIds: segment.sourceIds,
    displayKind: classifySegment(segment),
  })) ?? normalizeRoads(data.roads).map((road) => ({ ...road, surface: road.surface ?? 'concrete', displayKind: classifyRoad(road) }))

  for (const road of sourceRoads) {
    if (road.points.length < 2) continue
    const displayKind = road.displayKind
    if (displayKind === 'graph' && !options.showGraphRoads) continue
    if (displayKind === 'canal' && options.showCanals === false) continue
    const geometryKey = `${displayKind}:${roadGeometryKey(road.points)}`
    if (seen.has(geometryKey)) continue
    seen.add(geometryKey)
    const width = Math.max(Number.isFinite(road.width) ? road.width : 1, 0.01)
    visible.push({
      ...road,
      width: Math.min(width, maxRoadWidth),
      displayKind,
    })
  }

  return visible
}

function addPoint(xs: number[], zs: number[], point: [number, number]): void {
  if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
    xs.push(point[0]); zs.push(point[1])
  }
}

function addBuilding(xs: number[], zs: number[], building: Building): void {
  areaPolygon({ center: building.position, size: building.size, footprint: building.footprint }).forEach((point) => addPoint(xs, zs, point))
}

function addPoi(xs: number[], zs: number[], poi: PoiMarker, buildings: Building[]): void {
  const resolved = resolvedPoi(poi, buildings)
  addPoint(xs, zs, [resolved.position[0], resolved.position[2]])
}

/** Derive a framing extent from renderable geometry, never from stale metadata. */
export function deriveCampusBounds(data: CampusData, roadOptions: RoadDisplayOptions = {}): CampusBounds {
  const xs: number[] = []
  const zs: number[] = []
  data.buildings.forEach((building) => addBuilding(xs, zs, building))
  getDisplayRoads(data, roadOptions).forEach((road) => road.points.forEach((point) => addPoint(xs, zs, point)))
  data.zones.forEach((zone) => areaPolygon(zone).forEach((point) => addPoint(xs, zs, point)))
  data.waters.forEach((water) => waterPolygon(water).forEach((point) => addPoint(xs, zs, point)))
  data.fields.forEach((field) => areaPolygon(field).forEach((point) => addPoint(xs, zs, point)))
  data.trees.forEach((point) => addPoint(xs, zs, point))
  data.pois.forEach((poi) => addPoi(xs, zs, poi, data.buildings))
  if (xs.length === 0) return { ...DEFAULT_BOUNDS, center: [...DEFAULT_BOUNDS.center] as [number, number] }
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
  }
}

export function isTrackField(field: { id: string; name: string }): boolean {
  return /(^|[-_ ])(running|track|athletics?)($|[-_ ])/i.test(`${field.id} ${field.name}`)
}

export function zoneOpacity(zone: { id: string; category: string }): number {
  if (zone.id.toLowerCase().includes('boundary') || zone.category === 'landscape') return 0.08
  return 0.16
}

export interface PoiDisplayLevel {
  maxLabels: number
  markerScale: number
}

/** Keep overview markers legible without letting dozens of labels own the map. */
export function poiDisplayLevel(cameraDistance: number, campusSize: number): PoiDisplayLevel {
  const ratio = cameraDistance / Math.max(campusSize, 1)
  if (ratio > 0.9) return { maxLabels: 10, markerScale: 1.15 }
  if (ratio > 0.45) return { maxLabels: 18, markerScale: 1 }
  return { maxLabels: 32, markerScale: 0.9 }
}
