import { describe, expect, it } from 'vitest'
import type { CampusData } from '../data/campusData'
import { buildRoadNetwork } from '../data/roadNetwork'
import { buildFields, buildRoadJunctions, buildRoads, buildRoadStrokeGeometries } from './builders'
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

describe('road render batching', () => {
  it('groups generated topology segments by authored road', () => {
    const structures = buildRoads(campus(), { showGraphRoads: true })
    expect(structures).toHaveLength(2)
    expect(structures.every((structure) => structure.userData.sourceIndex >= 0)).toBe(true)
    expect(structures.find((structure) => structure.userData.id === 'east-west')?.children).toHaveLength(3)
  })

  it('places merged junction geometry at the actual crossing', () => {
    const junctions = buildRoadJunctions(campus())
    expect(junctions).toHaveLength(1)
    const box = new THREE.Box3().setFromObject(junctions[0])
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(50, 0)
    expect(box.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 0)
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
