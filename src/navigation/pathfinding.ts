import type { RoadNode, RoadSegment } from '../data/roadNetwork'
import type { NavigationMode, NavigationOptions, NavigationPoint, NavigationRequest, NavigationResult, NodeNavigationRequest, PointNavigationRequest, RoutableNetwork } from './types'

interface Edge {
  segment: RoadSegment
  from: string
  to: string
  centerline: [number, number][]
  distance: number
}

interface Projection {
  segment: RoadSegment
  point: [number, number]
  distance: number
  along: number
}

interface RuntimePoint {
  nodeId: string
  requested: [number, number]
  snapped: [number, number]
  snapDistance: number
}

interface RuntimeGraph {
  nodes: Map<string, RoadNode>
  edges: Map<string, Edge[]>
  origin: RuntimePoint
  destination: RuntimePoint
}

function lineDistance(points: [number, number][]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
  return total
}

function canUse(segment: RoadSegment, mode: NavigationMode): boolean {
  if (!mode) return true
  return segment.access[mode]
}

function speedFor(segment: RoadSegment, options: NavigationOptions): number {
  if (segment.speed && segment.speed > 0) return segment.speed
  if (options.speedMetersPerSecond && options.speedMetersPerSecond > 0) return options.speedMetersPerSecond
  if (options.mode === 'vehicle') return 8
  if (options.mode === 'bicycle') return 4
  return 1.4
}

function addEdge(edges: Map<string, Edge[]>, edge: Edge): void {
  const list = edges.get(edge.from) ?? []
  list.push(edge)
  edges.set(edge.from, list)
}

function addIfDistinct(points: [number, number][], point: [number, number]): void {
  const previous = points[points.length - 1]
  if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point)
}

function polylineLength(points: [number, number][]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
  return total
}

function buildEdges(network: RoutableNetwork, mode: NavigationMode, breakpoints: Map<string, Array<{ along: number; nodeId: string; point: [number, number] }>> = new Map()): Map<string, Edge[]> {
  const edges = new Map<string, Edge[]>()
  for (const segment of network.segments) {
    if (!canUse(segment, mode)) continue
    const length = lineDistance(segment.centerline)
    const markers = [
      { along: 0, nodeId: segment.from, point: segment.centerline[0] },
      ...(breakpoints.get(segment.id) ?? []),
      { along: length, nodeId: segment.to, point: segment.centerline[segment.centerline.length - 1] },
    ].sort((a, b) => a.along - b.along)
    for (let markerIndex = 1; markerIndex < markers.length; markerIndex += 1) {
      const from = markers[markerIndex - 1]
      const to = markers[markerIndex]
      if (from.nodeId === to.nodeId || to.along - from.along <= 1e-8) continue
      const centerline: [number, number][] = []
      addIfDistinct(centerline, [from.point[0], from.point[1]])
      let accumulated = 0
      for (let pointIndex = 1; pointIndex < segment.centerline.length; pointIndex += 1) {
        const start = segment.centerline[pointIndex - 1]
        const end = segment.centerline[pointIndex]
        const partLength = Math.hypot(end[0] - start[0], end[1] - start[1])
        const nextAccumulated = accumulated + partLength
        if (nextAccumulated > from.along + 1e-8 && nextAccumulated < to.along - 1e-8) addIfDistinct(centerline, [end[0], end[1]])
        accumulated = nextAccumulated
      }
      addIfDistinct(centerline, [to.point[0], to.point[1]])
      const distance = polylineLength(centerline)
      if (!distance) continue
      addEdge(edges, { segment, from: from.nodeId, to: to.nodeId, centerline, distance })
      if (!segment.oneWay) addEdge(edges, { segment, from: to.nodeId, to: from.nodeId, centerline: [...centerline].reverse(), distance })
    }
  }
  return edges
}

function reconstruct(cameFrom: Map<string, { nodeId: string; edge: Edge }>, start: string, end: string): { nodePath: string[]; edges: Edge[] } {
  const nodePath = [end]
  const edges: Edge[] = []
  let current = end
  while (current !== start) {
    const previous = cameFrom.get(current)
    if (!previous) return { nodePath: [], edges: [] }
    edges.push(previous.edge)
    current = previous.nodeId
    nodePath.push(current)
  }
  nodePath.reverse()
  edges.reverse()
  return { nodePath, edges }
}

function heuristic(nodes: Map<string, RoadNode>, a: string, b: string): number {
  const from = nodes.get(a)?.position
  const to = nodes.get(b)?.position
  return from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0
}

function mergeGeometry(edges: Edge[], startNodeId: string, nodes: Map<string, RoadNode>): [number, number][] {
  const geometry: [number, number][] = []
  for (const edge of edges) {
    const points = edge.centerline
    if (!geometry.length) geometry.push(...points.map(([x, z]) => [x, z] as [number, number]))
    else geometry.push(...points.slice(1).map(([x, z]) => [x, z] as [number, number]))
  }
  if (!geometry.length) {
    const point = nodes.get(startNodeId)?.position
    if (point) geometry.push([point[0], point[1]])
  }
  return geometry
}

function makeInstructions(edges: Edge[]): string[] {
  if (!edges.length) return []
  const instructions: string[] = [`沿道路段 ${edges[0].segment.id} 出发`]
  for (let index = 1; index < edges.length; index += 1) {
    const previous = edges[index - 1]
    const current = edges[index]
    const previousPoints = previous.centerline
    const currentPoints = current.centerline
    const incoming = previousPoints[previousPoints.length - 1]
    const incomingFrom = previousPoints[Math.max(0, previousPoints.length - 2)]
    const outgoingFrom = currentPoints[0]
    const outgoing = currentPoints[Math.min(1, currentPoints.length - 1)]
    const inX = incoming[0] - incomingFrom[0]
    const inZ = incoming[1] - incomingFrom[1]
    const outX = outgoing[0] - outgoingFrom[0]
    const outZ = outgoing[1] - outgoingFrom[1]
    const cross = inX * outZ - inZ * outX
    const dot = inX * outX + inZ * outZ
    const angle = Math.atan2(cross, dot) * 180 / Math.PI
    const turn = Math.abs(angle) < 25 ? '继续直行' : Math.abs(angle) > 150 ? '掉头' : angle > 0 ? '左转' : '右转'
    instructions.push(`${turn}进入道路段 ${current.segment.id}`)
  }
  instructions[instructions.length - 1] += '，到达目的地'
  return instructions
}

function projectPoint(point: [number, number], segment: RoadSegment): Projection {
  let bestDistance = Infinity
  let bestPoint: [number, number] = segment.centerline[0]
  let bestAlong = 0
  let along = 0
  for (let index = 1; index < segment.centerline.length; index += 1) {
    const start = segment.centerline[index - 1]
    const end = segment.centerline[index]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const lengthSquared = dx * dx + dz * dz
    const length = Math.sqrt(lengthSquared)
    const t = lengthSquared > 1e-12 ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared)) : 0
    const projected: [number, number] = [start[0] + dx * t, start[1] + dz * t]
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
    if (distance < bestDistance) {
      bestDistance = distance
      bestPoint = projected
      bestAlong = along + length * t
    }
    along += length
  }
  return { segment, point: [bestPoint[0], bestPoint[1]], distance: bestDistance, along: bestAlong }
}

function nearestProjection(network: RoutableNetwork, point: NavigationPoint, mode: NavigationMode): Projection | null {
  let best: Projection | null = null
  for (const segment of network.segments) {
    if (!canUse(segment, mode) || segment.centerline.length < 2) continue
    const projection = projectPoint(point.position, segment)
    if (!best || projection.distance < best.distance) best = projection
  }
  if (!best) return null
  if (point.maxSnapDistance !== undefined && (point.maxSnapDistance < 0 || best.distance > point.maxSnapDistance)) return null
  return best
}

function runtimeNodeId(label: 'origin' | 'destination'): string {
  return `__runtime-${label}`
}

function createRuntimeGraph(network: RoutableNetwork, request: PointNavigationRequest, mode: NavigationMode): RuntimeGraph | null {
  const nodes = new Map(network.nodes.map((node) => [node.id, { ...node, position: [node.position[0], node.position[1]] as [number, number] }]))
  const originProjection = nearestProjection(network, request.origin, mode)
  const destinationProjection = nearestProjection(network, request.destination, mode)
  if (!originProjection || !destinationProjection) return null
  const breakpoints = new Map<string, Array<{ along: number; nodeId: string; point: [number, number] }>>()
  const addRuntimePoint = (label: 'origin' | 'destination', projection: Projection, requested: NavigationPoint): RuntimePoint => {
    const endpoint = projection.along <= 1e-7 ? projection.segment.from : projection.along >= lineDistance(projection.segment.centerline) - 1e-7 ? projection.segment.to : runtimeNodeId(label)
    const existing = nodes.get(endpoint)
    if (!existing) nodes.set(endpoint, { id: endpoint, position: [projection.point[0], projection.point[1]], kind: 'waypoint' })
    if (endpoint.startsWith('__runtime-')) {
      const points = breakpoints.get(projection.segment.id) ?? []
      points.push({ along: projection.along, nodeId: endpoint, point: projection.point })
      breakpoints.set(projection.segment.id, points)
    }
    return { nodeId: endpoint, requested: [requested.position[0], requested.position[1]], snapped: projection.point, snapDistance: projection.distance }
  }
  const origin = addRuntimePoint('origin', originProjection, request.origin)
  const destination = origin.nodeId === runtimeNodeId('origin') && destinationProjection.segment.id === originProjection.segment.id && Math.abs(destinationProjection.along - originProjection.along) <= 1e-7
    ? { ...addRuntimePoint('destination', destinationProjection, request.destination), nodeId: origin.nodeId }
    : addRuntimePoint('destination', destinationProjection, request.destination)
  const edges = buildEdges({ nodes: [...nodes.values()], segments: network.segments }, mode, breakpoints)
  return { nodes, edges, origin, destination }
}

function isPointRequest(request: NavigationRequest): request is PointNavigationRequest {
  return 'origin' in request && 'destination' in request
}

function routeFromGraph(request: NodeNavigationRequest, options: NavigationOptions, nodes: Map<string, RoadNode>, edges: Map<string, Edge[]>, extra: Partial<NavigationResult> = {}): NavigationResult | null {
  const mode = options.mode ?? 'pedestrian'
  if (!nodes.has(request.originNodeId) || !nodes.has(request.destinationNodeId)) return null
  if (request.originNodeId === request.destinationNodeId) {
    const position = nodes.get(request.originNodeId)!.position
    return { originNodeId: request.originNodeId, destinationNodeId: request.destinationNodeId, mode, nodePath: [request.originNodeId], segmentPath: [], geometry: [[position[0], position[1]]], distance: 0, duration: 0, instructions: [], ...extra }
  }
  const open = new Set([request.originNodeId])
  const gScore = new Map([[request.originNodeId, 0]])
  const fScore = new Map([[request.originNodeId, heuristic(nodes, request.originNodeId, request.destinationNodeId)]])
  const cameFrom = new Map<string, { nodeId: string; edge: Edge }>()

  while (open.size) {
    const current = [...open].sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity))[0]
    if (current === request.destinationNodeId) {
      const path = reconstruct(cameFrom, request.originNodeId, current)
      const distance = path.edges.reduce((sum, edge) => sum + edge.distance, 0)
      const duration = path.edges.reduce((sum, edge) => sum + edge.distance / speedFor(edge.segment, options), 0)
      return {
        originNodeId: request.originNodeId,
        destinationNodeId: request.destinationNodeId,
        mode,
        nodePath: path.nodePath,
        segmentPath: path.edges.map((edge) => edge.segment.id),
        geometry: mergeGeometry(path.edges, request.originNodeId, nodes),
        distance,
        duration,
        instructions: makeInstructions(path.edges),
        ...extra,
      }
    }
    open.delete(current)
    for (const edge of edges.get(current) ?? []) {
      const tentative = (gScore.get(current) ?? Infinity) + edge.distance
      if (tentative >= (gScore.get(edge.to) ?? Infinity)) continue
      cameFrom.set(edge.to, { nodeId: current, edge })
      gScore.set(edge.to, tentative)
      fScore.set(edge.to, tentative + heuristic(nodes, edge.to, request.destinationNodeId))
      open.add(edge.to)
    }
  }
  return null
}

/** A* over explicit road nodes; the returned route is runtime-only. */
export function findShortestPath(network: RoutableNetwork, request: NavigationRequest, options: NavigationOptions = {}): NavigationResult | null {
  const mode = request.mode ?? options.mode ?? 'pedestrian'
  if (isPointRequest(request)) {
    const runtime = createRuntimeGraph(network, request, mode)
    if (!runtime) return null
    const route = routeFromGraph({ originNodeId: runtime.origin.nodeId, destinationNodeId: runtime.destination.nodeId }, { ...options, mode }, runtime.nodes, runtime.edges)
    if (!route) return null
    const originSnap = runtime.origin.snapped
    const destinationSnap = runtime.destination.snapped
    const geometry: [number, number][] = []
    addIfDistinct(geometry, runtime.origin.requested)
    route.geometry.forEach((point) => addIfDistinct(geometry, point))
    addIfDistinct(geometry, destinationSnap)
    addIfDistinct(geometry, runtime.destination.requested)
    const accessSpeed = options.speedMetersPerSecond && options.speedMetersPerSecond > 0
      ? options.speedMetersPerSecond
      : mode === 'vehicle' ? 8 : mode === 'bicycle' ? 4 : 1.4
    const accessDistance = runtime.origin.snapDistance + runtime.destination.snapDistance
    return {
      ...route,
      geometry,
      distance: route.distance + accessDistance,
      duration: route.duration + accessDistance / accessSpeed,
      originPosition: runtime.origin.requested,
      destinationPosition: runtime.destination.requested,
      snappedOrigin: originSnap,
      snappedDestination: destinationSnap,
      originSnapDistance: runtime.origin.snapDistance,
      destinationSnapDistance: runtime.destination.snapDistance,
    }
  }
  const nodes = new Map(network.nodes.map((node) => [node.id, node]))
  return routeFromGraph(request, { ...options, mode }, nodes, buildEdges(network, mode))
}

/** Convenience name for callers that work with map coordinates rather than node IDs. */
export function findShortestPathBetweenPoints(network: RoutableNetwork, request: PointNavigationRequest, options: NavigationOptions = {}): NavigationResult | null {
  return findShortestPath(network, request, options)
}
