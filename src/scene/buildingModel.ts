import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building } from '../data/campusData'
import { extrudeFootprint, footprintShape, type Vec2 } from './geo'
import { BUILDING_COLOR, COLORS, LAYER } from './theme'

const WINDOW_COLOR = '#496478'
const TRIM_COLOR = '#f1eee6'
const ROOF_UNIT_COLOR = '#7d8990'
const GABLE_ROOF_COLOR = '#b9776f'
const SHADOW_COLOR = '#263642'

interface BoxPart {
  width: number
  height: number
  depth: number
  x: number
  y: number
  z: number
  rotationY?: number
}

function footprintPoints(building: Building): Vec2[] {
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

function footprintBounds(points: Vec2[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

function edgeRotation(dx: number, dz: number): number {
  return -Math.atan2(dz, dx)
}

function outwardNormal(start: Vec2, end: Vec2, center: Vec2): Vec2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.hypot(dx, dz) || 1
  let normal: Vec2 = [-dz / length, dx / length]
  const midpoint: Vec2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
  if ((midpoint[0] - center[0]) * normal[0] + (midpoint[1] - center[1]) * normal[1] < 0) {
    normal = [-normal[0], -normal[1]]
  }
  return normal
}

function mergeBoxes(parts: BoxPart[], material: THREE.Material, role: string): THREE.Mesh | null {
  if (!parts.length) return null
  const geometries = parts.map((part) => {
    const geometry = new THREE.BoxGeometry(part.width, part.height, part.depth)
    if (part.rotationY) geometry.rotateY(part.rotationY)
    geometry.translate(part.x, part.y, part.z)
    return geometry
  })
  const merged = mergeGeometries(geometries, false)
  geometries.forEach((geometry) => geometry.dispose())
  if (!merged) return null
  const mesh = new THREE.Mesh(merged, material)
  mesh.userData = { role }
  return mesh
}

function addOutline(group: THREE.Group, body: THREE.Mesh, selected: boolean): void {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry, 22),
    new THREE.LineBasicMaterial({
      color: selected ? COLORS.selectedEdge : COLORS.buildingEdge,
      transparent: true,
      opacity: selected ? 1 : 0.62,
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
  outline.renderOrder = 2
  group.add(outline)
}

function addGroundShadow(group: THREE.Group, points: Vec2[], center: Vec2): void {
  const shadow = new THREE.Mesh(
    new THREE.ShapeGeometry(footprintShape(points, center)),
    new THREE.MeshBasicMaterial({
      color: SHADOW_COLOR,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(1.8, 0.015, 2.4)
  shadow.scale.set(1.025, 1.025, 1)
  shadow.renderOrder = 1
  group.add(shadow)
}

function addFacadeDetail(group: THREE.Group, building: Building, height: number, selected: boolean): void {
  if (building.category === 'gate' || building.category === 'landscape') return
  const points = footprintPoints(building)
  const center = building.position
  const floorHeight = building.category === 'dorm' ? 4.8 : 5.2
  const floorCount = Math.max(1, Math.min(8, Math.floor((height - 2.2) / floorHeight)))
  const windows: BoxPart[] = []
  const trims: BoxPart[] = []

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const start = points[pointIndex]
    const end = points[(pointIndex + 1) % points.length]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 6) continue
    const rotationY = edgeRotation(dx, dz)
    const normal = outwardNormal(start, end, center)
    const centerX = (start[0] + end[0]) / 2 - center[0]
    const centerZ = (start[1] + end[1]) / 2 - center[1]

    for (let floor = 0; floor < floorCount; floor += 1) {
      const y = 3.2 + floor * floorHeight
      if (y + 1 > height - 1) break
      trims.push({
        width: Math.max(2, length - 0.8),
        height: 0.32,
        depth: 0.22,
        x: centerX + normal[0] * 0.13,
        y: Math.min(height - 0.7, y + 1.9),
        z: centerZ + normal[1] * 0.13,
        rotationY,
      })

      const divisions = Math.max(1, Math.floor((length - 4) / 11))
      const sectionLength = length / divisions
      const windowWidth = Math.max(2.4, sectionLength * 0.54)
      for (let section = 0; section < divisions; section += 1) {
        const along = sectionLength * (section + 0.5) - length / 2
        const x = centerX + (dx / length) * along + normal[0] * 0.2
        const z = centerZ + (dz / length) * along + normal[1] * 0.2
        windows.push({
          width: windowWidth,
          height: building.category === 'dorm' ? 1.55 : 1.9,
          depth: 0.18,
          x,
          y,
          z,
          rotationY,
        })
      }
    }
  }

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR,
    roughness: 0.28,
    metalness: 0.08,
    emissive: selected ? COLORS.selected : '#000000',
    emissiveIntensity: selected ? 0.08 : 0,
  })
  const windowMesh = mergeBoxes(windows, windowMaterial, 'building-window')
  if (windowMesh) group.add(windowMesh)

  const trimMaterial = new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.72 })
  const trimMesh = mergeBoxes(trims, trimMaterial, 'building-trim')
  if (trimMesh) group.add(trimMesh)
}

function addEntrance(group: THREE.Group, building: Building, height: number): void {
  if (building.category === 'gate' || building.category === 'landscape') return
  const points = footprintPoints(building)
  let entranceEdge: { start: Vec2; end: Vec2; length: number; midpointZ: number } | null = null
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    const midpointZ = (start[1] + end[1]) / 2
    if (length >= 8 && (!entranceEdge || midpointZ > entranceEdge.midpointZ)) {
      entranceEdge = { start, end, length, midpointZ }
    }
  }
  if (!entranceEdge) return

  const { start, end, length } = entranceEdge
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const rotationY = edgeRotation(dx, dz)
  const normal = outwardNormal(start, end, building.position)
  const centerX = (start[0] + end[0]) / 2 - building.position[0]
  const centerZ = (start[1] + end[1]) / 2 - building.position[1]
  const entranceWidth = Math.min(11, Math.max(5, length * 0.28))
  const glass = mergeBoxes([{
    width: entranceWidth,
    height: Math.min(3.8, height * 0.36),
    depth: 0.24,
    x: centerX + normal[0] * 0.2,
    y: Math.min(3, height * 0.3),
    z: centerZ + normal[1] * 0.2,
    rotationY,
  }], new THREE.MeshStandardMaterial({
    color: '#35586d',
    roughness: 0.22,
    metalness: 0.12,
  }), 'building-entrance')
  if (glass) group.add(glass)

  const canopy = mergeBoxes([{
    width: entranceWidth + 4,
    height: 0.38,
    depth: 4.2,
    x: centerX + normal[0] * 2.2,
    y: Math.min(4.4, height * 0.48),
    z: centerZ + normal[1] * 2.2,
    rotationY,
  }], new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.65 }), 'building-canopy')
  if (canopy) group.add(canopy)
}

function gableRoofGeometry(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const vertices = new Float32Array([
    -halfWidth, 0, -halfDepth,
    halfWidth, 0, -halfDepth,
    halfWidth, 0, halfDepth,
    -halfWidth, 0, halfDepth,
    -halfWidth, rise, 0,
    halfWidth, rise, 0,
  ])
  const indices = [
    0, 1, 5, 0, 5, 4,
    3, 4, 5, 3, 5, 2,
    0, 4, 3,
    1, 2, 5,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addRoof(group: THREE.Group, building: Building, height: number, selected: boolean): void {
  const points = footprintPoints(building)
  const bounds = footprintBounds(points)
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const centerX = (bounds.minX + bounds.maxX) / 2 - building.position[0]
  const centerZ = (bounds.minZ + bounds.maxZ) / 2 - building.position[1]
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: selected ? COLORS.roofSelected : COLORS.roof,
    roughness: 0.82,
  })

  if (building.category === 'dorm' || building.category === 'canteen') {
    const longX = width >= depth
    const roofWidth = (longX ? width : depth) + 2.4
    const roofDepth = (longX ? depth : width) + 2.4
    const roof = new THREE.Mesh(
      gableRoofGeometry(roofWidth, roofDepth, Math.min(7.5, Math.max(2.8, Math.min(roofWidth, roofDepth) * 0.17))),
      new THREE.MeshStandardMaterial({
        color: selected ? COLORS.roofSelected : GABLE_ROOF_COLOR,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    )
    roof.rotation.y = longX ? 0 : Math.PI / 2
    roof.position.set(centerX, height + 0.08, centerZ)
    roof.userData = { role: 'building-roof' }
    group.add(roof)
    return
  }

  const roof = new THREE.Mesh(
    new THREE.ShapeGeometry(footprintShape(points, building.position)),
    roofMaterial,
  )
  roof.rotation.x = -Math.PI / 2
  roof.position.y = height + 0.06
  roof.userData = { role: 'building-roof' }
  group.add(roof)

  const parapet: BoxPart[] = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 2) continue
    parapet.push({
      width: length + 0.35,
      height: 1,
      depth: 0.5,
      x: (start[0] + end[0]) / 2 - building.position[0],
      y: height + 0.5,
      z: (start[1] + end[1]) / 2 - building.position[1],
      rotationY: edgeRotation(dx, dz),
    })
  }
  const parapetMesh = mergeBoxes(parapet, roofMaterial, 'building-roof')
  if (parapetMesh) group.add(parapetMesh)

  if (width < 14 || depth < 14) return
  const unitMaterial = new THREE.MeshStandardMaterial({ color: ROOF_UNIT_COLOR, roughness: 0.9 })
  const unitCount = width * depth > 12000 ? 3 : width * depth > 4200 ? 2 : 1
  const units: BoxPart[] = []
  const columns = unitCount + 1
  for (let index = 0; index < unitCount; index += 1) {
    const ratio = (index + 1) / columns
    units.push({
      width: Math.min(10, width * 0.12),
      height: 1.8,
      depth: Math.min(8, depth * 0.11),
      x: centerX - width * 0.24 + width * 0.48 * ratio,
      y: height + 1.4,
      z: centerZ + (index % 2 === 0 ? -1 : 1) * depth * 0.14,
    })
  }
  const unitMesh = mergeBoxes(units, unitMaterial, 'building-roof-unit')
  if (unitMesh) group.add(unitMesh)

  if (building.category === 'library') {
    const lanternWidth = Math.min(42, width * 0.28)
    const lanternDepth = Math.min(34, depth * 0.24)
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(lanternWidth, 5.2, lanternDepth),
      new THREE.MeshStandardMaterial({
        color: selected ? '#f7a7b2' : '#8eb6c9',
        roughness: 0.18,
        metalness: 0.05,
        transparent: true,
        opacity: 0.84,
      }),
    )
    glass.position.set(centerX, height + 2.6, centerZ)
    glass.userData = { role: 'building-detail' }
    group.add(glass)
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(lanternWidth + 2.4, 0.45, lanternDepth + 2.4),
      roofMaterial,
    )
    frame.position.set(centerX, height + 5.2, centerZ)
    frame.userData = { role: 'building-roof' }
    group.add(frame)
  }
}

function addPavilionRoof(group: THREE.Group, building: Building, height: number, selected: boolean): void {
  const width = Math.max(18, building.size[0])
  const depth = Math.max(14, building.size[1])
  const radius = Math.min(width, depth) * 0.62
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: selected ? COLORS.roofSelected : '#9b5e52',
    roughness: 0.9,
    side: THREE.DoubleSide,
  })
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, radius, 3.4, 4), roofMaterial)
  lower.rotation.y = Math.PI / 4
  lower.position.y = height + 1.7
  lower.userData = { role: 'building-roof' }
  group.add(lower)
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.35, radius * 0.58, 2.4, 4), roofMaterial)
  upper.rotation.y = Math.PI / 4
  upper.position.y = height + 4.6
  upper.userData = { role: 'building-roof' }
  group.add(upper)
}

function buildGate(group: THREE.Group, building: Building, selected: boolean): void {
  const width = building.size[0]
  const depth = building.size[1]
  const height = Math.max(6.5, building.height)
  const material = new THREE.MeshStandardMaterial({
    color: buildingColor(building, selected),
    roughness: 0.8,
    emissive: selected ? COLORS.selected : '#000000',
    emissiveIntensity: selected ? 0.16 : 0,
  })
  const pillarWidth = Math.max(2.2, width * 0.17)
  const parts: BoxPart[] = [
    { width: pillarWidth, height, depth: Math.max(2.6, depth * 0.58), x: -width * 0.34, y: height / 2, z: 0 },
    { width: pillarWidth, height, depth: Math.max(2.6, depth * 0.58), x: width * 0.34, y: height / 2, z: 0 },
    { width: width * 0.78, height: 1.5, depth: 2.1, x: 0, y: height - 1.2, z: 0 },
  ]
  const body = mergeBoxes(parts, material, 'building-body')
  if (!body) return
  group.add(body)
  addOutline(group, body, selected)

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.34, 1.5, 2.4),
    new THREE.MeshStandardMaterial({ color: '#7d2c31', roughness: 0.7 }),
  )
  sign.position.set(0, height - 2.5, 0)
  sign.userData = { role: 'building-detail' }
  group.add(sign)
}

function buildPavilion(group: THREE.Group, building: Building, height: number, selected: boolean): void {
  const footprintWidth = Math.max(18, building.size[0])
  const footprintDepth = Math.max(14, building.size[1])
  const terraceRadius = Math.min(footprintWidth, footprintDepth) * 0.52
  const terraceHeight = 1.25
  const terraceMaterial = new THREE.MeshStandardMaterial({
    color: '#d4cdbc',
    roughness: 0.96,
  })
  const terrace = new THREE.Mesh(
    new THREE.CylinderGeometry(terraceRadius * 0.92, terraceRadius, terraceHeight, 12),
    terraceMaterial,
  )
  terrace.position.y = terraceHeight / 2
  terrace.userData = { role: 'landscape-terrace' }
  group.add(terrace)

  const step = new THREE.Mesh(
    new THREE.CylinderGeometry(terraceRadius * 0.82, terraceRadius * 0.94, 0.38, 12),
    new THREE.MeshStandardMaterial({ color: '#c5bdac', roughness: 1 }),
  )
  step.position.y = terraceHeight + 0.19
  step.userData = { role: 'landscape-step' }
  group.add(step)

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: selected ? COLORS.selected : '#b66f5d',
    roughness: 0.82,
    emissive: selected ? COLORS.selected : '#000000',
    emissiveIntensity: selected ? 0.16 : 0,
  })
  const floorHeight = 0.55
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(terraceRadius * 0.76, terraceRadius * 0.8, floorHeight, 12),
    new THREE.MeshStandardMaterial({ color: '#9d8972', roughness: 0.9 }),
  )
  floor.position.y = terraceHeight + 0.38 + floorHeight / 2
  floor.userData = { role: 'landscape-floor' }
  group.add(floor)

  const columnHeight = Math.max(4.2, height * 1.05)
  const columnRadius = terraceRadius * 0.62
  const columnGeometry = new THREE.CylinderGeometry(0.72, 0.86, columnHeight, 8)
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    const column = new THREE.Mesh(columnGeometry, bodyMaterial)
    column.position.set(
      Math.cos(angle) * columnRadius,
      terraceHeight + 0.38 + floorHeight + columnHeight / 2,
      Math.sin(angle) * columnRadius,
    )
    column.userData = { role: 'building-body' }
    group.add(column)
  }

  const coreHeight = columnHeight * 0.68
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(terraceRadius * 0.3, terraceRadius * 0.34, coreHeight, 8),
    bodyMaterial,
  )
  base.position.y = terraceHeight + 0.38 + floorHeight + coreHeight / 2
  base.userData = { role: 'building-body' }
  group.add(base)
  addOutline(group, base, selected)
  addPavilionRoof(
    group,
    building,
    terraceHeight + 0.38 + floorHeight + columnHeight,
    selected,
  )
}

export function buildingColor(building: Pick<Building, 'category' | 'color'>, selected = false): string {
  return selected ? COLORS.selected : building.color ?? BUILDING_COLOR[building.category] ?? '#cbd5e1'
}

export function buildBuildingModel(building: Building, selected: boolean): THREE.Group {
  const group = new THREE.Group()
  const height = Math.max(1, building.height)
  addGroundShadow(group, footprintPoints(building), building.position)

  if (building.category === 'gate') {
    buildGate(group, building, selected)
  } else if (building.category === 'landscape') {
    buildPavilion(group, building, height, selected)
  } else {
    const body = new THREE.Mesh(
      extrudeFootprint(footprintPoints(building), building.position, height),
      new THREE.MeshStandardMaterial({
        color: buildingColor(building, selected),
        roughness: 0.88,
        metalness: 0,
        emissive: selected ? COLORS.selected : '#000000',
        emissiveIntensity: selected ? 0.16 : 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    )
    body.userData = { role: 'building-body' }
    group.add(body)
    addOutline(group, body, selected)
    addFacadeDetail(group, building, height, selected)
    addEntrance(group, building, height)
    addRoof(group, building, height, selected)
  }

  group.position.set(building.position[0], LAYER.building, building.position[1])
  return group
}
