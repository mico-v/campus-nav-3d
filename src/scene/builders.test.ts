import { describe, expect, it } from 'vitest'
import type { CampusData } from '../data/campusData'
import { buildRoadNetwork } from '../data/roadNetwork'
import { buildBuilding, buildFields, buildRoadJunctions, buildRoads, buildRoadStrokeGeometries, buildWaters } from './builders'
import { LAYER } from './theme'
import * as THREE from 'three'

function campus(): CampusData {
  const roads = [
    { id: 'east-west', points: [[0, 0], [100, 0]] as [number, number][], width: 12, kind: 'road' as const },
    { id: 'north-south', points: [[50, -50], [50, 50]] as [number, number][], width: 8, kind: 'road' as const },
  ]
  return {
    name: 'test',
    bounds: { width: 100, depth: 100 },
    zones: [], buildings: [], roads, roadNetwork: buildRoadNetwork(roads),
    waters: [], fields: [], trees: [], pois: [],
  }
}

function collectRoles(object: THREE.Object3D): Set<string> {
  const roles = new Set<string>()
  object.traverse((child) => {
    const role = child.userData.role
    if (typeof role === 'string') roles.add(role)
  })
  return roles
}

describe('road render batching', () => {
  it('groups generated topology segments by authored road', () => {
    const structures = buildRoads(campus(), { showGraphRoads: true })
    expect(structures).toHaveLength(2)
    expect(structures.every((structure) => structure.userData.sourceIndex >= 0)).toBe(true)
    const eastWest = structures.find((structure) => structure.userData.id === 'east-west')
    expect(eastWest).toBeDefined()
    expect([...collectRoles(eastWest!)].sort()).toEqual([
      'road-curb',
      'road-edge-line',
      'road-markings',
      'road-shoulder',
      'road-sidewalk',
      'road-surface',
    ])
  })

  it('places merged junction geometry at the actual crossing', () => {
    const junctions = buildRoadJunctions(campus())
    expect(junctions).toHaveLength(1)
    const box = new THREE.Box3().setFromObject(junctions[0])
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(50, 0)
    expect(box.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 0)
    expect(junctions[0].position.y).toBeLessThan(LAYER.roadMarking)
    expect(junctions[0].userData.role).toBe('road-junction')
  })

  it('matches a walkway junction to its paving instead of asphalt', () => {
    const roads = [
      {
        id: 'paved-east-west',
        points: [[0, 0], [100, 0]] as [number, number][],
        width: 4,
        kind: 'road' as const,
        roadClass: 'walkway' as const,
        surface: 'paving' as const,
      },
      {
        id: 'paved-north-south',
        points: [[50, -50], [50, 50]] as [number, number][],
        width: 4,
        kind: 'road' as const,
        roadClass: 'walkway' as const,
        surface: 'paving' as const,
      },
    ]
    const data = { ...campus(), roads, roadNetwork: buildRoadNetwork(roads) }
    const junctions = buildRoadJunctions(data)
    expect(junctions).toHaveLength(1)
    const material = (junctions[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(`#${material.color.getHexString()}`).toBe('#aaa39b')
  })

  it('preserves the full authored width through a sharp bend', () => {
    const geometries = buildRoadStrokeGeometries([[0, 0], [20, 0], [20, 20]], 10)
    const group = new THREE.Group()
    geometries.forEach((geometry) => group.add(new THREE.Mesh(geometry)))
    const box = new THREE.Box3().setFromObject(group)
    expect(box.min.x).toBeCloseTo(-5, 1)
    expect(box.max.x).toBeCloseTo(25, 1)
    expect(box.min.z).toBeCloseTo(-5, 1)
    expect(box.max.z).toBeCloseTo(25, 1)
  })
})

describe('water and bridge detail', () => {
  it('layers every water body with bed, bank, surface, shoreline and rocks', () => {
    const data = campus()
    data.waters = [{
      id: 'garden-pond',
      name: '园中水景',
      center: [25, 30],
      size: [30, 15],
      footprint: [[10, 20], [40, 20], [40, 40], [10, 40]],
    }]
    const waters = buildWaters(data)
    expect(waters).toHaveLength(1)
    const roles = collectRoles(waters[0])
    expect(roles.has('water-bed')).toBe(true)
    expect(roles.has('water-bank')).toBe(true)
    expect(roles.has('water-surface')).toBe(true)
    expect(roles.has('water-shoreline')).toBe(true)
    expect(roles.has('water-rocks')).toBe(true)
    expect(roles.has('bridge-deck')).toBe(false)
  })

  it('adds a raised deck, sidewalks and rails where a road crosses water', () => {
    const data = campus()
    data.waters = [{
      id: 'crossing-pond',
      name: '跨路水体',
      center: [50, 0],
      size: [30, 30],
      footprint: [[35, -15], [65, -15], [65, 15], [35, 15]],
    }]
    const roles = collectRoles(buildWaters(data)[0])
    expect(roles.has('bridge')).toBe(true)
    expect(roles.has('bridge-deck')).toBe(true)
    expect(roles.has('bridge-sidewalk')).toBe(true)
    expect(roles.has('bridge-rail')).toBe(true)
    expect(roles.has('bridge-post')).toBe(true)
    expect(roles.has('bridge-abutment')).toBe(true)
  })
})

describe('sports field layering', () => {
  it('keeps an inner pitch above its authored track footprint', () => {
    const data = campus()
    data.fields = [
      { id: 'track', name: 'running', center: [0, 0], size: [100, 160], footprint: [[-50, -80], [50, -80], [50, 80], [-50, 80]] },
      { id: 'pitch', name: 'soccer', center: [0, 0], size: [70, 120], footprint: [[-35, -60], [35, -60], [35, 60], [-35, 60]] },
    ]
    const fields = buildFields(data)
    expect(fields[0].children[0].position.y).toBe(LAYER.field)
    expect(fields[1].children[0].position.y).toBe(LAYER.fieldSurface)
  })
})

describe('architectural building model', () => {
  it('adds facade, entrance, roof and equipment detail to an academic building', () => {
    const building = {
      id: 'academic',
      name: '教学楼',
      category: 'academic' as const,
      position: [200, 180] as [number, number],
      size: [90, 48] as [number, number],
      height: 24,
      footprint: [
        [155, 156], [245, 156], [245, 204], [155, 204],
      ] as [number, number][],
    }
    const group = buildBuilding(building, false)
    const roles = collectRoles(group)
    expect(roles.has('building-body')).toBe(true)
    expect(roles.has('building-window')).toBe(true)
    expect(roles.has('building-trim')).toBe(true)
    expect(roles.has('building-entrance')).toBe(true)
    expect(roles.has('building-roof')).toBe(true)
    expect(roles.has('building-roof-unit')).toBe(true)
  })

  it('builds a gate as separate pillars and a crossbeam', () => {
    const group = buildBuilding({
      id: 'gate',
      name: '校门',
      category: 'gate',
      position: [0, 0],
      size: [30, 12],
      height: 8,
    }, false)
    const body = group.children.find((child) => child.userData.role === 'building-body') as THREE.Mesh | undefined
    expect(body).toBeDefined()
    const bounds = new THREE.Box3().setFromObject(body!)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(25)
    expect(bounds.max.y).toBeGreaterThan(7)
    expect(group.children.some((child) => child.userData.role === 'building-detail')).toBe(true)
  })

  it('builds a pavilion with a stone terrace and columned body', () => {
    const group = buildBuilding({
      id: 'pavilion',
      name: '湖心亭',
      category: 'landscape',
      position: [0, 0],
      size: [50, 36],
      height: 4,
    }, false)
    const roles = collectRoles(group)
    expect(roles.has('landscape-terrace')).toBe(true)
    expect(roles.has('landscape-step')).toBe(true)
    expect(roles.has('landscape-floor')).toBe(true)
    expect(roles.has('building-body')).toBe(true)
    expect(roles.has('building-roof')).toBe(true)
  })
})
