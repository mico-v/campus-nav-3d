import * as THREE from 'three'
import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LAYER, COLORS } from './theme'
import {
  classifyRoad,
  getDisplayRoads,
  isTrackField,
  pointInWorldPolygon,
  roadDisplayWidth,
  resolvedPois,
  waterPolygon,
  zoneOpacity,
  type RoadDisplayOptions,
} from './displayRules'
import { flatPolygon } from './geo'
import type { RoadSegment } from '../data/roadNetwork'
import { buildBuildingModel } from './buildingModel'

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

type Point2 = [number, number]

function cleanPolyline(points: Point2[]): Point2[] {
  return points.filter((point, index) => (
    Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && (index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1])
  ))
}

function offsetPolyline(points: Point2[], distance: number): Point2[] {
  const clean = cleanPolyline(points)
  if (clean.length < 2) return clean
  return clean.map((point, index) => {
    const previous = clean[Math.max(0, index - 1)]
    const next = clean[Math.min(clean.length - 1, index + 1)]
    const previousLength = Math.hypot(point[0] - previous[0], point[1] - previous[1]) || 1
    const nextLength = Math.hypot(next[0] - point[0], next[1] - point[1]) || 1
    const previousNormal: Point2 = [-(point[1] - previous[1]) / previousLength, (point[0] - previous[0]) / previousLength]
    const nextNormal: Point2 = [-(next[1] - point[1]) / nextLength, (next[0] - point[0]) / nextLength]
    const normal: Point2 = [previousNormal[0] + nextNormal[0], previousNormal[1] + nextNormal[1]]
    const normalLength = Math.hypot(normal[0], normal[1]) || 1
    normal[0] /= normalLength
    normal[1] /= normalLength
    const miterScale = Math.max(1, Math.min(2.4, 1 / Math.max(0.35, Math.abs(normal[0] * nextNormal[0] + normal[1] * nextNormal[1]))))
    return [point[0] + normal[0] * distance * miterScale, point[1] + normal[1] * distance * miterScale]
  })
}

function pointAtDistance(points: Point2[], distance: number): Point2 | null {
  let travelled = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    if (length <= 1e-9) continue
    if (travelled + length >= distance) {
      const ratio = Math.max(0, Math.min(1, (distance - travelled) / length))
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]
    }
    travelled += length
  }
  return null
}

function resamplePolyline(points: Point2[], spacing: number): Point2[] {
  const clean = cleanPolyline(points)
  if (clean.length < 2) return clean
  const total = clean.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - clean[index][0], point[1] - clean[index][1]), 0)
  const count = Math.max(1, Math.ceil(total / Math.max(0.5, spacing)))
  const result: Point2[] = []
  for (let index = 0; index <= count; index += 1) {
    const point = pointAtDistance(clean, (index / count) * total)
    if (point) result.push(point)
  }
  return cleanPolyline(result)
}

function buildDashedStrokeGeometries(points: Point2[], width: number, dashLength: number, gapLength: number): THREE.BufferGeometry[] {
  const clean = cleanPolyline(points)
  if (clean.length < 2) return []
  const total = clean.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - clean[index][0], point[1] - clean[index][1]), 0)
  const geometries: THREE.BufferGeometry[] = []
  for (let offset = dashLength / 2; offset < total; offset += dashLength + gapLength) {
    const start = pointAtDistance(clean, offset - dashLength / 2)
    const end = pointAtDistance(clean, Math.min(total, offset + dashLength / 2))
    if (start && end && Math.hypot(end[0] - start[0], end[1] - start[1]) > 0.1) {
      geometries.push(...buildRoadStrokeGeometries([start, end], width))
    }
  }
  return geometries
}

function closedPath(points: Point2[]): Point2[] {
  if (points.length < 3) return points
  return [...points, points[0]]
}

function markRole(object: THREE.Object3D, role: string): THREE.Object3D {
  object.userData = { ...object.userData, role }
  return object
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

function buildShoreRocks(points: Point2[]): THREE.Object3D | null {
  if (points.length < 3) return null
  const center = points.reduce<Point2>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  center[0] /= points.length
  center[1] /= points.length
  const transforms: Array<{ position: Point2; scale: [number, number, number]; rotation: number }> = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 2) continue
    const midpoint: Point2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    let normal: Point2 = [-dz / length, dx / length]
    if ((midpoint[0] - center[0]) * normal[0] + (midpoint[1] - center[1]) * normal[1] < 0) {
      normal = [-normal[0], -normal[1]]
    }
    const count = Math.max(1, Math.floor(length / 16))
    for (let step = 0; step < count; step += 1) {
      const ratio = (step + 0.5) / count
      const phase = index * 17 + step * 31
      const spread = ((phase % 7) - 3) * 0.38
      transforms.push({
        position: [
          start[0] + dx * ratio + normal[0] * (2.8 + spread),
          start[1] + dz * ratio + normal[1] * (2.8 + spread),
        ],
        scale: [0.8 + (phase % 5) * 0.16, 0.45 + (phase % 4) * 0.12, 0.65 + (phase % 6) * 0.12],
        rotation: phase * 0.47,
      })
    }
  }
  if (!transforms.length) return null
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#a7a68f', roughness: 1, metalness: 0 }),
    transforms.length,
  )
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  transforms.forEach((transform, index) => {
    position.set(transform.position[0], LAYER.waterShore + transform.scale[1] * 0.35, transform.position[1])
    quaternion.setFromEuler(new THREE.Euler(0, transform.rotation, 0))
    scale.set(...transform.scale)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return markRole(mesh, 'water-rocks')
}

function buildWaterRipples(points: Point2[]): THREE.Object3D | null {
  if (points.length < 3) return null
  const center = points.reduce<Point2>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  center[0] /= points.length
  center[1] /= points.length
  if (!pointInWorldPolygon(center, points)) return null
  const minX = Math.min(...points.map(([x]) => x))
  const maxX = Math.max(...points.map(([x]) => x))
  const minZ = Math.min(...points.map(([, z]) => z))
  const maxZ = Math.max(...points.map(([, z]) => z))
  const radius = Math.max(1.5, Math.min(maxX - minX, maxZ - minZ) * 0.055)
  const group = new THREE.Group()
  group.position.set(center[0], LAYER.water + 0.025, center[1])
  const material = new THREE.MeshBasicMaterial({ color: '#d9f3f5', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  for (let index = 0; index < 3; index += 1) {
    const inner = radius * (0.62 + index * 0.42)
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, inner + radius * 0.09, 48), material)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(index * radius * 0.35, index * 0.004, -index * radius * 0.22)
    group.add(ring)
  }
  return markRole(group, 'water-ripples')
}

interface BridgeStation {
  point: Point2
  y: number
  nx: number
  nz: number
}

function bridgeStations(points: Point2[], rise: number): BridgeStation[] {
  const clean = resamplePolyline(points, 5)
  if (clean.length < 2) return []
  const distances = [0]
  for (let index = 1; index < clean.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      clean[index][0] - clean[index - 1][0],
      clean[index][1] - clean[index - 1][1],
    ))
  }
  const total = distances[distances.length - 1] || 1
  return clean.map((point, index) => {
    const previous = clean[Math.max(0, index - 1)]
    const next = clean[Math.min(clean.length - 1, index + 1)]
    const dx = next[0] - previous[0]
    const dz = next[1] - previous[1]
    const length = Math.hypot(dx, dz) || 1
    const progress = distances[index] / total
    return {
      point,
      y: LAYER.bridgeDeck + Math.sin(Math.PI * progress) * rise,
      nx: -dz / length,
      nz: dx / length,
    }
  })
}

function bridgeSegmentGeometry(stations: BridgeStation[], offset: number, width: number): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = []
  for (let index = 0; index < stations.length - 1; index += 1) {
    const start = stations[index]
    const end = stations[index + 1]
    const startX = start.point[0] + start.nx * offset
    const startZ = start.point[1] + start.nz * offset
    const endX = end.point[0] + end.nx * offset
    const endZ = end.point[1] + end.nz * offset
    const dx = endX - startX
    const dz = endZ - startZ
    const planarLength = Math.hypot(dx, dz)
    if (planarLength < 1e-5) continue
    const dy = end.y - start.y
    const segmentLength = Math.hypot(planarLength, dy)
    const geometry = new THREE.BoxGeometry(width, 0.55, segmentLength + 0.28)
    geometry.rotateX(-Math.atan2(dy, planarLength))
    geometry.translate((startX + endX) / 2, (start.y + end.y) / 2 - 0.275, (startZ + endZ) / 2)
    geometries.push(geometry)
  }
  return geometries
}

function buildBridgeForRoad(points: Point2[], width: number, arched: boolean): THREE.Group | null {
  const clean = cleanPolyline(points)
  if (clean.length < 2) return null
  const totalLength = clean.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point[0] - clean[index][0], point[1] - clean[index][1])
  ), 0)
  const rise = arched ? Math.max(1.25, Math.min(4.6, totalLength * 0.04)) : 0.2
  const stations = bridgeStations(clean, rise)
  if (stations.length < 2) return null
  const group = new THREE.Group()
  const deckWidth = width + Math.max(2.4, Math.min(5.6, width * 0.52))
  const deckGeometries = bridgeSegmentGeometry(stations, 0, deckWidth)
  const deckGeometry = mergeRoadGeometry(deckGeometries)
  if (!deckGeometry) return null
  const deck = new THREE.Mesh(deckGeometry, new THREE.MeshStandardMaterial({ color: '#d8d0c2', roughness: 0.94, metalness: 0 }))
  deck.renderOrder = 36
  group.add(markRole(deck, 'bridge-deck'))

  const sideWidth = Math.max(1.1, Math.min(2.2, width * 0.12))
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: '#c9c2b5', roughness: 1, metalness: 0 })
  for (const side of [-1, 1]) {
    const sidewalkGeometry = mergeRoadGeometry(bridgeSegmentGeometry(
      stations,
      side * (width / 2 + sideWidth / 2 + 0.25),
      sideWidth,
    ))
    if (!sidewalkGeometry) continue
    const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial)
    sidewalk.position.y = 0.06
    group.add(markRole(sidewalk, 'bridge-sidewalk'))
  }

  const railMaterial = new THREE.MeshStandardMaterial({ color: '#9b5248', roughness: 0.68, metalness: 0.16 })
  const posts: Array<Point2> = []
  for (const side of [-1, 1]) {
    const railOffset = side * (width / 2 + sideWidth - 0.15)
    const railPoints = stations.map((station) => [
      station.point[0] + station.nx * railOffset,
      station.point[1] + station.nz * railOffset,
    ] as Point2)
    if (railPoints.length < 2) continue
    const curve = new THREE.CatmullRomCurve3(railPoints.map(([x, z], index) => (
      new THREE.Vector3(x, stations[index].y + 1.08, z)
    )))
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, railPoints.length * 4), 0.18, 5, false), railMaterial)
    group.add(markRole(rail, 'bridge-rail'))
    const postCount = Math.max(2, Math.floor(totalLength / 9) + 1)
    for (let index = 0; index < postCount; index += 1) {
      const station = stations[Math.round((index / Math.max(1, postCount - 1)) * (stations.length - 1))]
      posts.push([
        station.point[0] + station.nx * railOffset,
        station.point[1] + station.nz * railOffset,
      ])
    }
  }
  if (posts.length) {
    const postMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.18, 1.35, 6),
      railMaterial,
      posts.length,
    )
    const matrix = new THREE.Matrix4()
    posts.forEach(([x, z], index) => {
      let closest = stations[0]
      let distance = Number.POSITIVE_INFINITY
      stations.forEach((station) => {
        const nextDistance = Math.hypot(station.point[0] - x, station.point[1] - z)
        if (nextDistance < distance) {
          distance = nextDistance
          closest = station
        }
      })
      matrix.makeTranslation(x, closest.y + 0.68, z)
      postMesh.setMatrixAt(index, matrix)
    })
    postMesh.instanceMatrix.needsUpdate = true
    group.add(markRole(postMesh, 'bridge-post'))
  }

  const abutments: THREE.BufferGeometry[] = []
  for (const station of [stations[0], stations[stations.length - 1]]) {
    const next = station === stations[0] ? stations[1] : stations[stations.length - 2]
    const dx = next.point[0] - station.point[0]
    const dz = next.point[1] - station.point[1]
    const abutment = new THREE.BoxGeometry(deckWidth + 1.4, 1.05, 3)
    abutment.rotateY(Math.atan2(dx, dz))
    abutment.translate(station.point[0], station.y - 0.2, station.point[1])
    abutments.push(abutment)
  }
  const abutmentGeometry = mergeRoadGeometry(abutments)
  if (abutmentGeometry) {
    const abutment = new THREE.Mesh(abutmentGeometry, new THREE.MeshStandardMaterial({
      color: '#b9b2a5',
      roughness: 1,
      metalness: 0,
    }))
    group.add(markRole(abutment, 'bridge-abutment'))
  }
  return group
}

function buildWaterBridges(data: CampusData, polygon: Point2[]): THREE.Group[] {
  const bridges: THREE.Group[] = []
  for (const road of getDisplayRoads(data)) {
    if (road.displayKind === 'canal') continue
    const sampled = resamplePolyline(road.points, 4)
    const inside = sampled.map((point) => pointInWorldPolygon(point, polygon))
    let index = 0
    while (index < inside.length) {
      if (!inside[index]) {
        index += 1
        continue
      }
      const start = index
      while (index + 1 < inside.length && inside[index + 1]) index += 1
      const end = index
      const expanded = sampled.slice(Math.max(0, start - 5), Math.min(sampled.length, end + 6))
      if (expanded.length >= 2) {
        const bridge = buildBridgeForRoad(
          expanded,
          roadRenderWidth(road),
          road.surface === 'paving' || road.width <= 6,
        )
        if (bridge) {
          bridge.userData = { ...bridge.userData, role: 'bridge', id: road.id }
          bridges.push(bridge)
        }
      }
      index += 1
    }
  }
  return bridges
}

export function buildWaters(data: CampusData): THREE.Object3D[] {
  return data.waters.map((water) => {
    const polygon = waterPolygon(water)
    const group = new THREE.Group()
    group.userData = { role: 'water-body', id: water.id }
    if (polygon.length < 3) return group

    const bed = new THREE.Mesh(
      flatPolygon(polygon),
      new THREE.MeshStandardMaterial({ color: '#347f86', roughness: 0.92, metalness: 0 }),
    )
    bed.position.y = LAYER.waterBed
    group.add(markRole(bed, 'water-bed'))

    const bankWidth = Math.max(5, Math.min(10, Math.sqrt(polygon.length) * 0.75))
    const bankGeometry = mergeRoadGeometry(buildRoadStrokeGeometries(closedPath(polygon), bankWidth))
    if (bankGeometry) {
      const bank = new THREE.Mesh(
        bankGeometry,
        new THREE.MeshStandardMaterial({ color: '#c9c7ad', roughness: 1, metalness: 0 }),
      )
      bank.position.y = LAYER.waterBank
      bank.renderOrder = 20
      group.add(markRole(bank, 'water-bank'))
    }

    const surface = new THREE.Mesh(
      flatPolygon(polygon),
      new THREE.MeshPhysicalMaterial({
        color: water.color ?? '#5ca4b6',
        transparent: true,
        opacity: 0.78,
        roughness: 0.2,
        metalness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.18,
        side: THREE.DoubleSide,
      }),
    )
    surface.position.y = LAYER.water
    surface.renderOrder = 22
    group.add(markRole(surface, 'water-surface'))

    const shoreline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(polygon.map(([x, z]) => new THREE.Vector3(x, LAYER.waterShore, z))),
      new THREE.LineBasicMaterial({ color: '#e2eee6', transparent: true, opacity: 0.92 }),
    )
    shoreline.renderOrder = 24
    group.add(markRole(shoreline, 'water-shoreline'))

    const rocks = buildShoreRocks(polygon)
    if (rocks) group.add(rocks)
    const ripples = buildWaterRipples(polygon)
    if (ripples) group.add(ripples)
    buildWaterBridges(data, polygon).forEach((bridge) => group.add(bridge))
    return group
  })
}

function fieldMarkingLine(points: [number, number][], material: THREE.LineBasicMaterial, offset: [number, number] = [0, 0]): THREE.LineLoop {
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x - offset[0], 0.035, z - offset[1]))),
    material,
  )
}

export function buildFields(data: CampusData): THREE.Object3D[] {
  return data.fields.map((field) => {
    const group = new THREE.Group()
    const trackField = isTrackField(field)
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: field.color ?? (trackField ? '#c9784d' : '#6faa63'),
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const hasFootprint = field.footprint && field.footprint.length >= 3
    // Track outlines and inner pitches are separate authored field records.
    // Keep the track below other sports surfaces so the pitch reads as the
    // infield instead of z-fighting with a second full-size plane.
    const surfaceY = trackField ? LAYER.field : LAYER.fieldSurface

    if (hasFootprint) {
      const base = new THREE.Mesh(flatPolygon(field.footprint!), baseMaterial)
      base.position.set(0, surfaceY, 0)
      group.add(base)
    } else {
      const base = new THREE.Mesh(new THREE.PlaneGeometry(field.size[0], field.size[1]), baseMaterial)
      base.rotation.x = -Math.PI / 2
      base.position.y = surfaceY
      group.add(base)
    }

    const offset: [number, number] = hasFootprint ? [0, 0] : field.center
    if (hasFootprint) group.position.set(0, 0, 0)
    else group.position.set(field.center[0], 0, field.center[1])

    const points: [number, number][] = hasFootprint ? field.footprint! : [
      [field.center[0] - field.size[0] / 2, field.center[1] - field.size[1] / 2],
      [field.center[0] + field.size[0] / 2, field.center[1] - field.size[1] / 2],
      [field.center[0] + field.size[0] / 2, field.center[1] + field.size[1] / 2],
      [field.center[0] - field.size[0] / 2, field.center[1] + field.size[1] / 2],
    ]
    const markingMaterial = new THREE.LineBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.82 })
    const outline = fieldMarkingLine(points, markingMaterial, offset)
    outline.position.y = surfaceY
    group.add(outline)

    const lowerName = field.name.toLowerCase()
    if (!trackField && /soccer|pitch|football|basketball/.test(lowerName)) {
      const xs = points.map(([x]) => x - offset[0])
      const zs = points.map(([, z]) => z - offset[1])
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minZ = Math.min(...zs), maxZ = Math.max(...zs)
      const centerLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3((minX + maxX) / 2, surfaceY + 0.045, minZ),
          new THREE.Vector3((minX + maxX) / 2, surfaceY + 0.045, maxZ),
        ]),
        markingMaterial,
      )
      group.add(centerLine)
      const centerCircle = new THREE.Mesh(
        new THREE.RingGeometry(Math.min(maxX - minX, maxZ - minZ) * 0.085, Math.min(maxX - minX, maxZ - minZ) * 0.1, 32),
        new THREE.MeshBasicMaterial({ color: '#f8fafc', transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
      )
      centerCircle.rotation.x = -Math.PI / 2
      centerCircle.position.set((minX + maxX) / 2, surfaceY + 0.05, (minZ + maxZ) / 2)
      group.add(centerCircle)
    }
    return group
  })
}

export function buildTrees(data: CampusData): THREE.Object3D[] {
  if (!data.trees.length) return []
  const group = new THREE.Group()
  const trunkGeometry = new THREE.CylinderGeometry(0.75, 1.2, 6.2, 7)
  const crownGeometry = new THREE.IcosahedronGeometry(4.7, 1)
  const upperCrownGeometry = new THREE.IcosahedronGeometry(3.3, 1)
  const trunks = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 1 }), data.trees.length)
  const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({ color: '#5ba46b', roughness: 1 }), data.trees.length)
  const upperCrowns = new THREE.InstancedMesh(upperCrownGeometry, new THREE.MeshStandardMaterial({ color: '#74b97c', roughness: 1 }), data.trees.length)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  data.trees.forEach(([x, z], index) => {
    const variation = 0.82 + ((Math.abs(Math.round(x * 7 + z * 13)) % 9) / 20)
    position.set(x, 3, z)
    scale.set(variation, variation, variation)
    matrix.compose(position, quaternion, scale)
    trunks.setMatrixAt(index, matrix)
    position.set(x, 8.8 * variation, z)
    scale.set(variation * 1.05, variation * 0.92, variation * 1.05)
    matrix.compose(position, quaternion, scale)
    crowns.setMatrixAt(index, matrix)
    position.set(x, 12.2 * variation, z)
    scale.set(variation * 0.86, variation * 0.9, variation * 0.86)
    matrix.compose(position, quaternion, scale)
    upperCrowns.setMatrixAt(index, matrix)
  })
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  upperCrowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns, upperCrowns)
  return [group]
}

interface RoadGeometryBucket {
  sourceIndex: number
  id: string
  displayKind: 'graph' | 'road' | 'canal'
  casing: THREE.BufferGeometry[]
  surface: THREE.BufferGeometry[]
  sidewalk: THREE.BufferGeometry[]
  curb: THREE.BufferGeometry[]
  markings: THREE.BufferGeometry[]
  edgeLines: THREE.BufferGeometry[]
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
 * Match an SVG round-line stroke with simple, non-self-intersecting pieces.
 * A single outline polygon becomes unreliable at the tight turns present in
 * authored campus roads; segment quads plus round point joins preserve the
 * requested width at every bend and can still be merged into one draw call.
 */
export function buildRoadStrokeGeometries(points: [number, number][], width: number): THREE.BufferGeometry[] {
  const clean = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1])
  if (clean.length < 2) return []
  const halfWidth = Math.max(0.005, Math.abs(width) / 2)
  const geometries: THREE.BufferGeometry[] = []
  for (let index = 0; index < clean.length - 1; index += 1) {
    const start = clean[index]
    const end = clean[index + 1]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length <= 1e-9) continue
    const nx = -dz / length * halfWidth
    const nz = dx / length * halfWidth
    geometries.push(flatPolygon([
      [start[0] + nx, start[1] + nz],
      [end[0] + nx, end[1] + nz],
      [end[0] - nx, end[1] - nz],
      [start[0] - nx, start[1] - nz],
    ]))
  }
  clean.forEach(([x, z]) => {
    const join = new THREE.CircleGeometry(halfWidth, 16)
    join.rotateX(-Math.PI / 2)
    join.translate(x, 0, z)
    geometries.push(join)
  })
  return geometries
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
      curb: [],
      markings: [],
      edgeLines: [],
      surfaceColor: roadSurfaceColor(road),
      casingColor: isCanal ? '#b5d4e8' : COLORS.roadCasing,
      hasSidewalk: false,
    }
    const casingWidth = w + Math.max(1.8, w * 0.18)
    bucket.surface.push(...buildRoadStrokeGeometries(road.points, w))
    bucket.casing.push(...buildRoadStrokeGeometries(road.points, casingWidth))

    const sidewalk = road.sidewalk ?? (road.displayKind === 'road' && w >= 6)
    if (sidewalk && !isCanal) {
      const sidewalkWidth = Math.max(1.6, Math.min(4, w * 0.17))
      for (const side of [-1, 1]) {
        const sidewalkPoints = offsetPolyline(road.points, side * (w / 2 + sidewalkWidth / 2 + 0.35))
        bucket.sidewalk.push(...buildRoadStrokeGeometries(sidewalkPoints, sidewalkWidth))
      }
      bucket.hasSidewalk = true
    }

    if (!isCanal) {
      for (const side of [-1, 1]) {
        bucket.curb.push(...buildRoadStrokeGeometries(offsetPolyline(road.points, side * (w / 2 - 0.18)), 0.55))
        if (w >= 7) {
          bucket.edgeLines.push(...buildRoadStrokeGeometries(offsetPolyline(road.points, side * (w / 2 - 1.05)), 0.17))
        }
      }
      if (w >= 7) {
        bucket.markings.push(...buildDashedStrokeGeometries(road.points, 0.22, w >= 18 ? 8 : 5.5, w >= 18 ? 8 : 6.5))
      }
      if (w >= 26) {
        for (const side of [-1, 1]) {
          bucket.markings.push(...buildDashedStrokeGeometries(offsetPolyline(road.points, side * w * 0.24), 0.16, 5, 8))
        }
      }
    }
    buckets.set(key, bucket)
  }

  return [...buckets.values()].map((bucket) => {
    const group = new THREE.Group()
    const sidewalkGeometry = mergeRoadGeometry(bucket.sidewalk)
    if (sidewalkGeometry) {
      const sidewalk = new THREE.Mesh(sidewalkGeometry, new THREE.MeshStandardMaterial({
        color: '#d0cbc0', roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }))
      sidewalk.position.y = LAYER.roadSidewalk
      sidewalk.renderOrder = 30
      group.add(markRole(sidewalk, 'road-sidewalk'))
    }
    const casingGeometry = mergeRoadGeometry(bucket.casing)
    if (casingGeometry) {
      const casing = new THREE.Mesh(casingGeometry, new THREE.MeshStandardMaterial({
        color: bucket.casingColor, roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }))
      casing.position.y = LAYER.roadCasing
      casing.renderOrder = 31
      group.add(markRole(casing, 'road-shoulder'))
    }
    const surfaceGeometry = mergeRoadGeometry(bucket.surface)
    if (surfaceGeometry) {
      const surface = new THREE.Mesh(surfaceGeometry, new THREE.MeshStandardMaterial({
        color: bucket.surfaceColor, roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }))
      surface.position.y = LAYER.road
      surface.renderOrder = 32
      group.add(markRole(surface, 'road-surface'))
    }
    const curbGeometry = mergeRoadGeometry(bucket.curb)
    if (curbGeometry) {
      const curb = new THREE.Mesh(curbGeometry, new THREE.MeshStandardMaterial({
        color: '#e6e2d8', roughness: 0.92, metalness: 0,
      }))
      curb.position.y = LAYER.roadCurb
      curb.renderOrder = 33
      group.add(markRole(curb, 'road-curb'))
    }
    const edgeGeometry = mergeRoadGeometry(bucket.edgeLines)
    if (edgeGeometry) {
      const edges = new THREE.Mesh(edgeGeometry, new THREE.MeshBasicMaterial({
        color: '#f3f1e8', transparent: true, opacity: 0.72, depthWrite: false,
      }))
      edges.position.y = LAYER.roadMarking
      edges.renderOrder = 34
      group.add(markRole(edges, 'road-edge-line'))
    }
    const markingGeometry = mergeRoadGeometry(bucket.markings)
    if (markingGeometry) {
      const markings = new THREE.Mesh(markingGeometry, new THREE.MeshBasicMaterial({
        color: '#f8f6e8', transparent: true, opacity: 0.82, depthWrite: false,
      }))
      markings.position.y = LAYER.roadMarking
      markings.renderOrder = 35
      group.add(markRole(markings, 'road-markings'))
    }
    group.userData = { kind: 'road-structure', id: bucket.id, sourceIndex: bucket.sourceIndex, displayKind: bucket.displayKind, hasSidewalk: bucket.hasSidewalk }
    return group
  })
}

/** Fill graph intersections so separately authored road corridors read as one junction. */
export function buildRoadJunctions(data: CampusData): THREE.Object3D[] {
  if (!data.roadNetwork) return []
  const widthBySource = new Map<string, number>(data.roads.map((road) => [road.id, road.width]))
  const roadBySource = new Map<string, CampusData['roads'][number]>(data.roads.map((road) => [road.id, road]))
  const geometriesByColor = new Map<string, THREE.BufferGeometry[]>()
  data.roadNetwork.nodes.filter((node) => node.kind === 'junction').forEach((node) => {
    const connected = data.roadNetwork!.segments.filter((segment) => segment.from === node.id || segment.to === node.id)
    const footprint = junctionFootprint(node, connected.map((segment) => ({ ...segment, width: Math.max(segment.width, ...(segment.sourceIds ?? []).map((id) => widthBySource.get(id) ?? 0)) })))
    if (footprint.length < 3) return
    const sourceRoads = connected.flatMap((segment) => (
      (segment.sourceIds ?? []).map((id) => roadBySource.get(id)).filter((road) => road !== undefined)
    ))
    const vehicleRoad = sourceRoads.find((road) => road.width >= 7 && road.roadClass !== 'walkway')
    const template = vehicleRoad ?? sourceRoads[0]
    const color = template
      ? roadSurfaceColor({
          color: vehicleRoad ? template.color : undefined,
          surface: template.surface ?? (template.roadClass === 'walkway' ? 'paving' : 'concrete'),
          displayKind: classifyRoad(template),
        })
      : COLORS.road
    const geometries = geometriesByColor.get(color) ?? []
    geometries.push(flatPolygon(footprint))
    geometriesByColor.set(color, geometries)
  })
  return [...geometriesByColor.entries()].flatMap(([color, geometries]) => {
    const merged = mergeRoadGeometry(geometries)
    if (!merged) return []
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }))
    mesh.position.y = LAYER.road + 0.01
    mesh.renderOrder = 33
    mesh.userData = { role: 'road-junction' }
    return [mesh]
  })
}

export function buildBuilding(building: Building, selected: boolean): THREE.Group {
  return buildBuildingModel(building, selected)
}

export { buildingColor } from './buildingModel'

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
