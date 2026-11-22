/** S3 多地点顺序导航聚合层用例（ISSUE #59）：只验 planRouteWithVia，不碰 A*。 */
import { describe, it, expect } from 'vitest'
import type { CampusData } from '../src/data/campusData'
import type { RoadNetwork } from '../src/data/roadNetwork'
import { buildingAnchorId, planRoute, planRouteWithVia } from '../src/navigation/route'

function campus(roadNetwork: RoadNetwork, buildingPositions: [number, number][]): CampusData {
  return {
    name: '测试校园', bounds: { width: 500, depth: 500 }, zones: [], roads: [],
    waters: [], fields: [], trees: [], pois: [], roadNetwork,
    buildings: buildingPositions.map((position, index) => ({
      id: `b${index}`, name: `建筑${index}`, category: 'academic',
      position, size: [4, 4], height: 10,
    })),
  }
}

function pathNetwork(length: number, step = 10): RoadNetwork {
  const nodes = Array.from({ length: Math.floor(length / step) + 1 }, (_, index) => ({
    id: `n${index}`, position: [index * step, 0] as [number, number], kind: 'junction' as const,
  }))
  return {
    nodes,
    segments: nodes.slice(1).map((node, index) => ({
      id: `s${index}`, from: nodes[index].id, to: node.id,
      centerline: [nodes[index].position, node.position] as [number, number][],
      width: 6, class: 'walkway', surface: 'paving',
      access: { pedestrian: true, bicycle: true, vehicle: true },
    })),
  }
}

function islands(): RoadNetwork {
  return {
    nodes: [
      { id: 'a1', position: [0, 0], kind: 'entrance' },
      { id: 'a2', position: [10, 0], kind: 'junction' },
      { id: 'b1', position: [100, 0], kind: 'entrance' },
      { id: 'b2', position: [110, 0], kind: 'junction' },
    ],
    segments: [
      { id: 'island-a', from: 'a1', to: 'a2', centerline: [[0, 0], [10, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
      { id: 'island-b', from: 'b1', to: 'b2', centerline: [[100, 0], [110, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
    ],
  }
}

describe('S3 多地点顺序导航', () => {
  it('via 为空：与 planRoute 逐字段相等', () => {
    const data = campus(pathNetwork(100), [[0, 0], [50, 0], [100, 0]])
    const direct = planRoute(data, 0, 2)
    const withVia = planRouteWithVia(data, { originIndex: 0, via: [], destinationIndex: 2 })
    expect(withVia).toEqual(direct)
    expect(withVia.route).not.toBeNull()
  })

  it('单 via：距离等于两段距离之和（≤1e-6），stops 只有起/途经/终', () => {
    const data = campus(pathNetwork(100), [[5, 0], [55, 0], [96, 0]])
    expect(buildingAnchorId(data, 0)).toBe('n0')
    expect(buildingAnchorId(data, 1)).toBe('n5')
    expect(buildingAnchorId(data, 2)).toBe('n10')
    const first = planRoute(data, 0, 1).route!
    const second = planRoute(data, 1, 2).route!
    const result = planRouteWithVia(data, { originIndex: 0, via: [1], destinationIndex: 2 })
    expect(result.route).not.toBeNull()
    expect(Math.abs(result.route!.distanceMeters - (first.distanceMeters + second.distanceMeters))).toBeLessThanOrEqual(1e-6)
    expect(result.route!.durationSeconds).toBeCloseTo(first.durationSeconds + second.durationSeconds, 10)
    expect(result.route!.stops.map((stop) => [stop.name, stop.role])).toEqual([
      ['建筑0', 'origin'], ['建筑1', 'via'], ['建筑2', 'destination'],
    ])
  })

  it('3 个 via：stops 恰好 5 条，role 依次 origin/via/via/via/destination', () => {
    const data = campus(pathNetwork(100), [[5, 0], [25, 0], [45, 0], [65, 0], [85, 0], [96, 0]])
    const result = planRouteWithVia(data, { originIndex: 0, via: [1, 2, 3], destinationIndex: 5 })
    expect(result.route).not.toBeNull()
    expect(result.route!.stops).toHaveLength(5)
    expect(result.route!.stops.map((stop) => stop.role)).toEqual(['origin', 'via', 'via', 'via', 'destination'])
    expect(result.route!.stops.map((stop) => stop.name)).toEqual(['建筑0', '建筑1', '建筑2', '建筑3', '建筑5'])
  })

  it('stops 上界：长路线 9 段仍恰好 2 + via.length，中间节点只留在 rawNodePath/geometry', () => {
    const data = campus(pathNetwork(100), [[5, 0], [25, 0], [45, 0], [65, 0], [85, 0], [96, 0]])
    const via = [1, 2, 3, 4, 3, 2, 1, 4]
    const result = planRouteWithVia(data, { originIndex: 0, via, destinationIndex: 5 })
    expect(result.route).not.toBeNull()
    expect(result.route!.stops).toHaveLength(2 + via.length)
    expect(result.route!.rawNodePath.length).toBeGreaterThan(result.route!.stops.length)
    expect(result.route!.geometry.length).toBeGreaterThan(result.route!.stops.length)
  })

  it('接缝去重：相邻段共享节点 id 时 geometry 不出现零长度线段', () => {
    const data = campus(pathNetwork(100, 10), [[5, 0], [55, 0], [96, 0]])
    const result = planRouteWithVia(data, { originIndex: 0, via: [1], destinationIndex: 2 })
    const geometry = result.route!.geometry
    expect(geometry[0]).toEqual([0, 0])
    expect(geometry[geometry.length - 1]).toEqual([100, 0])
    for (let index = 1; index < geometry.length; index += 1) {
      expect(geometry[index]).not.toEqual(geometry[index - 1])
    }
    expect(result.route!.rawNodePath).toContain('n5')
  })

  it('段间接缝节点 id 不同但位置重合：保留 id 跳变，geometry 连续无零长度线段', () => {
    // 当前 via 用 buildingAnchorId 做确定性吸附，同一建筑两段必然落在同一节点，
    // 因此不会真的出现 id 跳变；这里锁定合并策略：rawNodePath 保留全部节点 id，
    // geometry 逐点拼接并只压掉坐标相同的接缝点，不做插值伪造路径。
    const network: RoadNetwork = {
      nodes: [
        { id: 'n0', position: [0, 0], kind: 'entrance' },
        { id: 'n5', position: [50, 0], kind: 'junction' },
        { id: 'n5-b', position: [50, 0], kind: 'junction' },
        { id: 'n10', position: [100, 0], kind: 'entrance' },
      ],
      segments: [
        { id: 's1', from: 'n0', to: 'n5', centerline: [[0, 0], [50, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 's2', from: 'n5', to: 'n10', centerline: [[50, 0], [100, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
      ],
    }
    const data = campus(network, [[5, 0], [46, 0], [99, 0]])
    expect(buildingAnchorId(data, 1)).toBe('n5')
    const result = planRouteWithVia(data, { originIndex: 0, via: [1], destinationIndex: 2 })
    expect(result.route).not.toBeNull()
    const raw = result.route!.rawNodePath
    expect(raw).toEqual(['n0', 'n5', 'n10'])
    const geometry = result.route!.geometry
    for (let index = 1; index < geometry.length; index += 1) {
      expect(geometry[index]).not.toEqual(geometry[index - 1])
    }
    expect(Math.abs(result.route!.distanceMeters - 100)).toBeLessThanOrEqual(1e-6)
  })

  it('via 重复值：稳定行为为按顺序各算一次（不报错）', () => {
    const data = campus(pathNetwork(100), [[5, 0], [25, 0], [45, 0], [65, 0], [85, 0], [96, 0]])
    const result = planRouteWithVia(data, { originIndex: 0, via: [1, 2, 1], destinationIndex: 5 })
    expect(result.route).not.toBeNull()
    expect(result.route!.stops.map((stop) => stop.role)).toEqual(['origin', 'via', 'via', 'via', 'destination'])
    expect(result.route!.segmentIds).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'])
    const once = planRouteWithVia(data, { originIndex: 0, via: [1, 2], destinationIndex: 5 })
    expect(result.route!.distanceMeters).toBeGreaterThan(once.route!.distanceMeters)
  })

  it('via 含起点或终点：稳定返回 via-conflict，不抛异常', () => {
    const data = campus(pathNetwork(100), [[0, 0], [50, 0], [100, 0]])
    for (const via of [[0], [2], [1, 2]]) {
      let result
      expect(() => { result = planRouteWithVia(data, { originIndex: 0, via, destinationIndex: 2 }) }).not.toThrow()
      expect(result!.route).toBeNull()
      expect(result!.error?.code).toBe('via-conflict')
    }
  })

  it.each([-1, 3, Number.NaN])('via 含非法索引 %p：返回 invalid-position，不抛异常', (bad) => {
    const data = campus(pathNetwork(100), [[0, 0], [50, 0], [100, 0]])
    let result
    expect(() => { result = planRouteWithVia(data, { originIndex: 0, via: [1, bad], destinationIndex: 2 }) }).not.toThrow()
    expect(result!.route).toBeNull()
    expect(result!.error?.code).toBe('invalid-position')
  })

  it('via 与终点互不连通：返回 unreachable，不给半条路线', () => {
    const data = campus(islands(), [[5, 0], [105, 0], [55, 0]])
    data.buildings[2].position = [55, 0]
    let result
    expect(() => { result = planRouteWithVia(data, { originIndex: 0, via: [2], destinationIndex: 1 }) }).not.toThrow()
    expect(result!.route).toBeNull()
    expect(result!.error?.code).toBe('unreachable')
  })
})
