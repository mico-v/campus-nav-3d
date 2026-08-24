import { describe, expect, it } from 'vitest'
import type { Road } from './campusData'
import { buildRoadNetwork, mergeRoadNodes, moveRoadNode, removeRoadNode, validateRoadNetwork } from './roadNetwork'
import { syncRoadNetwork } from './roadNormalization'
import type { CampusData } from './campusData'

const road = (id: string, points: [number, number][], width = 8): Road => ({ id, points, width, kind: 'road', sourceIds: [id] })

describe('road network migration', () => {
  it('splits a crossing into a routable junction', () => {
    const network = buildRoadNetwork([
      road('horizontal', [[0, 0], [10, 0]]),
      road('vertical', [[5, -5], [5, 5]]),
    ])
    expect(network.nodes.some((node) => node.kind === 'junction' && node.position[0] === 5 && node.position[1] === 0)).toBe(true)
    expect(network.segments).toHaveLength(4)
    expect(validateRoadNetwork(network)).toEqual([])
  })

  it('does not treat an intersection on the extension of a road as a junction', () => {
    const network = buildRoadNetwork([
      road('horizontal', [[0, 0], [10, 0]]),
      road('vertical', [[15, -5], [15, 5]]),
    ])
    expect(network.nodes.some((node) => node.kind === 'junction')).toBe(false)
    expect(network.segments).toHaveLength(2)
  })

  it('preserves bends in each segment centerline', () => {
    const network = buildRoadNetwork([road('bend', [[0, 0], [5, 0], [5, 5]])], { splitIntersections: false })
    expect(network.segments).toHaveLength(1)
    expect(network.segments[0].centerline).toEqual([[0, 0], [5, 0], [5, 5]])
  })

  it('keeps the closing edge of a closed authored road', () => {
    const network = buildRoadNetwork([road('loop', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])], { splitIntersections: false })
    expect(network.segments).toHaveLength(4)
    expect(network.segments.some((segment) => segment.centerline[0][0] === 0 && segment.centerline[0][1] === 10 && segment.centerline.at(-1)?.[0] === 0 && segment.centerline.at(-1)?.[1] === 0)).toBe(true)
    expect(network.segments.every((segment) => segment.from !== segment.to)).toBe(true)
    expect(validateRoadNetwork(network)).toEqual([])
  })

  it('reports dangling references and invalid geometry', () => {
    expect(validateRoadNetwork({ nodes: [], segments: [{ id: 's', from: 'a', to: 'b', centerline: [[0, 0]], width: 0, class: 'walkway', surface: 'concrete', access: { pedestrian: true, bicycle: false, vehicle: false } }] })).toEqual([
      '道路段 s 引用了不存在的节点',
      '道路段 s 至少需要 2 个中心线点',
      '道路段 s 宽度无效',
    ])
  })

  it('moves a generated junction through every touching source road', () => {
    const roads = [road('horizontal', [[0, 0], [10, 0]]), road('vertical', [[5, -5], [5, 5]])]
    const network = buildRoadNetwork(roads)
    const node = network.nodes.find((candidate) => candidate.kind === 'junction' && candidate.position[0] === 5)
    expect(node).toBeDefined()
    expect(moveRoadNode(roads, network, node!.id, [6, 0], 1)).toBe(true)
    expect(roads[0].points).toContainEqual([6, 0])
    expect(roads[1].points).toContainEqual([6, 0])
  })

  it('preserves a moved node id during topology synchronization', () => {
    const data: CampusData = {
      name: 'test', bounds: { width: 20, depth: 20 }, zones: [], buildings: [],
      roads: [road('a', [[0, 0], [10, 0]]), road('b', [[5, -5], [5, 5]])],
      waters: [], fields: [], trees: [], pois: [],
    }
    syncRoadNetwork(data)
    const before = data.roadNetwork!.nodes.find((node) => node.kind === 'junction')!
    expect(moveRoadNode(data.roads, data.roadNetwork!, before.id, [7, 0], 1)).toBe(true)
    syncRoadNetwork(data)
    const after = data.roadNetwork!.nodes.find((node) => node.position[0] === 7 && node.position[1] === 0)
    expect(after?.id).toBe(before.id)
  })

  it('protects junction topology when deleting a node', () => {
    const crossingRoads = [road('h', [[0, 0], [10, 0]]), road('v', [[5, -5], [5, 5]])]
    const crossingNetwork = buildRoadNetwork(crossingRoads)
    const junction = crossingNetwork.nodes.find((node) => node.kind === 'junction')!
    expect(removeRoadNode(crossingRoads, crossingNetwork, junction.id)).toBe(false)
  })

  it('allows deleting an ordinary terminal waypoint while preserving a valid road', () => {
    const roads = [road('terminal', [[0, 0], [5, 0], [10, 0]])]
    const network = buildRoadNetwork(roads, { splitIntersections: false })
    const endpoint = network.nodes.find((node) => node.position[0] === 0)!
    expect(removeRoadNode(roads, network, endpoint.id)).toBe(true)
    expect(roads[0].points).toEqual([[5, 0], [10, 0]])
  })

  it('merges nearby nodes by moving the source geometry to the target', () => {
    const roads = [road('a', [[0, 0], [10, 0]]), road('b', [[10.5, 0], [20, 0]])]
    const network = buildRoadNetwork(roads, { snapTolerance: 0.1, splitIntersections: false })
    const source = network.nodes.find((node) => node.position[0] === 10.5)!
    const target = network.nodes.find((node) => node.position[0] === 10)!
    expect(mergeRoadNodes(roads, network, source.id, target.id, 1)).toBe(true)
    expect(roads[1].points[0]).toEqual([10, 0])
  })
})
