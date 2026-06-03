import { describe, it, expect } from 'vitest'
import { computeDataBounds } from './canvas2d.ts'
import type { CampusData } from '../data/campusData.ts'

function emptyData(): CampusData {
  return {
    name: 't',
    bounds: { width: 0, depth: 0 },
    zones: [],
    buildings: [],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
    routes: [],
  }
}

describe('computeDataBounds', () => {
  it('falls back to a default box when empty', () => {
    expect(computeDataBounds(emptyData())).toEqual({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 })
  })

  it('covers a footprint building', () => {
    const data = emptyData()
    data.buildings.push({
      id: 'b',
      name: 'b',
      category: 'academic',
      position: [0, 0],
      size: [10, 10],
      height: 5,
      zoneId: 'z',
      footprint: [
        [10, 20],
        [30, 20],
        [30, 40],
        [10, 40],
      ],
    })
    expect(computeDataBounds(data)).toEqual({ minX: 10, maxX: 30, minZ: 20, maxZ: 40 })
  })

  it('covers a box building via position +/- size', () => {
    const data = emptyData()
    data.buildings.push({
      id: 'b',
      name: 'b',
      category: 'academic',
      position: [100, 100],
      size: [20, 40],
      height: 5,
      zoneId: 'z',
    })
    expect(computeDataBounds(data)).toEqual({ minX: 90, maxX: 110, minZ: 80, maxZ: 120 })
  })

  it('includes road points', () => {
    const data = emptyData()
    data.roads.push({ id: 'r', points: [[-5, -5], [50, 60]] })
    expect(computeDataBounds(data)).toEqual({ minX: -5, maxX: 50, minZ: -5, maxZ: 60 })
  })
})
