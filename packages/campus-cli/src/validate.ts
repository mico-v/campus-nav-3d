import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateCampusPack,
  type PackIssue,
  type Point,
} from '../../campus-schema/src/index.ts'

export interface ValidationError extends PackIssue {
  category: 'geometry' | 'topology' | 'naming' | 'schema'
}

export interface ValidationReport {
  pack: string
  ok: boolean
  summary: {
    errors: number
    geometry: number
    topology: number
    naming: number
    schema: number
  }
  issues: ValidationError[]
}

export interface ValidateOptions {
  withSchema?: boolean
}

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
}

function polygonArea(vertices: Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index]!
    const [x2, y2] = vertices[(index + 1) % vertices.length]!
    twiceArea += x1 * y2 - x2 * y1
  }
  return Math.abs(twiceArea) / 2
}

function isSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

/** 读取 pack 目录并合并可选 campus.json，供 CLI 与测试共用。 */
export function readPack(packDir: string): unknown {
  const pack = readJson(join(packDir, 'pack.json')) as RecordValue
  let campus: RecordValue = {}
  try {
    const parsed = readJson(join(packDir, 'campus.json'))
    if (isRecord(parsed)) campus = parsed
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }
  return { ...campus, ...pack }
}

/**
 * 在 schema 校验之外补几何、拓扑、命名自检。
 * schema-only 错误（如缺字段）不算进三类自检，避免重复计数。
 */
export function inspectPack(value: unknown, options: ValidateOptions = {}): ValidationError[] {
  const issues: ValidationError[] = []

  const add = (
    category: ValidationError['category'],
    path: string,
    code: string,
    message: string,
  ): void => {
    issues.push({ category, path, code, message })
  }

  const checkPolygon = (vertices: unknown, path: string): void => {
    if (!Array.isArray(vertices) || !vertices.every(isPoint)) return
    if (vertices.length < 3) {
      add('geometry', path, 'polygon.too-few-vertices', '多边形至少需要 3 个顶点')
      return
    }
    if (polygonArea(vertices as Point[]) === 0) {
      add('geometry', path, 'polygon.zero-area', '多边形面积为 0')
    }
  }

  const checkIds = (values: unknown, path: string, kind: string): void => {
    if (!Array.isArray(values)) return
    const seen = new Set<string>()
    values.forEach((value, index) => {
      if (!isRecord(value)) return
      const id = value.id
      if (typeof id !== 'string' || id.length === 0) return
      if (!isSlug(id)) {
        add('naming', `${path}[${index}].id`, `${kind}.id.invalid`, `id 必须是小写连字符 slug：${id}`)
      }
      if (seen.has(id)) {
        add('topology', `${path}[${index}].id`, `${kind}.id.duplicate`, `id 重复：${id}`)
      }
      seen.add(id)
    })
  }

  const schemaResult = validateCampusPack(value)

  if (!isRecord(value)) return issues

  const zones = value.zones
  if (Array.isArray(zones)) {
    zones.forEach((zone, index) => {
      if (!isRecord(zone)) return
      checkPolygon(zone.polygon, `zones[${index}].polygon`)
    })
    checkIds(zones, 'zones', 'zone')
  }

  const buildings = value.buildings
  const buildingIds = new Set<string>()
  if (Array.isArray(buildings)) {
    buildings.forEach((building, buildingIndex) => {
      if (!isRecord(building)) return
      const buildingPath = `buildings[${buildingIndex}]`
      checkPolygon(building.footprint, `${buildingPath}.footprint`)
      if (typeof building.id === 'string') buildingIds.add(building.id)

      if (!Array.isArray(building.levels)) return
      const levels = building.levels.filter(isRecord)
      const levelByIndex = new Map<number, RecordValue>()
      for (const level of levels) {
        if (Number.isInteger(level.index)) levelByIndex.set(level.index as number, level)
      }
      const reachable = new Set<number>()
      const verticalPairs = new Set<string>()
      const pairCount = new Map<string, number>()
      const queue: number[] = []

      const enter = (index: unknown): void => {
        if (!Number.isInteger(index)) return
        const target = index as number
        if (!levelByIndex.has(target) || reachable.has(target)) return
        reachable.add(target)
        queue.push(target)
      }

      enter(levels[0]?.index)

      levels.forEach((level) => {
        if (!isRecord(level) || !Array.isArray(level.verticals) || !Number.isInteger(level.index)) return
        for (const vertical of level.verticals) {
          if (!isRecord(vertical) || !Number.isInteger(vertical.to)) continue
          const pair = `${buildingPath}|${level.index}->${vertical.to}`
          verticalPairs.add(pair)
          pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1)
        }
      })

      levels.forEach((level, levelIndex) => {
        const levelPath = `${buildingPath}.levels[${levelIndex}]`
        if (level.outline !== undefined) checkPolygon(level.outline, `${levelPath}.outline`)

        if (Array.isArray(level.units)) {
          level.units.forEach((unit, unitIndex) => {
            if (!isRecord(unit)) return
            checkPolygon(unit.polygon, `${levelPath}.units[${unitIndex}].polygon`)
          })
          checkIds(level.units, `${levelPath}.units`, 'unit')
        }

        if (Array.isArray(level.portals)) {
          checkIds(level.portals, `${levelPath}.portals`, 'portal')
        }

        if (!Array.isArray(level.verticals)) return
        level.verticals.forEach((vertical, verticalIndex) => {
          if (!isRecord(vertical)) return
          const verticalPath = `${levelPath}.verticals[${verticalIndex}]`
          if (typeof vertical.id === 'string' && !isSlug(vertical.id)) {
            add('naming', `${verticalPath}.id`, 'vertical.id.invalid', `id 必须是小写连字符 slug：${vertical.id}`)
          }
          if (!Number.isInteger(level.index) || !Number.isInteger(vertical.to)) return
          const from = level.index as number
          const to = vertical.to as number
          const pair = `${buildingPath}|${from}->${to}`
          if ((pairCount.get(pair) ?? 0) > 1) {
            add(
              'topology',
              `${verticalPath}.to`,
              'vertical.duplicate',
              `竖向连接重复：楼层 ${from} -> ${to}`,
            )
          }
          if (reachable.has(from)) enter(to)
        })
      })

      while (queue.length > 0) {
        const current = queue.shift()!
        const currentLevel = levelByIndex.get(current)
        if (!currentLevel || !Array.isArray(currentLevel.verticals)) continue
        for (const vertical of currentLevel.verticals) {
          if (!isRecord(vertical)) continue
          if (!Number.isInteger(current) || !Number.isInteger(vertical.to)) continue
          const reverse = `${buildingPath}|${vertical.to}->${current}`
          if (!verticalPairs.has(reverse)) {
            add(
              'topology',
              `${buildingPath}.levels`,
              'vertical.one-way',
              `竖向连接单向：楼层 ${current} 可到 ${vertical.to}，但没有反向连接`,
            )
          }
          enter(vertical.to)
        }
      }

      levels.forEach((level, levelIndex) => {
        if (!Number.isInteger(level.index)) return
        const index = level.index as number
        if (reachable.has(index)) return
        add(
          'topology',
          `${buildingPath}.levels[${levelIndex}].index`,
          'level.unreachable',
          `楼层 ${index} 从首层不可达`,
        )
        if (Array.isArray(level.units)) {
          level.units.forEach((unit, unitIndex) => {
            if (!isRecord(unit) || typeof unit.id !== 'string') return
            add(
              'topology',
              `${buildingPath}.levels[${levelIndex}].units[${unitIndex}].id`,
              'unit.unreachable',
              `房间 ${unit.id} 从首层不可达`,
            )
          })
        }
      })
    })
    checkIds(buildings, 'buildings', 'building')
  }

  const roadNetwork = value.roadNetwork
  if (isRecord(roadNetwork)) {
    const nodes = roadNetwork.nodes
    const nodeIds = new Set<string>()
    if (Array.isArray(nodes)) {
      nodes.forEach((node) => {
        if (!isRecord(node)) return
        if (typeof node.id === 'string') nodeIds.add(node.id)
      })
      checkIds(nodes, 'roadNetwork.nodes', 'roadNode')
    }
    if (Array.isArray(roadNetwork.edges)) {
      const edgesByPair = new Set<string>()
      roadNetwork.edges.forEach((edge, index) => {
        if (!isRecord(edge)) return
        if (typeof edge.from !== 'string' || typeof edge.to !== 'string') return
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return
        const pair = [edge.from, edge.to].sort().join('|')
        if (edgesByPair.has(pair)) {
          add(
            'topology',
            `roadNetwork.edges[${index}]`,
            'roadEdge.duplicate',
            `道路边重复：${edge.from} -> ${edge.to}`,
          )
        }
        edgesByPair.add(pair)
      })
    }
  }

  const indoorNetwork = value.indoorNetwork
  if (isRecord(indoorNetwork)) {
    const nodes = indoorNetwork.nodes
    if (Array.isArray(nodes)) {
      nodes.forEach((node, index) => {
        if (!isRecord(node)) return
        if (typeof node.building === 'string' && node.building.length > 0 && !buildingIds.has(node.building)) {
          add(
            'topology',
            `indoorNetwork.nodes[${index}].building`,
            'indoorNode.building.unknown',
            `建筑不存在：${node.building}`,
          )
        }
      })
      checkIds(nodes, 'indoorNetwork.nodes', 'indoorNode')
    }
    if (Array.isArray(indoorNetwork.edges)) {
      const neighbors = new Map<string, Set<string>>()
      const addNeighbor = (from: unknown, to: unknown): void => {
        if (typeof from !== 'string' || typeof to !== 'string') return
        if (!neighbors.has(from)) neighbors.set(from, new Set())
        neighbors.get(from)!.add(to)
      }
      for (const edge of indoorNetwork.edges) {
        if (!isRecord(edge)) continue
        addNeighbor(edge.from, edge.to)
        addNeighbor(edge.to, edge.from)
      }
      const nodeIds = new Set(
        Array.isArray(nodes)
          ? nodes.filter(isRecord).map((node) => node.id).filter((id): id is string => typeof id === 'string')
          : [],
      )
      for (const nodeId of nodeIds) {
        const component = new Set<string>([nodeId])
        const queue = [nodeId]
        while (queue.length > 0) {
          const current = queue.shift()!
          for (const next of neighbors.get(current) ?? []) {
            if (component.has(next)) continue
            component.add(next)
            queue.push(next)
          }
        }
        if (component.size === nodeIds.size) continue
        for (const id of component) {
          const index = Array.isArray(nodes)
            ? nodes.findIndex((node) => isRecord(node) && node.id === id)
            : -1
          if (index >= 0) {
            add(
              'topology',
              `indoorNetwork.nodes[${index}].id`,
              'indoorNode.unreachable',
              `室内节点 ${id} 不与其他节点连通`,
            )
          }
        }
        break
      }
    }
  }

  const pois = value.pois
  if (Array.isArray(pois)) {
    pois.forEach((poi, index) => {
      if (!isRecord(poi)) return
      if (typeof poi.building === 'string' && poi.building.length > 0 && !buildingIds.has(poi.building)) {
        add(
          'topology',
          `pois[${index}].building`,
          'poi.building.unknown',
          `建筑不存在：${poi.building}`,
        )
      }
    })
    checkIds(pois, 'pois', 'poi')
  }

  if (options.withSchema) {
    for (const issue of schemaResult.issues) {
      issues.push({ ...issue, category: 'schema' })
    }
  }

  return issues
}

export function validatePackDir(packDir: string, options: ValidateOptions = {}): ValidationReport {
  const pack = readPack(packDir)
  const issues = inspectPack(pack, options)
  const summary = {
    errors: issues.length,
    geometry: issues.filter((issue) => issue.category === 'geometry').length,
    topology: issues.filter((issue) => issue.category === 'topology').length,
    naming: issues.filter((issue) => issue.category === 'naming').length,
    schema: issues.filter((issue) => issue.category === 'schema').length,
  }
  return { pack: packDir, ok: issues.length === 0, summary, issues }
}
