/**
 * M5-B 路线聚合回归（CNB #44）。
 * 只测「在 findShortestPath 之上做聚合」这一层：距离/用时/途经节点三元组、
 * 多点图取最短、重复结果稳定，以及 UI 必须接到的三件东西。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CampusData } from '../src/data/campusData'
import type { RoadNetwork } from '../src/data/roadNetwork'
import { planRouteBetweenBuildings, WALKING_SPEED_METERS_PER_SECOND, buildingAnchorId } from '../src/navigation/route'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainTs = readFileSync(join(repoRoot, 'src/main.ts'), 'utf8')
const navUiTs = readFileSync(join(repoRoot, 'src/ui/navigation-ui.ts'), 'utf8')

const line = (id: string, from: string, to: string, length: number): RoadNetwork => ({
  nodes: [
    { id: from, position: [0, 0], kind: 'entrance' },
    { id: to, position: [length, 0], kind: 'entrance' },
  ],
  segments: [{
    id, from, to, centerline: [[0, 0], [length, 0]], width: 6, class: 'walkway', surface: 'paving',
    access: { pedestrian: true, bicycle: false, vehicle: false },
  }],
})

function campus(network: RoadNetwork): CampusData {
  return {
    name: '测试校园', bounds: { width: 100, depth: 100 }, zones: [], roads: [],
    waters: [], fields: [], trees: [], pois: [], roadNetwork: network,
    buildings: [
      { id: 'a', name: '教学楼 A', category: 'academic', position: [1, 1], size: [4, 4], height: 10 },
      { id: 'b', name: '图书馆', category: 'library', position: [99, 1], size: [4, 4], height: 12 },
    ],
  }
}

describe('路线聚合三元组', () => {
  it('距离(米) / 预计用时(秒) / 途经节点同时返回，且用时按步行速度常量换算', () => {
    const data = campus(line('direct', 'a-node', 'b-node', 100))
    data.buildings[0].position = [0, 0]
    data.buildings[1].position = [100, 0]
    const summary = planRouteBetweenBuildings(data, 0, 1)
    expect(summary).not.toBeNull()
    expect(summary!.distanceMeters).toBeCloseTo(100)
    expect(summary!.durationSeconds).toBeCloseTo(100 / WALKING_SPEED_METERS_PER_SECOND)
    expect(summary!.stops.map((stop) => stop.name)).toEqual(['教学楼 A', '图书馆'])
    expect(summary!.stops.map((stop) => stop.role)).toEqual(['origin', 'destination'])
    expect(summary!.geometry.length).toBeGreaterThanOrEqual(2)
  })

  it('途经的路口节点按路径顺序出现在起终点之间', () => {
    const network: RoadNetwork = {
      nodes: [
        { id: 'a', position: [0, 0], kind: 'entrance' },
        { id: 'mid', position: [10, 0], kind: 'junction' },
        { id: 'b', position: [20, 0], kind: 'entrance' },
      ],
      segments: [
        { id: 'am', from: 'a', to: 'mid', centerline: [[0, 0], [10, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 'mb', from: 'mid', to: 'b', centerline: [[10, 0], [20, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
      ],
    }
    const data = campus(network)
    data.buildings[0].position = [0, 0]
    data.buildings[1].position = [20, 0]
    const summary = planRouteBetweenBuildings(data, 0, 1)!
    expect(summary.stops.map((stop) => stop.nodeId)).toEqual(['a', 'mid', 'b'])
    expect(summary.stops[1].role).toBe('via')
    expect(summary.stops[1].name).toBe('mid')
    expect(summary.distanceMeters).toBeCloseTo(20)
  })
})

describe('多点图取最短与稳定性', () => {
  it('两条候选路径里选距离更短的那条', () => {
    const network: RoadNetwork = {
      nodes: [
        { id: 'a', position: [0, 0], kind: 'entrance' },
        { id: 'b', position: [100, 0], kind: 'entrance' },
        { id: 'short-1', position: [40, 0], kind: 'junction' },
        { id: 'short-2', position: [60, 0], kind: 'junction' },
        { id: 'long-1', position: [0, 30], kind: 'junction' },
        { id: 'long-2', position: [100, 30], kind: 'junction' },
      ],
      segments: [
        { id: 's1', from: 'a', to: 'short-1', centerline: [[0, 0], [40, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 's2', from: 'short-1', to: 'short-2', centerline: [[40, 0], [60, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 's3', from: 'short-2', to: 'b', centerline: [[60, 0], [100, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 'l1', from: 'a', to: 'long-1', centerline: [[0, 0], [0, 30]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 'l2', from: 'long-1', to: 'long-2', centerline: [[0, 30], [100, 30]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 'l3', from: 'long-2', to: 'b', centerline: [[100, 30], [100, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
      ],
    }
    const data = campus(network)
    data.buildings[0].position = [0, 0]
    data.buildings[1].position = [100, 0]
    const summary = planRouteBetweenBuildings(data, 0, 1)!
    expect(summary.distanceMeters).toBeCloseTo(100)
    expect(summary.segmentIds).toEqual(['s1', 's2', 's3'])
    expect(summary.stops.map((stop) => stop.name)).toEqual(['教学楼 A', 'short-1', 'short-2', '图书馆'])
  })

  it('同一输入重复计算，三元组与途经节点完全一致', () => {
    const data = campus(line('stable', 'a-node', 'b-node', 42))
    const first = planRouteBetweenBuildings(data, 0, 1)
    for (let index = 0; index < 5; index += 1) {
      expect(planRouteBetweenBuildings(data, 0, 1)).toEqual(first)
    }
  })
})

describe('锚点与 UI 接线', () => {
  it('建筑按轮廓最近节点锚定；无路网或无节点时返回 null，留给 M5-C 提示', () => {
    const data = campus(line('anchor', 'a-node', 'b-node', 10))
    expect(buildingAnchorId(data, 0)).toBe('a-node')
    expect(buildingAnchorId(data, 1)).toBe('b-node')
    expect(buildingAnchorId(campus({ nodes: [], segments: [] }), 0)).toBeNull()
    expect(buildingAnchorId({ ...data, roadNetwork: undefined }, 0)).toBeNull()
  })

  it('地图页接线复用 findShortestPath，UI 出示距离/用时/途经节点', () => {
    expect(mainTs).toContain('planRouteBetweenBuildings')
    expect(navUiTs).toContain('距离')
    expect(navUiTs).toContain('预计用时')
    expect(navUiTs).toContain('途经节点')
    expect(mainTs).toContain('createRouteOverlay')
    expect(mainTs).toContain("navUi.pickMode()")
  })
})
