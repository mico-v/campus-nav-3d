import { describe, expect, it } from 'vitest'
import type { CampusData, Road } from '../data/campusData'
import { areaPolygon, classifyRoad, deriveCampusBounds, getDisplayRoads, isTrackField, pointInWorldPolygon, poiDisplayLevel, resolvedPoi, roadDisplayWidth, waterPolygon, zoneOpacity } from './displayRules'

const road = (id: string, points: [number, number][], width = 4): Road => ({ id, points, width })

describe('map display rules', () => {
  it('hides graph roads by default while retaining explicit debug visibility', () => {
    const data = { roads: [road('graph-road-1', [[0, 0], [10, 0]]), road('osm-road-1', [[0, 1], [10, 1]])] }

    expect(getDisplayRoads(data).map((item) => item.id)).toEqual(['osm-road-1'])
    expect(getDisplayRoads(data, { showGraphRoads: true }).map((item) => item.id)).toEqual(['graph-road-1', 'osm-road-1'])
  })

  it('classifies canals separately and supports hiding them', () => {
    const canal = road('osm-canal-1', [[0, 0], [10, 0]])
    expect(classifyRoad(canal)).toBe('canal')
    expect(getDisplayRoads({ roads: [canal] })[0].displayKind).toBe('canal')
    expect(getDisplayRoads({ roads: [canal] }, { showCanals: false })).toEqual([])
  })

  it('deduplicates reversed geometry and preserves authored widths', () => {
    const first = road('osm-road-1', [[0, 0], [10, 0]], 20)
    const duplicate = road('osm-road-2', [[10, 0], [0, 0]], 5)
    const visible = getDisplayRoads({ roads: [first, duplicate] })

    expect(visible).toHaveLength(1)
    expect(visible[0].width).toBe(20)
    expect(getDisplayRoads({ roads: [first] }, { maxRoadWidth: 6 })[0].width).toBe(6)
  })

  it('only adds a track ring for track-like fields', () => {
    expect(isTrackField({ id: 'osm-field-1', name: 'running' })).toBe(true)
    expect(isTrackField({ id: 'osm-field-2', name: 'soccer' })).toBe(false)
  })

  it('derives bounds from renderable geometry instead of metadata', () => {
    const data = {
      bounds: { width: 9999, depth: 9999 },
      buildings: [{ id: 'b', name: 'B', category: 'academic', position: [10, 20], size: [4, 6], height: 8, zoneId: 'z' }],
      roads: [], zones: [], waters: [], fields: [], trees: [], pois: [], name: 'test',
    } as CampusData
    expect(deriveCampusBounds(data)).toEqual({ center: [10, 20], width: 4, depth: 6 })
  })

  it('uses footprint geometry for area hit testing and fallback rectangles otherwise', () => {
    const footprint = areaPolygon({ center: [100, 100], size: [20, 20], footprint: [[0, 0], [20, 0], [10, 8]] })
    expect(pointInWorldPolygon([10, 4], footprint)).toBe(true)
    expect(pointInWorldPolygon([18, 18], footprint)).toBe(false)
    expect(areaPolygon({ center: [10, 20], size: [4, 6] })).toEqual([[8, 17], [12, 17], [12, 23], [8, 23]])
    expect(waterPolygon({ center: [10, 20], size: [4, 6] })).toHaveLength(48)
  })

  it('uses the same road width rule for editor and renderer', () => {
    expect(roadDisplayWidth({ width: 20, displayKind: 'road' })).toBe(20)
    expect(roadDisplayWidth({ width: 4, displayKind: 'canal' })).toBe(4)
  })

  it('renders canonical network segments when topology is available', () => {
    const data = {
      roads: [road('legacy', [[0, 0], [10, 0]], 8)],
      roadNetwork: {
        nodes: [
          { id: 'a', position: [0, 0] as [number, number], kind: 'waypoint' as const },
          { id: 'b', position: [5, 0] as [number, number], kind: 'junction' as const },
          { id: 'c', position: [10, 0] as [number, number], kind: 'waypoint' as const },
        ],
        segments: [
          { id: 'legacy--1', from: 'a', to: 'b', centerline: [[0, 0], [5, 0]] as [number, number][], width: 8, class: 'secondary' as const, surface: 'concrete' as const, access: { pedestrian: true, bicycle: true, vehicle: false }, sourceIds: ['legacy'] },
          { id: 'legacy--2', from: 'b', to: 'c', centerline: [[5, 0], [10, 0]] as [number, number][], width: 8, class: 'secondary' as const, surface: 'concrete' as const, access: { pedestrian: true, bicycle: true, vehicle: false }, sourceIds: ['legacy'] },
        ],
      },
    }
    expect(getDisplayRoads(data).map((item) => item.id)).toEqual(['legacy--1', 'legacy--2'])
  })

  it('resolves anchored POIs from their source building while leaving free POIs unchanged', () => {
    const building = { id: 'b', name: 'Building', position: [4, 8] as [number, number], height: 12, color: '#abc' }
    const anchored = resolvedPoi({ id: 'p', name: 'old', kind: 'landmark', position: [99, 1, 99], sourceBuildingId: 'b' }, [building])
    expect(anchored.position).toEqual([4, 14, 8])
    expect(resolvedPoi({ id: 'free', name: 'free', kind: 'service', position: [1, 2, 3] }, [building]).position).toEqual([1, 2, 3])
  })
  it('limits overview labels while allowing more at close range', () => {
    expect(poiDisplayLevel(1000, 500).maxLabels).toBeLessThan(poiDisplayLevel(100, 500).maxLabels)
  })
  it('keeps zone overlays recessive, especially campus boundaries', () => {
    expect(zoneOpacity({ id: 'osm-campus-boundary', category: 'landscape' })).toBe(0.08)
    expect(zoneOpacity({ id: 'west-campus', category: 'academic' })).toBe(0.16)
  })
})
