import { describe, it, expect } from 'vitest'
import {
  polygonCentroid,
  polygonBounds,
  insertVertex,
  removeVertex,
  moveVertex,
  distance,
  nearestVertex,
  nearestEdge,
  pointInPolygon,
  translatePoints,
  type Point,
} from './geometry.ts'

const square: Point[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

describe('polygonCentroid', () => {
  it('returns the center of a square', () => {
    const [x, z] = polygonCentroid(square)
    expect(x).toBeCloseTo(2)
    expect(z).toBeCloseTo(2)
  })
})

describe('polygonBounds', () => {
  it('computes width/depth/min/max', () => {
    const b = polygonBounds(square)
    expect(b).toMatchObject({ minX: 0, maxX: 4, minZ: 0, maxZ: 4, width: 4, depth: 4 })
  })
})

describe('insertVertex', () => {
  it('inserts a point after the given edge index', () => {
    const result = insertVertex([[0, 0], [4, 0]], 0, [2, 0])
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual([2, 0])
  })
})

describe('removeVertex', () => {
  it('refuses to drop below 3 vertices', () => {
    const tri: Point[] = [[0, 0], [4, 0], [2, 4]]
    expect(removeVertex(tri, 0)).toBe(tri)
  })
  it('removes a vertex when more than 3 remain', () => {
    const result = removeVertex(square, 1)
    expect(result).toHaveLength(3)
    expect(result).not.toContainEqual([4, 0])
  })
})

describe('moveVertex', () => {
  it('replaces a vertex position', () => {
    const result = moveVertex(square, 0, [1, 1])
    expect(result[0]).toEqual([1, 1])
    expect(result[1]).toEqual([4, 0])
  })
})

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(distance([0, 0], [3, 4])).toBe(5)
  })
})

describe('nearestVertex', () => {
  it('returns the closest vertex index within maxDist', () => {
    expect(nearestVertex([[0, 0], [10, 0]], [0.5, 0], 1)).toBe(0)
  })
  it('returns null when none is within maxDist', () => {
    expect(nearestVertex([[0, 0], [10, 0]], [5, 0], 1)).toBeNull()
  })
})

describe('nearestEdge', () => {
  it('projects onto the closest segment', () => {
    const edge = nearestEdge([[0, 0], [10, 0]], [5, 0.5], 1)
    expect(edge?.index).toBe(0)
    expect(edge?.point[0]).toBeCloseTo(5)
    expect(edge?.point[1]).toBeCloseTo(0)
  })
  it('returns null when too far', () => {
    expect(nearestEdge([[0, 0], [10, 0]], [5, 50], 1)).toBeNull()
  })
})

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true)
    expect(pointInPolygon([5, 5], square)).toBe(false)
  })
})

describe('translatePoints', () => {
  it('shifts all points', () => {
    expect(translatePoints([[0, 0], [1, 1]], 2, 3)).toEqual([[2, 3], [3, 4]])
  })
})
