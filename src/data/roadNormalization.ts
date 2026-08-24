import type { CampusData, CanonicalCampusData, Road } from './campusData'
import { buildRoadNetwork, type RoadNetwork, type RoadNode } from './roadNetwork'

export type RoadSourceKind = 'graph' | 'road' | 'canal'

export interface CanonicalRoad extends Road {
  /** All source road IDs represented by this one editable/display geometry. */
  sourceIds: string[]
  /** Graph-only provenance retained for routing/debug, never rendered as a second road. */
  routing?: { sourceIds: string[] }
}

const POINT_PRECISION = 1
const OVERLAP_TOLERANCE = 0.5

function pointKey([x, z]: [number, number]): string {
  return `${x.toFixed(POINT_PRECISION)},${z.toFixed(POINT_PRECISION)}`
}

function geometryKey(points: [number, number][]): string {
  const forward = points.map(pointKey).join(';')
  const reverse = [...points].reverse().map(pointKey).join(';')
  return forward < reverse ? forward : reverse
}

function pointSegmentDistance(point: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return Math.hypot(point[0] - a[0], point[1] - a[1])
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared))
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz))
}

function nearestDistance(point: [number, number], points: [number, number][]): number {
  let result = Infinity
  for (let i = 1; i < points.length; i++) result = Math.min(result, pointSegmentDistance(point, points[i - 1], points[i]))
  return result
}

function bounds(points: [number, number][]): [number, number, number, number] {
  return [Math.min(...points.map(([x]) => x)), Math.max(...points.map(([x]) => x)), Math.min(...points.map(([, z]) => z)), Math.max(...points.map(([, z]) => z))]
}

function overlaps(a: [number, number][], b: [number, number][]): boolean {
  if (geometryKey(a) === geometryKey(b)) return true
  const [aminX, amaxX, aminZ, amaxZ] = bounds(a)
  const [bminX, bmaxX, bminZ, bmaxZ] = bounds(b)
  if (amaxX < bminX - OVERLAP_TOLERANCE || bmaxX < aminX - OVERLAP_TOLERANCE || amaxZ < bminZ - OVERLAP_TOLERANCE || bmaxZ < aminZ - OVERLAP_TOLERANCE) return false
  const aMatched = a.filter((point) => nearestDistance(point, b) <= OVERLAP_TOLERANCE).length / a.length
  const bMatched = b.filter((point) => nearestDistance(point, a) <= OVERLAP_TOLERANCE).length / b.length
  return aMatched >= 0.6 || bMatched >= 0.6
}

function sourceKind(road: Pick<Road, 'id' | 'kind'>): RoadSourceKind {
  if (road.kind) return road.kind
  const id = road.id.toLowerCase()
  if (id.includes('canal') || id.includes('waterway')) return 'canal'
  if (id.startsWith('graph-') || id.includes('graph-road')) return 'graph'
  return 'road'
}

function compatibleKinds(a: RoadSourceKind, b: RoadSourceKind): boolean {
  if (a === 'canal' || b === 'canal') return a === b
  return true
}

function preferred(a: Road, b: Road): Road {
  const aKind = sourceKind(a)
  const bKind = sourceKind(b)
  if (aKind === 'road' && bKind === 'graph') return a
  if (bKind === 'road' && aKind === 'graph') return b
  return a.id.localeCompare(b.id) <= 0 ? a : b
}

/** Normalize legacy graph/OSM records to one canonical geometry per logical road. */
export function normalizeRoads(roads: Road[]): CanonicalRoad[] {
  const groups: Array<{ members: Road[]; representative: Road }> = []
  const ordered = [...roads].filter((road) => road.points.length >= 2).sort((a, b) => a.id.localeCompare(b.id))

  for (const road of ordered) {
    const group = groups.find((candidate) => compatibleKinds(sourceKind(candidate.representative), sourceKind(road)) && candidate.members.some((member) => overlaps(member.points, road.points)))
    if (group) {
      group.members.push(road)
      group.representative = preferred(group.representative, road)
    } else {
      groups.push({ members: [road], representative: road })
    }
  }

  return groups.map(({ members, representative }) => {
    const kind = sourceKind(representative)
    const sourceIds = [...new Set(members.flatMap((road) => road.sourceIds ?? [road.id]))].sort()
    const graphSourceIds = [...new Set(members.flatMap((road) => road.routing?.sourceIds ?? (sourceKind(road) === 'graph' ? road.sourceIds ?? [road.id] : [])))].sort()
    const canonical: CanonicalRoad = {
      ...representative,
      id: representative.id,
      kind,
      sourceIds,
      ...(graphSourceIds.length ? { routing: { sourceIds: graphSourceIds } } : {}),
    }
    return canonical
  })
}

/** Clone and normalize a campus without mutating caller-owned data. */
export function normalizeCampusData(data: CampusData): CanonicalCampusData {
  const clone = JSON.parse(JSON.stringify(data)) as CampusData
  const roads = normalizeRoads(clone.roads)
  const roadNetwork = buildRoadNetwork(roads)
  const previousNetwork = clone.roadNetwork && Array.isArray(clone.roadNetwork.nodes) && Array.isArray(clone.roadNetwork.segments) ? clone.roadNetwork : undefined
  preserveRoadNodeIds(previousNetwork, roadNetwork)
  return {
    ...clone,
    roads,
    roadNetwork,
  } as CanonicalCampusData
}

function preserveRoadNodeIds(previous: RoadNetwork | undefined, next: RoadNetwork): void {
  if (!previous) return
  const temporaryIds = new Map<RoadNode, string>()
  const originalToTemporary = new Map<string, string>()
  next.nodes.forEach((node, index) => {
    const temporaryId = `__generated-node-${index}`
    originalToTemporary.set(node.id, temporaryId)
    temporaryIds.set(node, temporaryId)
    node.id = temporaryId
  })
  next.segments.forEach((segment) => {
    segment.from = originalToTemporary.get(segment.from) ?? segment.from
    segment.to = originalToTemporary.get(segment.to) ?? segment.to
  })
  const unused = new Set(previous.nodes.map((node) => node.id))
  const assignments = new Map<string, string>()
  for (const node of next.nodes) {
    const temporaryId = temporaryIds.get(node)!
    const sourceKey = [...(node.sourceIds ?? [])].sort().join('|')
    const candidates = previous.nodes.filter((candidate) => {
      if (!unused.has(candidate.id)) return false
      const candidateKey = [...(candidate.sourceIds ?? [])].sort().join('|')
      return sourceKey && candidateKey === sourceKey
    })
    const nearestBySource = candidates.sort((a, b) => {
      const da = Math.hypot(a.position[0] - node.position[0], a.position[1] - node.position[1])
      const db = Math.hypot(b.position[0] - node.position[0], b.position[1] - node.position[1])
      return da - db
    })[0]
    const nearestByPosition = previous.nodes
      .filter((candidate) => unused.has(candidate.id))
      .sort((a, b) => {
        const da = Math.hypot(a.position[0] - node.position[0], a.position[1] - node.position[1])
        const db = Math.hypot(b.position[0] - node.position[0], b.position[1] - node.position[1])
        return da - db
      })[0]
    const nearest = nearestBySource ?? (nearestByPosition && Math.hypot(nearestByPosition.position[0] - node.position[0], nearestByPosition.position[1] - node.position[1]) <= 1e-4 ? nearestByPosition : undefined)
    if (!nearest) continue
    assignments.set(temporaryId, nearest.id)
    if (nearest.kind === 'entrance' || nearest.kind === 'poi-anchor') node.kind = nearest.kind
    unused.delete(nearest.id)
  }
  const used = new Set(assignments.values())
  let generated = 1
  for (const node of next.nodes) {
    const temporaryId = temporaryIds.get(node)!
    if (!assignments.has(temporaryId)) {
      let id = `node-${String(generated).padStart(4, '0')}`
      while (used.has(id)) {
        generated += 1
        id = `node-${String(generated).padStart(4, '0')}`
      }
      assignments.set(temporaryId, id)
      used.add(id)
      generated += 1
    }
    node.id = assignments.get(temporaryId)!
  }
  next.segments.forEach((segment) => {
    segment.from = assignments.get(segment.from) ?? segment.from
    segment.to = assignments.get(segment.to) ?? segment.to
  })
}

/** Validate that the persisted topology still describes the editable roads. */
export function validateRoadTopologyConsistency(roads: Road[], network: RoadNetwork, tolerance = 1): string[] {
  const errors: string[] = []
  const sourceIds = new Set<string>()
  roads.forEach((road) => {
    sourceIds.add(road.id)
    ;(road.sourceIds ?? []).forEach((id) => sourceIds.add(id))
    ;(road.routing?.sourceIds ?? []).forEach((id) => sourceIds.add(id))
  })
  const nodes = new Map(network.nodes.map((node) => [node.id, node]))
  const referencedSources = new Set<string>()
  for (const node of network.nodes) {
    for (const sourceId of node.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) errors.push(`道路节点 ${node.id} 引用了不存在的源道路 ${sourceId}`)
      referencedSources.add(sourceId)
    }
  }
  for (const segment of network.segments) {
    for (const sourceId of segment.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) errors.push(`道路段 ${segment.id} 引用了不存在的源道路 ${sourceId}`)
      referencedSources.add(sourceId)
    }
    const from = nodes.get(segment.from)
    const to = nodes.get(segment.to)
    if (!from || !to || segment.centerline.length < 2) continue
    const start = segment.centerline[0]
    const end = segment.centerline[segment.centerline.length - 1]
    if (Math.hypot(start[0] - from.position[0], start[1] - from.position[1]) > tolerance) errors.push(`道路段 ${segment.id} 起点与节点 ${segment.from} 不一致`)
    if (Math.hypot(end[0] - to.position[0], end[1] - to.position[1]) > tolerance) errors.push(`道路段 ${segment.id} 终点与节点 ${segment.to} 不一致`)
  }
  roads.forEach((road) => {
    const represented = (road.sourceIds ?? [road.id]).some((id) => referencedSources.has(id))
    if (!represented && road.points.length >= 2) errors.push(`道路 ${road.id} 没有对应的 roadNetwork 道路段`)
  })
  return [...new Set(errors)]
}

/** Rebuild the canonical topology after an editor mutation to legacy road geometry. */
export function syncRoadNetwork(data: CampusData): void {
  const previous = data.roadNetwork
  const next = buildRoadNetwork(data.roads)
  preserveRoadNodeIds(previous, next)
  data.roadNetwork = next
}
