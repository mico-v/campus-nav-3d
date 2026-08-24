import { describe, expect, it } from 'vitest'
import type { CampusData } from '../data/campusData'
import { buildRoadNetwork } from '../data/roadNetwork'
import { buildRoadJunctions, buildRoads } from './builders'
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
})
