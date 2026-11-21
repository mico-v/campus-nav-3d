/**
 * M5-C 路线聚合层：在 findShortestPath 之上补齐校验与错误结果。
 * 这里不改寻路算法，只负责同点 / 无节点 / 不连通 / 非法坐标的判定，
 * 以及按出行模式选择路网通行权与速度。
 */
import type { CampusData } from '../data/campusData'
import type { RoadNetwork } from '../data/roadNetwork'
import { findShortestPath } from './pathfinding'
import type { NavigationMode, NavigationResult } from './types'

/** 成人步行速度：场景坐标 1 单位 = 1 米，1.4 m/s ≈ 5 km/h。 */
export const WALKING_SPEED_METERS_PER_SECOND = 1.4

/** 同一路段上三档模式的预计用时必须可比较：car < bike < walk。 */
export const MODE_SPEED_METERS_PER_SECOND: Record<NavigationMode, number> = {
  pedestrian: WALKING_SPEED_METERS_PER_SECOND,
  bicycle: 4,
  vehicle: 8,
}

export const NAVIGATION_MODES: readonly NavigationMode[] = ['pedestrian', 'bicycle', 'vehicle']

export function isNavigationMode(value: unknown): value is NavigationMode {
  return value === 'pedestrian' || value === 'bicycle' || value === 'vehicle'
}

/** 错误码稳定，文案给 UI 直接展示。 */
export type RouteErrorCode = 'same-point' | 'no-node' | 'unreachable' | 'invalid-position'

export interface RouteError {
  code: RouteErrorCode
  message: string
}

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
  mode: NavigationMode
}

export interface RouteResult {
  /** 有 route 就一定能渲染；error 有值时 route 恒为 null。 */
  route: RouteSummary | null
  error: RouteError | null
}

/** 建筑锚点 = 其轮廓（或中心）最近的路网节点；没有节点返回 null。 */
export function buildingAnchorId(data: CampusData, buildingIndex: number): string | null {
  const building = data.buildings[buildingIndex]
  const network = data.roadNetwork
  if (!building || !network?.nodes.length) return null
  const candidates: [number, number][] = building.footprint?.length
    ? building.footprint.map(([x, z]) => [x, z])
    : [building.position]
  if (candidates.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) return null
  let bestId: string | null = null
  let best = Infinity
  for (const node of network.nodes) {
    if (!Number.isFinite(node.position[0]) || !Number.isFinite(node.position[1])) continue
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

function routeError(code: RouteErrorCode, message: string): RouteResult {
  return { route: null, error: { code, message } }
}

/** 写死的路网坐标不允许 NaN / Infinity / 越界，避免坏数据进渲染。 */
function validPosition(data: CampusData, index: number): boolean {
  const building = data.buildings[index]
  if (!building) return false
  const [x, z] = building.position
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false
  const limit = Math.max(data.bounds?.width ?? 0, data.bounds?.depth ?? 0) * 4
  if (limit > 0 && (Math.abs(x) > limit || Math.abs(z) > limit)) return false
  return building.footprint?.every(([px, pz]) => Number.isFinite(px) && Number.isFinite(pz)) ?? true
}

/** 按建筑 id / 索引取导航端点；id 不存在时返回 -1，交给上层给提示。 */
export function resolveBuildingIndex(data: CampusData, ref: number | string | null | undefined): number | null {
  if (ref === null || ref === undefined || ref === '') return null
  if (typeof ref === 'number') return data.buildings[ref] ? ref : null
  const index = data.buildings.findIndex((building) => building.id === ref)
  return index >= 0 ? index : null
}

/** 纯聚合入口：任何非法输入都返回 error，不抛异常、不给半条路线。 */
export function planRoute(
  data: CampusData,
  originIndex: number,
  destinationIndex: number,
  options: { mode?: NavigationMode } = {},
): RouteResult {
  const mode: NavigationMode = isNavigationMode(options.mode) ? options.mode : 'pedestrian'
  if (!validPosition(data, originIndex) || !validPosition(data, destinationIndex)) {
    return routeError('invalid-position', '起点或终点坐标无效，没有可通行的路线')
  }
  if (originIndex === destinationIndex) {
    return routeError('same-point', '起点和终点相同，请选择两栋不同的建筑')
  }
  const network = data.roadNetwork
  if (!network || !network.nodes.length || !network.segments.length) {
    return routeError('no-node', '这片区域没有可用的路网节点，暂时无法规划路线')
  }
  const originId = buildingAnchorId(data, originIndex)
  const destinationId = buildingAnchorId(data, destinationIndex)
  if (!originId || !destinationId) {
    return routeError('no-node', '这两栋建筑没有接入路网的节点，暂时不可达')
  }
  let result: NavigationResult | null
  try {
    result = findShortestPath(network, {
      originNodeId: originId,
      destinationNodeId: destinationId,
      mode,
    }, { mode, speedMetersPerSecond: MODE_SPEED_METERS_PER_SECOND[mode] })
  } catch {
    return routeError('unreachable', '这两栋建筑之间不可达，请换一个终点')
  }
  if (!result || result.nodePath.length < 2 || !result.geometry.length) {
    return routeError('unreachable', '这两栋建筑之间不可达，请换一个终点')
  }
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
    route: {
      distanceMeters: result.distance,
      durationSeconds: result.duration,
      stops,
      geometry: result.geometry,
      segmentIds: result.segmentPath,
      rawNodePath: path,
      mode,
    },
    error: null,
  }
}

/** M5-B 兼容入口：成功时返回摘要，失败（含同点）统一返回 null。 */
export function planRouteBetweenBuildings(
  data: CampusData,
  originIndex: number,
  destinationIndex: number,
  options: { mode?: NavigationMode; speedMetersPerSecond?: number } = {},
): RouteSummary | null {
  const result = planRoute(data, originIndex, destinationIndex, options)
  return result.route
}

/** 摘要卡展示用：模式 + 米 + 秒，保留整数，避免浮点尾巴噪声。 */
export function formatRouteSummary(summary: RouteSummary): { distance: string; duration: string; stops: string; mode: string } {
  return {
    distance: `${Math.round(summary.distanceMeters)} m`,
    duration: `${Math.round(summary.durationSeconds)} s`,
    stops: summary.stops.map((stop) => stop.name).join(' → '),
    mode: NAVIGATION_MODE_LABELS[summary.mode],
  }
}

export const NAVIGATION_MODE_LABELS: Record<NavigationMode, string> = {
  pedestrian: '步行',
  bicycle: '骑行',
  vehicle: '车行',
}
