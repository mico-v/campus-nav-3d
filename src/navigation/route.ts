/**
 * M5-B 路线聚合层：只把 findShortestPath 的结果整理成 UI 要用的
 * 距离（米）/ 用时（秒）/ 途经节点，不另写寻路。
 */
import type { CampusData } from '../data/campusData'
import type { RoadNetwork } from '../data/roadNetwork'
import { findShortestPath } from './pathfinding'
import type { NavigationResult } from './types'

/** 成人步行速度：场景坐标 1 单位 = 1 米，1.4 m/s ≈ 5 km/h。 */
export const WALKING_SPEED_METERS_PER_SECOND = 1.4

export interface RouteStop {
  nodeId: string
  name: string
  position: [number, number]
  /** 'origin' / 'via' / 'destination'；起终点的 name 用建筑名覆盖。 */
  role: 'origin' | 'via' | 'destination'
}

export interface RouteSummary {
  distanceMeters: number
  durationSeconds: number
  stops: RouteStop[]
  geometry: [number, number][]
  segmentIds: string[]
  /** A* 结果里的内部节点（含 __runtime-*）不暴露给 UI。 */
  rawNodePath: string[]
}

/** 建筑锚点 = 其轮廓（或中心）最近的路网节点；没有节点返回 null，留给 M5-C 做提示。 */
export function buildingAnchorId(data: CampusData, buildingIndex: number): string | null {
  const building = data.buildings[buildingIndex]
  const network = data.roadNetwork
  if (!building || !network?.nodes.length) return null
  const candidates: [number, number][] = building.footprint?.length
    ? building.footprint.map(([x, z]) => [x, z])
    : [building.position]
  let bestId: string | null = null
  let best = Infinity
  for (const node of network.nodes) {
    const distance = Math.min(...candidates.map(([x, z]) => Math.hypot(node.position[0] - x, node.position[1] - z)))
    if (distance < best) { best = distance; bestId = node.id }
  }
  return bestId
}

function stopLabel(nodeId: string, network: RoadNetwork, endpointName?: string, role?: RouteStop['role']): string {
  if (endpointName) return endpointName
  if (nodeId.startsWith('__runtime-')) return nodeId === '__runtime-origin' ? '起点' : '终点'
  const node = network.nodes.find((candidate) => candidate.id === nodeId)
  return node ? node.id : role === 'origin' ? '起点' : role === 'destination' ? '终点' : nodeId
}

/** 在 findShortestPath 上做聚合。origin/destination 为建筑索引，返回 null 表示不可达或无节点。 */
export function planRouteBetweenBuildings(
  data: CampusData,
  originIndex: number,
  destinationIndex: number,
  options: { speedMetersPerSecond?: number } = {},
): RouteSummary | null {
  const network = data.roadNetwork
  if (!network) return null
  const originId = buildingAnchorId(data, originIndex)
  const destinationId = buildingAnchorId(data, destinationIndex)
  if (!originId || !destinationId) return null
  const speed = options.speedMetersPerSecond && options.speedMetersPerSecond > 0
    ? options.speedMetersPerSecond
    : WALKING_SPEED_METERS_PER_SECOND
  const result: NavigationResult | null = findShortestPath(network, {
    originNodeId: originId,
    destinationNodeId: destinationId,
    mode: 'pedestrian',
  }, { mode: 'pedestrian', speedMetersPerSecond: speed })
  if (!result) return null
  const path = result.nodePath
  const stops: RouteStop[] = path.filter((id) => !id.startsWith('__runtime-')).map((nodeId, index) => {
    const role: RouteStop['role'] = index === 0 ? 'origin' : index === path.length - 1 ? 'destination' : 'via'
    const name = role === 'origin'
      ? data.buildings[originIndex]?.name ?? stopLabel(nodeId, network)
      : role === 'destination'
        ? data.buildings[destinationIndex]?.name ?? stopLabel(nodeId, network)
        : stopLabel(nodeId, network, undefined, role)
    const node = network.nodes.find((candidate) => candidate.id === nodeId)
    return { nodeId, name, position: [node?.position[0] ?? 0, node?.position[1] ?? 0], role }
  })
  return {
    distanceMeters: result.distance,
    durationSeconds: result.duration,
    stops,
    geometry: result.geometry,
    segmentIds: result.segmentPath,
    rawNodePath: path,
  }
}

/** 摘要卡展示用：米 + 秒，保留 1 位小数，避免浮点尾巴噪声。 */
export function formatRouteSummary(summary: RouteSummary): { distance: string; duration: string; stops: string } {
  return {
    distance: `${Math.round(summary.distanceMeters)} m`,
    duration: `${Math.round(summary.durationSeconds)} s`,
    stops: summary.stops.map((stop) => stop.name).join(' → '),
  }
}
