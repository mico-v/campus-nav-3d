import { describe, expect, it } from 'vitest'
import type { CampusData, Road } from './campusData'
import { normalizeCampusData, normalizeRoads } from './roadNormalization'

const road = (id: string, points: [number, number][], extra: Partial<Road> = {}): Road => ({ id, points, width: 4, ...extra })

const campus = (roads: Road[]): CampusData => ({
  name: 'test', bounds: { width: 10, depth: 10 }, zones: [], buildings: [], roads, waters: [], fields: [], trees: [], pois: [],
})

describe('canonical road normalization', () => {
  it('chooses OSM geometry while retaining graph provenance for routing', () => {
    const normalized = normalizeRoads([
      road('graph-road-1', [[0, 0], [10, 0]], { width: 3 }),
      road('osm-road-7', [[10, 0], [5, 0], [0, 0]], { width: 5 }),
    ])
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ id: 'osm-road-7', kind: 'road', points: [[10, 0], [5, 0], [0, 0]], sourceIds: ['graph-road-1', 'osm-road-7'], routing: { sourceIds: ['graph-road-1'] } })
  })

  it('deduplicates reversed and overlapping polylines deterministically', () => {
    const first = normalizeRoads([road('road-b', [[10, 0], [0, 0]]), road('road-a', [[0, 0], [5, 0], [10, 0]])])
    const second = normalizeRoads([road('road-a', [[0, 0], [5, 0], [10, 0]]), road('road-b', [[10, 0], [0, 0]])])
    expect(first).toEqual(second)
    expect(first).toHaveLength(1)
    expect(first[0].id).toBe('road-a')
    expect(first[0].sourceIds).toEqual(['road-a', 'road-b'])
  })

  it('keeps canals in their own display class', () => {
    const normalized = normalizeRoads([
      road('osm-road-1', [[0, 0], [10, 0]]),
      road('osm-canal-1', [[0, 0], [10, 0]]),
    ])
    expect(normalized).toHaveLength(2)
    expect(normalized.find((item) => item.id === 'osm-canal-1')?.kind).toBe('canal')
  })

  it('round-trips canonical metadata without changing the source object', () => {
    const source = campus([road('graph-road-1', [[0, 0], [10, 0]]), road('osm-road-1', [[0, 0], [10, 0]])])
    const normalized = normalizeCampusData(source)
    expect(source.roads[0].sourceIds).toBeUndefined()
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
    expect(normalizeCampusData(normalized).roads).toEqual(normalized.roads)
  })

  it('retains persisted topology node ids when loading canonical data', () => {
    const source = campus([road('a', [[0, 0], [10, 0]]), road('b', [[5, -5], [5, 5]])])
    const first = normalizeCampusData(source)
    const second = normalizeCampusData(first)
    expect(second.roadNetwork?.nodes.map((node) => node.id)).toEqual(first.roadNetwork?.nodes.map((node) => node.id))
    expect(second.roadNetwork?.segments.map((segment) => [segment.from, segment.to])).toEqual(first.roadNetwork?.segments.map((segment) => [segment.from, segment.to]))
  })
})
