import * as THREE from 'three'
import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LAYER, COLORS, BUILDING_COLOR } from './theme'
import { classifyRoad, getDisplayRoads, isTrackField, roadDisplayWidth, resolvedPois, zoneOpacity, type RoadDisplayOptions } from './displayRules'
import { flatPolygon, extrudeFootprint, footprintShape, buildRoadCorridor } from './geo'
import type { RoadSegment } from '../data/roadNetwork'

export interface BuiltLabel {
  marker: PoiMarker
  element: HTMLDivElement
}

function roadRenderWidth(road: { width: number; displayKind: 'graph' | 'road' | 'canal' }): number {
  return roadDisplayWidth(road)
}

function roadSurfaceColor(road: { color?: string; surface?: 'asphalt' | 'concrete' | 'paving' | 'gravel'; displayKind: 'graph' | 'road' | 'canal' }): string {
  if (road.color) return road.color
  if (road.displayKind === 'canal') return '#76b7d5'
  if (road.surface === 'asphalt') return '#676d72'
  if (road.surface === 'paving') return '#aaa39b'
  if (road.surface === 'gravel') return '#a68f76'
  return COLORS.road
}

function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length <= 3) return sorted
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: [number, number][] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function junctionFootprint(node: { position: [number, number] }, segments: RoadSegment[]): [number, number][] {
  const candidates: [number, number][] = []
  for (const segment of segments) {
    const atStart = Math.hypot(segment.centerline[0][0] - node.position[0], segment.centerline[0][1] - node.position[1]) < 1e-4
    const endpoint = atStart ? segment.centerline[0] : segment.centerline[segment.centerline.length - 1]
    const next = atStart ? segment.centerline[1] : segment.centerline[segment.centerline.length - 2]
    const dx = next[0] - endpoint[0]
    const dz = next[1] - endpoint[1]
    const length = Math.hypot(dx, dz)
    if (!length) continue
    const nx = -dz / length * segment.width / 2
    const nz = dx / length * segment.width / 2
    candidates.push([node.position[0] + nx, node.position[1] + nz], [node.position[0] - nx, node.position[1] - nz])
  }
  return convexHull(candidates)
}

export function buildGround(bounds: { center: [number, number]; width: number; depth: number }): THREE.Mesh {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.width, bounds.depth),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(bounds.center[0], LAYER.ground, bounds.center[1])
  ground.receiveShadow = false
  return ground
}

export function buildZones(data: CampusData): THREE.Object3D[] {
  return data.zones.map((zone) => {
    const material = new THREE.MeshStandardMaterial({
      color: zone.color, transparent: true, opacity: zoneOpacity(zone),
      roughness: 1, metalness: 0, depthWrite: false,
    })
    if (zone.footprint && zone.footprint.length >= 3) {
      const mesh = new THREE.Mesh(flatPolygon(zone.footprint), material)
      mesh.position.set(0, LAYER.zone, 0)
      return mesh
    }
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(zone.size[0], zone.size[1]), material)
    tile.rotation.x = -Math.PI / 2
    tile.position.set(zone.center[0], LAYER.zone, zone.center[1])
    return tile
  })
}

export function buildWaters(data: CampusData): THREE.Object3D[] {
  return data.waters.map((water) => {
    const material = new THREE.MeshStandardMaterial({ color: water.color ?? '#7cb5f0', transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0 })
    if (water.footprint && water.footprint.length >= 3) {
      const mesh = new THREE.Mesh(flatPolygon(water.footprint), material)
      mesh.position.set(0, LAYER.water, 0)
      return mesh
    }
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), material)
    mesh.scale.set(water.size[0] / 2, water.size[1] / 2, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(water.center[0], LAYER.water, water.center[1])
    return mesh
  })
}

export function buildFields(data: CampusData): THREE.Object3D[] {
  return data.fields.map((field) => {
    const group = new THREE.Group()
    const baseMaterial = new THREE.MeshStandardMaterial({ color: field.color ?? '#9fd9ad', roughness: 1 })
    const hasFootprint = field.footprint && field.footprint.length >= 3

    if (hasFootprint) {
      const base = new THREE.Mesh(flatPolygon(field.footprint!), baseMaterial)
      base.position.set(0, LAYER.field, 0)
      group.add(base)
    } else {
      const base = new THREE.Mesh(new THREE.PlaneGeometry(field.size[0], field.size[1]), baseMaterial)
      base.rotation.x = -Math.PI / 2
      base.position.y = LAYER.field
      group.add(base)
    }

    if (isTrackField(field)) {
      const track = new THREE.Mesh(
        new THREE.RingGeometry(field.size[0] / 2 + 2, field.size[0] / 2 + 6, 48),
        new THREE.MeshStandardMaterial({ color: '#e0a35f', roughness: 1 }),
      )
      track.scale.set(1, field.size[1] / field.size[0], 1)
      track.rotation.x = -Math.PI / 2

      if (hasFootprint) {
        track.position.set(field.center[0], LAYER.field + 0.005, field.center[1])
        group.add(track)
      } else {
        track.position.y = LAYER.field + 0.005
        group.add(track)
      }
    }

    if (hasFootprint) group.position.set(0, 0, 0)
    else group.position.set(field.center[0], 0, field.center[1])
    return group
  })
}

export function buildTrees(data: CampusData): THREE.Object3D[] {
  if (!data.trees.length) return []
  const group = new THREE.Group()
  const trunkGeometry = new THREE.CylinderGeometry(0.6, 0.9, 4.5, 8)
  const crownGeometry = new THREE.SphereGeometry(2.6, 12, 12)
  const trunks = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 1 }), data.trees.length)
  const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({ color: '#5fae72', roughness: 1 }), data.trees.length)
  const matrix = new THREE.Matrix4()
  data.trees.forEach(([x, z], index) => {
    matrix.makeTranslation(x, 2.2, z)
    trunks.setMatrixAt(index, matrix)
    matrix.makeTranslation(x, 5.4, z)
    crowns.setMatrixAt(index, matrix)
  })
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns)
  return [group]
}

interface RoadGeometryBucket {
  sourceIndex: number
  id: string
  displayKind: 'graph' | 'road' | 'canal'
  casing: THREE.BufferGeometry[]
  surface: THREE.BufferGeometry[]
  sidewalk: THREE.BufferGeometry[]
  surfaceColor: string
  casingColor: string
  hasSidewalk: boolean
}

function mergeRoadGeometry(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geometries.length) return null
  const merged = mergeGeometries(geometries, false)
  geometries.forEach((geometry) => geometry.dispose())
  return merged
}

/**
 * Build one render group per authored road rather than one group per generated
 * topology segment. The topology remains the source for geometry, but merging
 * compatible corridor meshes cuts the default campus from hundreds of road
 * draw calls to a small, stable number while retaining per-road hit testing.
 */
export function buildRoads(data: CampusData, options: RoadDisplayOptions = {}): THREE.Group[] {
  const buckets = new Map<string, RoadGeometryBucket>()
  for (const road of getDisplayRoads(data, options)) {
    const sourceIndex = data.roads.findIndex((candidate) => road.sourceIds?.includes(candidate.id) || candidate.id === road.id)
    const id = sourceIndex >= 0 ? data.roads[sourceIndex].id : road.id
    const key = `${sourceIndex}:${road.displayKind}:${roadSurfaceColor(road)}`
    const isCanal = classifyRoad(road) === 'canal'
    const w = roadRenderWidth(road)
    const bucket = buckets.get(key) ?? {
      sourceIndex,
      id,
      displayKind: road.displayKind,
      casing: [],
      surface: [],
      sidewalk: [],
      surfaceColor: roadSurfaceColor(road),
      casingColor: isCanal ? '#b5d4e8' : COLORS.roadCasing,
      hasSidewalk: false,
    }
    const outline = buildRoadCorridor(road.points, w, { join: 'miter', cap: 'round', miterLimit: 3 })
    const casingWidth = w + Math.max(1.2, w * 0.2)
    const casingOutline = buildRoadCorridor(road.points, casingWidth, { join: 'bevel', cap: 'round' })
    if (outline.length >= 3) bucket.surface.push(flatPolygon(outline))
    if (casingOutline.length >= 3) bucket.casing.push(flatPolygon(casingOutline))

    const sidewalk = road.sidewalk ?? (road.displayKind === 'road' && w >= 10)
    if (sidewalk) {
      const sidewalkWidth = Math.max(1.4, Math.min(3.5, w * 0.16))
      const sidewalkOutline = buildRoadCorridor(road.points, w + sidewalkWidth * 2, { join: 'bevel', cap: 'round' })
      if (sidewalkOutline.length >= 3) bucket.sidewalk.push(flatPolygon(sidewalkOutline))
      bucket.hasSidewalk = true
    }
    buckets.set(key, bucket)
  }

  return [...buckets.values()].map((bucket) => {
    const group = new THREE.Group()
    const casingGeometry = mergeRoadGeometry(bucket.casing)
    if (casingGeometry) {
      const casing = new THREE.Mesh(casingGeometry, new THREE.MeshStandardMaterial({ color: bucket.casingColor, roughness: 1, metalness: 0 }))
      casing.position.y = LAYER.roadCasing
      group.add(casing)
    }
    const surfaceGeometry = mergeRoadGeometry(bucket.surface)
    if (surfaceGeometry) {
      const surface = new THREE.Mesh(surfaceGeometry, new THREE.MeshStandardMaterial({ color: bucket.surfaceColor, roughness: 1, metalness: 0 }))
      surface.position.y = LAYER.road
      group.add(surface)
    }
    const sidewalkGeometry = mergeRoadGeometry(bucket.sidewalk)
    if (sidewalkGeometry) {
      const sidewalk = new THREE.Mesh(sidewalkGeometry, new THREE.MeshStandardMaterial({ color: '#c7c1b7', roughness: 1, metalness: 0 }))
      sidewalk.position.y = LAYER.roadCasing - 0.005
      group.add(sidewalk)
    }
    group.userData = { kind: 'road-structure', id: bucket.id, sourceIndex: bucket.sourceIndex, displayKind: bucket.displayKind, hasSidewalk: bucket.hasSidewalk }
    return group
  })
}

/** Fill graph intersections so separately authored road corridors read as one junction. */
export function buildRoadJunctions(data: CampusData): THREE.Object3D[] {
  if (!data.roadNetwork) return []
  const widthBySource = new Map<string, number>(data.roads.map((road) => [road.id, road.width]))
  const geometries: THREE.BufferGeometry[] = []
  data.roadNetwork.nodes.filter((node) => node.kind === 'junction').forEach((node) => {
    const connected = data.roadNetwork!.segments.filter((segment) => segment.from === node.id || segment.to === node.id)
    const footprint = junctionFootprint(node, connected.map((segment) => ({ ...segment, width: Math.max(segment.width, ...(segment.sourceIds ?? []).map((id) => widthBySource.get(id) ?? 0)) })))
    if (footprint.length >= 3) geometries.push(flatPolygon(footprint))
  })
  const merged = mergeRoadGeometry(geometries)
  if (!merged) return []
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 1, metalness: 0 }))
  mesh.position.y = LAYER.road
  return [mesh]
}

export function buildingColor(building: Pick<Building, 'category' | 'color'>, selected = false): string {
  return selected ? COLORS.selected : building.color ?? BUILDING_COLOR[building.category] ?? '#cbd5e1'
}

function addBuildingOutline(group: THREE.Group, body: THREE.Mesh, selected: boolean): void {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry, 18),
    new THREE.LineBasicMaterial({
      color: selected ? COLORS.selectedEdge : COLORS.buildingEdge,
      transparent: true,
      opacity: selected ? 1 : 0.72,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  outline.position.copy(body.position)
  outline.rotation.copy(body.rotation)
  outline.scale.copy(body.scale)
  // Render the edge slightly in front of the body surface. Keeping depth testing
  // enabled prevents hidden rear edges from showing through the building.
  outline.renderOrder = 2
  group.add(outline)
}

export function buildBuilding(building: Building, selected: boolean): THREE.Group {
  const group = new THREE.Group()
  const color = buildingColor(building, selected)
  const h = Math.max(1, building.height)

  if (building.footprint && building.footprint.length >= 3) {
    const body = new THREE.Mesh(
      extrudeFootprint(building.footprint, building.position, h),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.85, metalness: 0,
        emissive: selected ? COLORS.selected : '#000000',
        emissiveIntensity: selected ? 0.18 : 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    )
    body.userData = { role: 'building-body' }
    group.add(body)
    addBuildingOutline(group, body, selected)
    const roof = new THREE.Mesh(
      new THREE.ShapeGeometry(footprintShape(building.footprint, building.position)),
      new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
    )
    roof.userData = { role: 'building-roof' }
    roof.rotation.x = -Math.PI / 2
    roof.position.y = h + 0.05
    group.add(roof)
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0], h, building.size[1]),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.85, metalness: 0,
        emissive: selected ? COLORS.selected : '#000000',
        emissiveIntensity: selected ? 0.18 : 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    )
    body.userData = { role: 'building-body' }
    body.position.y = h / 2
    group.add(body)
    addBuildingOutline(group, body, selected)
    if (h > 8) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(building.size[0] * 0.82, Math.max(1.2, h * 0.06), building.size[1] * 0.82),
        new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
      )
      roof.userData = { role: 'building-roof' }
      roof.position.y = h + 0.4
      group.add(roof)
    }
  }
  group.position.set(building.position[0], LAYER.building, building.position[1])
  return group
}

export function resolvePois(data: CampusData): PoiMarker[] {
  return resolvedPois(data)
}

export function buildPois(data: CampusData, labelLayer: HTMLDivElement): { objects: THREE.Object3D[]; labels: BuiltLabel[] } {
  const objects: THREE.Object3D[] = []
  const labels: BuiltLabel[] = []
  for (const poi of resolvePois(data)) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: poi.color ?? '#ffffff', emissiveIntensity: 0.4 }),
    )
    cap.userData = { kind: 'poi', id: poi.id, poi }
    cap.position.set(...poi.position)
    objects.push(cap)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 7, 12),
      new THREE.MeshStandardMaterial({ color: poi.color ?? '#ffffff' }),
    )
    stem.position.set(poi.position[0], poi.position[1] - 3.2, poi.position[2])
    stem.userData = { kind: 'poi', id: poi.id, poi }
    objects.push(stem)
    const element = document.createElement('div')
    element.className = `map-label ${poi.kind}`
    element.textContent = poi.name
    labelLayer.appendChild(element)
    labels.push({ marker: poi, element })
  }
  return { objects, labels }
}
