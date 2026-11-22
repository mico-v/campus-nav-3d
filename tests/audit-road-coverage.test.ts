import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  THRESHOLDS,
  analyzeComponents,
  auditRoadCoverage,
  buildBranchSuggestions,
  type Point,
  buildCsv,
  buildingsCrossedBySegment,
  footprintMinDistance,
  segmentIntersectsPolygon,
  normalizeAuditData,
  verdictForDistance,
  type RoadNetworkAuditData,
} from '../scripts/audit-road-coverage'

const repoRoot = resolve(import.meta.dirname, '..')
const campusRaw: unknown = JSON.parse(readFileSync(resolve(repoRoot, 'packs/usts-tianping/campus.json'), 'utf8'))
const campus = normalizeAuditData(campusRaw)
const result = auditRoadCoverage(campus, campusRaw)

describe('路网覆盖审计算法', () => {
  it('分档阈值固定，接受边界值且拒绝调整', () => {
    expect(THRESHOLDS).toEqual({ connectedMax: 30, weakMax: 100 })
    expect(verdictForDistance(0)).toBe('connected(<=30m)')
    expect(verdictForDistance(30)).toBe('connected(<=30m)')
    expect(verdictForDistance(30.01)).toBe('weak(30-100m)')
    expect(verdictForDistance(100)).toBe('weak(30-100m)')
    expect(verdictForDistance(100.01)).toBe('missing(>100m)')
  })

  it('无向连通分量统计包含孤立节点', () => {
    expect(analyzeComponents(campus.roadNetwork.nodes, campus.roadNetwork.segments)).toEqual({
      componentCount: 1,
      isolatedNodeCount: 0,
    })
    expect(analyzeComponents(
      [{ id: 'a', position: [0, 0] }, { id: 'b', position: [10, 0] }],
      [],
    )).toEqual({ componentCount: 2, isolatedNodeCount: 2 })
  })

  it('footprint 距离取轮廓顶点到节点的最近值，无轮廓回退到 position', () => {
    expect(footprintMinDistance([[10, 10], [1, 0]], [0, 0], [0, 0])).toBe(1)
    expect(footprintMinDistance(undefined, [3, 4], [0, 0])).toBe(5)
  })

  it('建筑 position 口径与 footprint 口径分别计算，不混用', () => {
    const gate = result.records.find((record) => record.name === '二号门')!
    expect(gate.distanceM).toBeLessThan(2)
    expect(gate.footprintMinDistanceM).toBeGreaterThan(gate.distanceM)
  })
})

describe('真实 pack 锚点', () => {
  it('集合规模与连通性与基线一致', () => {
    expect(result.summary.buildingCount).toBe(75)
    expect(result.summary.nodeCount).toBe(39)
    expect(result.summary.segmentCount).toBe(42)
    expect(result.summary.componentCount).toBe(1)
  })

  it('分档数量与极值吻合，数字不因难看被调阈值', () => {
    expect(result.summary.connectedCount).toBe(1)
    expect(result.summary.weakCount).toBe(13)
    expect(result.summary.missingCount).toBe(61)
    expect(result.summary.minDistanceM).toBeLessThan(2)
    expect(result.summary.maxDistanceM).toBeGreaterThan(600)
    expect(result.summary.maxDistanceM).toBeLessThan(610)
    expect(result.summary.maxDistanceBuilding.name).toBe('东区宿舍与服务区单体楼11')
    expect(result.summary.medianDistanceM).toBeGreaterThan(225)
    expect(result.summary.medianDistanceM).toBeLessThan(230)
  })

  it('数据质量结论与 issue 描述一致', () => {
    expect(result.quality.campusJsonHasBounds).toBe(false)
    expect(result.quality.segmentVehicleAllFalse).toBe(true)
    expect(result.quality.segmentsWithVehicleTrue).toBe(0)
    expect(result.quality.nodeKinds).toEqual(['junction', 'waypoint'])
    expect(result.quality.hasEntranceKindNode).toBe(false)
  })
})

describe('CSV 与建议支路', () => {
  it('表头固定且恰好 75 行数据', () => {
    const csv = buildCsv(result.records)
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('building_id,building_name,nearest_node_id,nearest_node_kind,distance_m,footprint_min_distance_m,verdict')
    expect(lines).toHaveLength(76)
    expect(new Set(lines.slice(1).map((line) => line.split(',')[0])).size).toBe(75)
  })

  it('每条建议支路都带起点/终点/宽度/等级/理由，且起点节点真实存在', () => {
    const suggestions = buildBranchSuggestions(result, campus.roadNetwork.nodes, campus.buildings)
    expect(suggestions.length).toBeGreaterThan(0)
    const nodeIds = new Set(campus.roadNetwork.nodes.map((node) => node.id))
    const buildingIds = new Set(campus.buildings.map((building) => building.id))
    for (const suggestion of suggestions) {
      expect(nodeIds.has(suggestion.startNodeId)).toBe(true)
      expect(buildingIds.has(suggestion.endBuildingId)).toBe(true)
      expect(suggestion.startCoordinate).toMatch(/^-?\d+\.\d, -?\d+\.\d$/)
      expect(suggestion.endCoordinate).toMatch(/^-?\d+\.\d, -?\d+\.\d$/)
      expect(suggestion.width).toBe('3.0m')
      expect(suggestion.grade).toBe('walkway')
      expect(suggestion.reason.length).toBeGreaterThan(10)
      expect(suggestion.needsDetour).toBe(suggestion.crossesBuildings.length > 0)
      if (suggestion.needsDetour) {
        expect(suggestion.detourPlan).toContain(suggestion.crossesBuildings[0])
        expect(suggestion.detourPlan).toMatch(/外侧|另一节点/)
      } else {
        expect(suggestion.crossesBuildings).toEqual([])
        expect(suggestion.detourPlan).toBe('-')
      }
    }
  })

  it('真实数据里穿楼条目单独标 needs_detour，且不因穿楼改动阈值或数据', () => {
    const suggestions = buildBranchSuggestions(result, campus.roadNetwork.nodes, campus.buildings)
    const detoured = suggestions.filter((suggestion) => suggestion.needsDetour)
    expect(detoured.length).toBeGreaterThan(0)
    for (const suggestion of detoured) {
      expect(suggestion.crossesBuildings.length).toBeGreaterThan(0)
      expect(suggestion.detourPlan).not.toBe('-')
    }
    expect(THRESHOLDS).toEqual({ connectedMax: 30, weakMax: 100 })
  })

  it('不修改输入的 campus 数据', () => {
    const before = JSON.stringify(campus)
    auditRoadCoverage(campus as RoadNetworkAuditData, campusRaw)
    expect(JSON.stringify(campus)).toBe(before)
  })
})


describe('线段与建筑 footprint 相交检测', () => {
  const square: readonly Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('线段穿过多边形时判定相交', () => {
    expect(segmentIntersectsPolygon([-5, 5], [15, 5], square)).toBe(true)
  })

  it('线段完全在多边形内时判定相交', () => {
    expect(segmentIntersectsPolygon([2, 3], [8, 7], square)).toBe(true)
  })

  it('线段擦边但不相交时返回 false', () => {
    expect(segmentIntersectsPolygon([-5, 11], [15, 11], square)).toBe(false)
    expect(segmentIntersectsPolygon([-5, 10], [15, 10], square)).toBe(true)
  })

  it('footprint 为空时回退为不相交，建筑被跳过', () => {
    const noFootprint = [{ id: 'no-fp', name: '无轮廓楼', position: [5, 5] as Point }]
    expect(segmentIntersectsPolygon([-5, 5], [15, 5], undefined)).toBe(false)
    expect(segmentIntersectsPolygon([-5, 5], [15, 5], [])).toBe(false)
    expect(buildingsCrossedBySegment([-5, 5], [15, 5], noFootprint)).toEqual([])
  })

  it('多建筑场景只列出真正被穿过的 footprint id', () => {
    const buildings = [
      { id: 'hit', name: '被穿楼', position: [5, 5] as Point, footprint: square },
      { id: 'miss', name: '擦边楼', position: [5, 15] as Point, footprint: [[0, 12], [10, 12], [10, 20], [0, 20]] as Point[] },
    ]
    expect(buildingsCrossedBySegment([-5, 5], [15, 5], buildings).map((b) => b.id)).toEqual(['hit'])
  })
})
