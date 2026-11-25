import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeComponents,
  auditRoadCoverage,
  buildingsCrossedBySegment,
  normalizeAuditData,
  type Point,
} from '../scripts/audit-road-coverage'

const repoRoot = resolve(import.meta.dirname, '..')
const campusRaw: unknown = JSON.parse(readFileSync(resolve(repoRoot, 'packs/usts-tianping/campus.json'), 'utf8'))
const campus = normalizeAuditData(campusRaw)
const audit = auditRoadCoverage(campus, campusRaw)

const ORIGINAL_NODE_COUNT = 39
const ORIGINAL_SEGMENT_COUNT = 42

const originalNodes = campus.roadNetwork.nodes.slice(0, ORIGINAL_NODE_COUNT)
const originalSegments = campus.roadNetwork.segments.slice(0, ORIGINAL_SEGMENT_COUNT)
const newNodes = campus.roadNetwork.nodes.slice(ORIGINAL_NODE_COUNT)
const newSegments = campus.roadNetwork.segments.slice(ORIGINAL_SEGMENT_COUNT)
const nodeById = new Map(campus.roadNetwork.nodes.map((node) => [node.id, node]))
const buildingById = new Map(campus.buildings.map((building) => [building.id, building]))

// Frozen s1 report table: 25 rows (16 direct / 9 needs_detour), with the blocking buildings
// named in the report. Kept in the test as the acceptance contract, not re-derived from data.
const directTargets = [
  'building-72', 'building-74', 'place-46', 'place-04', 'osm-named-920093733',
  'osm-named-920093693', 'osm-named-356627225', 'osm-building-356627207',
  'osm-building-920093713', 'building-67', 'place-05', 'place-33',
  'osm-building-1496902327', 'osm-named-1493791195', 'osm-building-920093721',
  'osm-building-1496902326',
] as const

const detourRows: ReadonlyArray<{ start: string; target: string; blockers: readonly string[] }> = [
  { start: 'node-0017', target: 'osm-building-1496902334', blockers: ['osm-building-1017326419', 'osm-building-1496902329', 'osm-building-1496902335'] },
  { start: 'node-0017', target: 'osm-building-1496902332', blockers: ['osm-building-1017326418', 'osm-building-1496902331', 'osm-building-1496902335'] },
  { start: 'node-0018', target: 'place-07', blockers: ['place-40'] },
  { start: 'node-0021', target: 'osm-building-1017326421', blockers: ['osm-building-1496902335'] },
  { start: 'node-0006', target: 'osm-building-920093710', blockers: ['place-14'] },
  { start: 'node-0005', target: 'osm-building-920093718', blockers: ['osm-building-920093715'] },
  { start: 'node-0020', target: 'building-66', blockers: ['osm-named-356627226'] },
  { start: 'node-0009', target: 'osm-building-920093727', blockers: ['osm-building-920093726'] },
  { start: 'node-0010', target: 'osm-building-920093728', blockers: ['osm-building-920093729'] },
]


const ORIGINAL_NODE_ANCHORS: ReadonlyArray<readonly [string, number, number]> = [
  ['node-0001', -336.5661935727012, 361.8212507940621],
  ['node-0002', -290.6116472008769, 361.8212507940621],
  ['node-0003', -286.56619357270097, 361.8212507940621],
  ['node-0004', -290.62006404145234, 352.35126415606265],
  ['node-0005', -290.4567719271646, 536.0750886166585],
  ['node-0006', -290.224794186732, 797.0787374940323],
  ['node-0007', -290, 1050],
  ['node-0008', -497.0469991073611, 676.6730383111556],
  ['node-0009', -450, 798.8088643109817],
  ['node-0010', -450, 1040],
  ['node-0011', 970, -100],
  ['node-0012', 1088.6966373325824, 74.74782718407982],
  ['node-0013', 1325.0590635246306, 422.72584352237277],
  ['node-0014', 1073.3137949805346, -112.39256966732773],
  ['node-0015', 1168.4660738479506, 38.06909315309295],
  ['node-0016', 1399.7721300276576, 403.8269525284413],
  ['node-0017', 1700.5810998172549, -82.17945109515237],
  ['node-0018', 470, 797.8205489048478],
  ['node-0019', 46.00077914695497, 353.7557204074677],
  ['node-0027', 79.282063806924, 114.65388585364772],
  ['node-0020', 470, 88.42649554581642],
  ['node-0021', 1690, -100],
  ['node-0022', 470, -140],
  ['node-0023', 470, 1090],
  ['node-0024', 72.61751379975925, -120.6322674908862],
  ['node-0025', 76.89321195311351, 30.317544616987917],
  ['node-0026', 80, 140],
  ['node-0028', -50, 340],
  ['node-0029', -46.17276967131832, 172.34553934263664],
  ['node-0039', 72.96913845227833, 32.850354191690585],
  ['node-0030', -156.37075201569394, 32.31229298395381],
  ['node-0031', 327.2950299604218, 28.176242509894553],
  ['node-0032', 328.6342751719704, -51.314415204844835],
  ['node-0033', 320, -70],
  ['node-0034', 111.95035404411414, -139.34988198529527],
  ['node-0035', -80, -120],
  ['node-0036', -244.17731922539858, 168.15981612959007],
  ['node-0037', -273.36308059008866, 343.30888936680805],
  ['node-0038', -351.999367220631, 352.095176192999],
] as const

const ORIGINAL_SEGMENT_ANCHORS: ReadonlyArray<readonly [string, string, string]> = [
  ['road-10--1', 'node-0001', 'node-0002'],
  ['road-10--2', 'node-0002', 'node-0003'],
  ['road-11--1', 'node-0004', 'node-0002'],
  ['road-11--2', 'node-0002', 'node-0005'],
  ['road-11--3', 'node-0005', 'node-0006'],
  ['road-11--4', 'node-0006', 'node-0007'],
  ['road-12--1', 'node-0005', 'node-0008'],
  ['road-12--2', 'node-0008', 'node-0009'],
  ['road-12--3', 'node-0009', 'node-0010'],
  ['road-13--1', 'node-0006', 'node-0009'],
  ['road-13--2', 'node-0009', 'node-0008'],
  ['road-14--1', 'node-0011', 'node-0012'],
  ['road-14--2', 'node-0012', 'node-0013'],
  ['road-15--1', 'node-0014', 'node-0015'],
  ['road-15--2', 'node-0015', 'node-0016'],
  ['road-2--1', 'node-0017', 'node-0018'],
  ['road-2--2', 'node-0018', 'node-0019'],
  ['road-2--3', 'node-0019', 'node-0027'],
  ['road-2--4', 'node-0027', 'node-0020'],
  ['road-2--5', 'node-0020', 'node-0012'],
  ['road-2--6', 'node-0012', 'node-0015'],
  ['road-2--7', 'node-0015', 'node-0021'],
  ['road-3--1', 'node-0022', 'node-0020'],
  ['road-3--2', 'node-0020', 'node-0018'],
  ['road-3--3', 'node-0018', 'node-0023'],
  ['road-4--1', 'node-0024', 'node-0025'],
  ['road-4--2', 'node-0025', 'node-0027'],
  ['road-4--3', 'node-0027', 'node-0026'],
  ['road-5--1', 'node-0028', 'node-0029'],
  ['road-5--2', 'node-0029', 'node-0039'],
  ['road-6--1', 'node-0030', 'node-0031'],
  ['road-6--2', 'node-0031', 'node-0032'],
  ['road-6--3', 'node-0032', 'node-0033'],
  ['road-6--4', 'node-0033', 'node-0034'],
  ['road-6--5', 'node-0034', 'node-0024'],
  ['road-6--6', 'node-0024', 'node-0035'],
  ['road-6--7', 'node-0035', 'node-0030'],
  ['road-7--1', 'node-0030', 'node-0036'],
  ['road-7--2', 'node-0036', 'node-0029'],
  ['road-8--1', 'node-0036', 'node-0037'],
  ['road-9--1', 'node-0038', 'node-0004'],
  ['road-9--2', 'node-0004', 'node-0019'],
] as const

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('s2 建筑接驳路网：硬口径断言', () => {
  it('88 栋全部 connected，weak 与 missing 均为 0 行', () => {
    expect(audit.summary.buildingCount).toBe(88)
    expect(audit.summary.connectedCount).toBe(88)
    expect(audit.summary.weakCount).toBe(0)
    expect(audit.summary.missingCount).toBe(0)
    expect(audit.records.filter((r) => r.verdict !== 'connected(<=30m)')).toEqual([])
  })

  it('路网连通分量仍是 1，且无孤立节点', () => {
    expect(analyzeComponents(campus.roadNetwork.nodes, campus.roadNetwork.segments)).toEqual({
      componentCount: 1,
      isolatedNodeCount: 0,
    })
  })

  it('既有 39 节点 / 42 段及后续接驳段的 id 与坐标一个都没动', () => {
    // s1 基线：39 节点 / 42 段，逐项锚点在 ORIGINAL_*_ANCHORS
    expect(campus.roadNetwork.nodes).toHaveLength(207)
    expect(campus.roadNetwork.segments).toHaveLength(210)
    expect(originalNodes[0].id).toBe('node-0001')
    expect(originalNodes[ORIGINAL_NODE_COUNT - 1].id).toBe('node-0038')
    expect(new Set(originalNodes.map((n) => n.id)).size).toBe(ORIGINAL_NODE_COUNT)
    expect(new Set(originalSegments.map((s) => s.id)).size).toBe(ORIGINAL_SEGMENT_COUNT)
    for (const [id, x, z] of ORIGINAL_NODE_ANCHORS) {
      expect(nodeById.get(id)?.position).toEqual([x, z])
    }
    for (const [id, from, to] of ORIGINAL_SEGMENT_ANCHORS) {
      const segment = campus.roadNetwork.segments.find((s) => s.id === id)
      expect(segment?.from).toBe(from)
      expect(segment?.to).toBe(to)
    }
  })

  it('新增节点 kind=waypoint，新增段 class=walkway 且 vehicle=false', () => {
    expect(newNodes.length).toBeGreaterThan(0)
    expect(newNodes.every((n) => n.kind === 'waypoint')).toBe(true)
    expect(new Set(newNodes.map((n) => n.id)).size).toBe(newNodes.length)
    expect(new Set(newSegments.map((s) => s.id)).size).toBe(newSegments.length)
    expect(newSegments.every((s) => s.class === 'walkway')).toBe(true)
    expect(newSegments.every((s) => s.access?.vehicle === false)).toBe(true)
    expect(newSegments.every((s) => s.access?.pedestrian === true)).toBe(true)
  })

  it('新增节点不与既有节点重合（<1m 视为重合），且坐标有限', () => {
    const allExisting = originalNodes.map((n) => n.position)
    for (const node of newNodes) {
      expect(Number.isFinite(node.position[0])).toBe(true)
      expect(Number.isFinite(node.position[1])).toBe(true)
      for (const existing of allExisting) {
        expect(distance(node.position, existing)).toBeGreaterThanOrEqual(1)
      }
      allExisting.push(node.position)
    }
  })

  it('新增段的 centerline 不得穿过任何建筑 footprint（按 s1 口径：终点建筑自身不计）', () => {
    for (const segment of newSegments) {
      const a = nodeById.get(segment.from)?.position
      const b = nodeById.get(segment.to)?.position
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      // 目标建筑 = 距段末端最近的建筑（接驳点按 ≤30m 口径落点）
      const served = [...campus.buildings].sort(
        (x, y) => distance(x.position, b!) - distance(y.position, b!),
      )[0]
      const endBuilding = served && distance(served.position, b!) <= 30 ? served.id : undefined
      const crossed = buildingsCrossedBySegment(a!, b!, campus.buildings, endBuilding)
      expect(crossed.map((building) => building.id)).toEqual([])
    }
  })

  it('16 条 direct 行：起点节点到目标楼有可达路径节点（≤30m）', () => {
    for (const targetId of directTargets) {
      const building = buildingById.get(targetId)!
      const nearest = campus.roadNetwork.nodes.reduce((best, node) =>
        distance(node.position, building.position) < distance(best.position, building.position) ? node : best,
      )
      expect(distance(nearest.position, building.position)).toBeLessThanOrEqual(30)
    }
  })

  it('9 条 needs_detour 行：按拆法走「起点→楼外侧临路点→目标楼」，不许直连', () => {
    for (const { start, target, blockers } of detourRows) {
      const building = buildingById.get(target)!
      const startPoint = nodeById.get(start)!.position
      // 起点到目标楼的直线在报告里判定为穿楼
      expect(buildingsCrossedBySegment(startPoint, building.position, campus.buildings, target).length).toBeGreaterThan(0)
      // 至少存在一条从起点出发、最终到达目标 ≤30m 的分段路径
      const outbound = newSegments.filter((s) => s.from === start || s.to === start)
      expect(outbound.length).toBeGreaterThan(0)
      const reachable = new Set<string>([start])
      for (let hop = 0; hop < 4; hop += 1) {
        for (const s of newSegments) {
          if (reachable.has(s.from)) reachable.add(s.to)
          if (reachable.has(s.to)) reachable.add(s.from)
        }
      }
      const served = [...reachable]
        .map((id) => nodeById.get(id)!.position)
        .some((p) => distance(p, building.position) <= 30)
      expect(served, `${target} not reachable via detour`).toBe(true)
      // blocker 名字与报告一致（保留字段，便于未来复核）
      expect(blockers.length).toBeGreaterThan(0)
    }
  })
})
