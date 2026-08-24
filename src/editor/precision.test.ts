import { describe, expect, it } from 'vitest'
import { mergeRoads, nearestNode, nearestSegment, snapAngle, snapPoint, snapToGrid, splitRoad } from './precision.ts'

describe('precision editor helpers', () => {
  const roads = [{ id: 'r', points: [[0, 0], [10, 0], [10, 10]] as [number, number][], width: 3 }]
  it('snaps grid and angle', () => {
    expect(snapToGrid([14, 16], 10)).toEqual([10, 20])
    expect(snapAngle([0, 0], [7, 2], 45)[1]).toBeCloseTo(0)
  })
  it('finds nearest node and segment', () => {
    expect(nearestNode(roads, [9.5, 0.2], 2)?.vertexIndex).toBe(1)
    expect(nearestSegment(roads, [5, 1], 2)?.segmentIndex).toBe(0)
  })
  it('uses existing road geometry before grid', () => {
    expect(snapPoint([10.2, 0.1], roads, [], { gridSize: 10, snapDistance: 2, grid: true, angle: false }).kind).toBe('vertex')
  })
  it('splits and merges roads', () => {
    const parts = splitRoad(roads[0], 0, [5, 0])
    expect(parts).toHaveLength(2)
    expect(parts[0].points).toEqual([[0, 0], [5, 0]])
    expect(parts[0].sourceIds).toEqual(['r-a'])
    expect(parts[1].sourceIds).toEqual(['r-b'])
    expect(mergeRoads(parts[0], parts[1])?.points).toEqual([[0, 0], [5, 0], [10, 0], [10, 10]])
  })
  it('rejects merging adjacent roads with incompatible routing attributes', () => {
    const first = { id: 'a', points: [[0, 0], [10, 0]] as [number, number][], width: 4 }
    const second = { id: 'b', points: [[10, 0], [20, 0]] as [number, number][], width: 8 }
    expect(mergeRoads(first, second)).toBeNull()
  })
})
