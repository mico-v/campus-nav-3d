import { describe, expect, it } from 'vitest'
import { findShortestPath } from './pathfinding'
import type { RoadNetwork } from '../data/roadNetwork'

const network: RoadNetwork = {
  nodes: [
    { id: 'a', position: [0, 0], kind: 'entrance' },
    { id: 'b', position: [10, 0], kind: 'junction' },
    { id: 'c', position: [20, 0], kind: 'waypoint' },
    { id: 'd', position: [10, 10], kind: 'waypoint' },
  ],
  segments: [
    { id: 'ab', from: 'a', to: 'b', centerline: [[0, 0], [10, 0]], width: 8, class: 'main', surface: 'concrete', access: { pedestrian: true, bicycle: true, vehicle: true } },
    { id: 'bc', from: 'b', to: 'c', centerline: [[10, 0], [20, 0]], width: 8, class: 'main', surface: 'concrete', access: { pedestrian: true, bicycle: true, vehicle: true } },
    { id: 'bd', from: 'b', to: 'd', centerline: [[10, 0], [10, 10]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: false, vehicle: false } },
  ],
}

describe('runtime navigation', () => {
  it('finds a path over connected road segments', () => {
    const result = findShortestPath(network, { originNodeId: 'a', destinationNodeId: 'c' })
    expect(result?.nodePath).toEqual(['a', 'b', 'c'])
    expect(result?.segmentPath).toEqual(['ab', 'bc'])
    expect(result?.distance).toBe(20)
    expect(result?.geometry).toEqual([[0, 0], [10, 0], [20, 0]])
  })

  it('respects travel mode access', () => {
    expect(findShortestPath(network, { originNodeId: 'a', destinationNodeId: 'd', mode: 'vehicle' })).toBeNull()
    expect(findShortestPath(network, { originNodeId: 'a', destinationNodeId: 'd', mode: 'pedestrian' })?.segmentPath).toEqual(['ab', 'bd'])
  })

  it('does not traverse one-way segments backwards', () => {
    const oneWay: RoadNetwork = { ...network, segments: network.segments.map((segment) => segment.id === 'ab' ? { ...segment, oneWay: true } : segment) }
    expect(findShortestPath(oneWay, { originNodeId: 'b', destinationNodeId: 'a' })).toBeNull()
  })

  it('sums per-segment travel times and emits a turn instruction', () => {
    const result = findShortestPath({
      nodes: network.nodes,
      segments: network.segments.map((segment) => segment.id === 'bd'
        ? { ...segment, speed: 2 }
        : { ...segment, speed: 10 }),
    }, { originNodeId: 'a', destinationNodeId: 'd' })
    expect(result?.duration).toBeCloseTo(1 + 5)
    expect(result?.instructions.some((instruction) => instruction.includes('左转'))).toBe(true)
  })

  it('attaches arbitrary points to a segment without mutating the network', () => {
    const before = JSON.stringify(network)
    const result = findShortestPath(network, {
      origin: { position: [2, 3] },
      destination: { position: [18, -2] },
    })
    expect(result?.segmentPath).toEqual(['ab', 'bc'])
    expect(result?.geometry).toEqual([[2, 3], [2, 0], [10, 0], [18, 0], [18, -2]])
    expect(result?.originSnapDistance).toBe(3)
    expect(result?.destinationSnapDistance).toBe(2)
    expect(result?.originPosition).toEqual([2, 3])
    expect(result?.destinationPosition).toEqual([18, -2])
    expect(JSON.stringify(network)).toBe(before)
  })

  it('projects onto every part of a bent centerline', () => {
    const bent: RoadNetwork = {
      nodes: [
        { id: 'a', position: [0, 0], kind: 'waypoint' },
        { id: 'b', position: [10, 10], kind: 'waypoint' },
      ],
      segments: [{ id: 'bend', from: 'a', to: 'b', centerline: [[0, 0], [10, 0], [10, 10]], width: 6, class: 'secondary', surface: 'concrete', access: { pedestrian: true, bicycle: true, vehicle: false } }],
    }
    const result = findShortestPath(bent, { origin: { position: [8, 4] }, destination: { position: [10, 8] } })
    expect(result?.snappedOrigin).toEqual([10, 4])
    expect(result?.snappedDestination).toEqual([10, 8])
    expect(result?.geometry).toEqual([[8, 4], [10, 4], [10, 8]])
    expect(result?.distance).toBe(6)
  })

  it('rejects a point outside its explicit snap distance', () => {
    expect(findShortestPath(network, {
      origin: { position: [0, 20], maxSnapDistance: 5 },
      destination: { position: [20, 0], maxSnapDistance: 5 },
    })).toBeNull()
  })

  it('respects one-way direction for point-to-point requests on one segment', () => {
    const oneWay: RoadNetwork = { ...network, segments: network.segments.map((segment) => segment.id === 'ab' ? { ...segment, oneWay: true } : segment) }
    expect(findShortestPath(oneWay, { origin: { position: [8, 0] }, destination: { position: [2, 0] } })).toBeNull()
    expect(findShortestPath(oneWay, { origin: { position: [2, 0] }, destination: { position: [8, 0] } })?.segmentPath).toEqual(['ab'])
  })

  it('supports two points on the same road location as a zero-road route', () => {
    const result = findShortestPath(network, { origin: { position: [5, 2] }, destination: { position: [5, -2] } })
    expect(result?.segmentPath).toEqual([])
    expect(result?.geometry).toEqual([[5, 2], [5, 0], [5, -2]])
  })
})
