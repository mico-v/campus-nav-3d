import * as THREE from 'three'
import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { LAYER, COLORS, BUILDING_COLOR } from './theme'
import { flatPolygon, extrudeFootprint, footprintShape, buildRoadOutline } from './geo'

export interface BuiltLabel {
  marker: PoiMarker
  element: HTMLDivElement
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
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.size[0], zone.size[1]),
      new THREE.MeshStandardMaterial({
        color: zone.color, transparent: true, opacity: 0.5,
        roughness: 1, metalness: 0, depthWrite: false,
      }),
    )
    tile.rotation.x = -Math.PI / 2
    tile.position.set(zone.center[0], LAYER.zone, zone.center[1])
    return tile
  })
}

export function buildWaters(data: CampusData): THREE.Object3D[] {
  return data.waters.map((water) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshStandardMaterial({ color: water.color ?? '#7cb5f0', transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0 }),
    )
    mesh.scale.set(water.size[0] / 2, water.size[1] / 2, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(water.center[0], LAYER.water, water.center[1])
    return mesh
  })
}

export function buildFields(data: CampusData): THREE.Object3D[] {
  return data.fields.map((field) => {
    const group = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(field.size[0], field.size[1]),
      new THREE.MeshStandardMaterial({ color: field.color ?? '#9fd9ad', roughness: 1 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = LAYER.field
    group.add(base)
    const track = new THREE.Mesh(
      new THREE.RingGeometry(field.size[0] / 2 + 2, field.size[0] / 2 + 6, 48),
      new THREE.MeshStandardMaterial({ color: '#e0a35f', roughness: 1 }),
    )
    track.scale.set(1, field.size[1] / field.size[0], 1)
    track.rotation.x = -Math.PI / 2
    track.position.y = LAYER.field + 0.005
    group.add(track)
    group.position.set(field.center[0], 0, field.center[1])
    return group
  })
}

export function buildTrees(data: CampusData): THREE.Object3D[] {
  return data.trees.map(([x, z]) => {
    const group = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 1 }),
    )
    trunk.position.y = 2.2
    group.add(trunk)
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 12, 12),
      new THREE.MeshStandardMaterial({ color: '#5fae72', roughness: 1 }),
    )
    crown.position.y = 5.4
    group.add(crown)
    group.position.set(x, 0, z)
    return group
  })
}

export function buildRoads(data: CampusData): THREE.Object3D[] {
  const objects: THREE.Object3D[] = []
  for (const road of data.roads) {
    if (road.points.length < 2) continue
    const outline = buildRoadOutline(road.points, road.width)
    const casingWidth = road.width + Math.max(1.6, road.width * 0.3)
    const casingOutline = buildRoadOutline(road.points, casingWidth)

    const casing = new THREE.Mesh(
      flatPolygon(casingOutline),
      new THREE.MeshStandardMaterial({ color: COLORS.roadCasing, roughness: 1, metalness: 0 }),
    )
    casing.position.y = LAYER.roadCasing
    objects.push(casing)

    const surface = new THREE.Mesh(
      flatPolygon(outline),
      new THREE.MeshStandardMaterial({ color: road.color ?? COLORS.road, roughness: 1, metalness: 0 }),
    )
    surface.position.y = LAYER.road
    objects.push(surface)
  }
  return objects
}

export function buildBuilding(building: Building, selected: boolean): THREE.Group {
  const group = new THREE.Group()
  const color = selected ? COLORS.selected : building.color ?? BUILDING_COLOR[building.category] ?? '#cbd5e1'
  const h = building.height

  if (building.footprint && building.footprint.length >= 3) {
    const body = new THREE.Mesh(
      extrudeFootprint(building.footprint, building.position, h),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
    )
    group.add(body)
    const roof = new THREE.Mesh(
      new THREE.ShapeGeometry(footprintShape(building.footprint, building.position)),
      new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
    )
    roof.rotation.x = -Math.PI / 2
    roof.position.y = h + 0.05
    group.add(roof)
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0], h, building.size[1]),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
    )
    body.position.y = h / 2
    group.add(body)
    if (h > 8) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(building.size[0] * 0.82, Math.max(1.2, h * 0.06), building.size[1] * 0.82),
        new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
      )
      roof.position.y = h + 0.4
      group.add(roof)
    }
  }
  group.position.set(building.position[0], 0, building.position[1])
  return group
}

export function resolvePois(data: CampusData): PoiMarker[] {
  const map = new Map(data.buildings.map((b) => [b.id, b]))
  return data.pois.map((poi) => {
    if (!poi.sourceBuildingId) return poi
    const b = map.get(poi.sourceBuildingId)
    if (!b) return poi
    return {
      ...poi,
      name: b.name,
      color: poi.color ?? b.color,
      position: [b.position[0], b.height + 2, b.position[1]] as [number, number, number],
    }
  })
}

export function buildPois(data: CampusData, labelLayer: HTMLDivElement): { objects: THREE.Object3D[]; labels: BuiltLabel[] } {
  const objects: THREE.Object3D[] = []
  const labels: BuiltLabel[] = []
  for (const poi of resolvePois(data)) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: poi.color ?? '#ffffff', emissiveIntensity: 0.4 }),
    )
    cap.position.set(...poi.position)
    objects.push(cap)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 7, 12),
      new THREE.MeshStandardMaterial({ color: poi.color ?? '#ffffff' }),
    )
    stem.position.set(poi.position[0], poi.position[1] - 3.2, poi.position[2])
    objects.push(stem)
    const element = document.createElement('div')
    element.className = `map-label ${poi.kind}`
    element.textContent = poi.name
    labelLayer.appendChild(element)
    labels.push({ marker: poi, element })
  }
  return { objects, labels }
}
