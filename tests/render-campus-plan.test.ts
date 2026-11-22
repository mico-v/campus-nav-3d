import { describe, expect, it } from 'vitest'
import {
  avoidLabels,
  boxesOverlap,
  computeBounds,
  createTransform,
  estimateTextWidth,
  makeLayout,
  northArrow,
  roadSegments,
  scaleBar,
  worldToSvg,
  type CampusPlanData,
  type LabelBox,
} from '../scripts/render-campus-plan'

const point = (x: number, z: number): [number, number] => [x, z]

const sample: CampusPlanData = {
  zones: [
    { id: 'osm-campus-boundary', name: 'boundary', polygon: [point(-400, -100), point(400, -100), point(400, 900), point(-400, 900)] },
    { id: 'west-academic', name: 'west', polygon: [point(-400, 0), point(0, 0), point(0, 400), point(-400, 400)] },
  ],
  buildings: [
    { id: 'b1', name: 'Library', footprint: [point(-100, 50), point(0, 50), point(0, 100), point(-100, 100)], position: point(-50, 75), zoneId: 'west-academic' },
    { id: 'b2', name: 'Hall', footprint: [point(200, 300), point(260, 300), point(260, 340), point(200, 340)], position: point(230, 320), zoneId: 'osm-campus-boundary' },
  ],
  roads: [{ id: 'r1', points: [point(-400, 200), point(400, 200)], width: 4, kind: 'road' }],
  roadNetwork: {
    nodes: [
      { id: 'n1', position: point(-400, 200), kind: 'waypoint' },
      { id: 'n2', position: point(400, 200), kind: 'junction' },
    ],
    edges: [],
    segments: [{ id: 's1', from: 'n1', to: 'n2', centerline: [point(-400, 200), point(400, 200)], class: 'main', width: 4 }],
  },
}

describe('computeBounds', () => {
  it('covers zones, buildings, roads and road nodes from data alone', () => {
    const b = computeBounds(sample)
    expect(b).toEqual({ minX: -400, minZ: -100, maxX: 400, maxZ: 900 })
  })

  it('does not read a bounds field even when one is present', () => {
    const withBounds = { ...sample, bounds: { minX: 999, minZ: 999, maxX: 1000, maxZ: 1000 } } as CampusPlanData
    expect(computeBounds(withBounds)).toEqual(computeBounds(sample))
  })

  it('ignores non-finite points instead of poisoning the bounds', () => {
    const broken = structuredClone(sample)
    broken.zones[0].polygon.push([Number.NaN, 12345])
    broken.buildings[0].footprint.push([12345, Number.POSITIVE_INFINITY])
    expect(computeBounds(broken)).toEqual(computeBounds(sample))
  })

  it('falls back to the origin when there is no finite geometry', () => {
    const empty: CampusPlanData = { zones: [], buildings: [], roads: [], roadNetwork: { nodes: [], edges: [] } }
    expect(computeBounds(empty)).toEqual({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 })
  })

  it('uses edges when the pack has no segments array', () => {
    const noSegments = structuredClone(sample)
    noSegments.roadNetwork.segments = undefined
    noSegments.roadNetwork.edges = [{ id: 'e1', from: 'n1', to: 'n2', centerline: [point(-400, -100)], class: 'road' }]
    expect(computeBounds(noSegments).minZ).toBe(-100)
    expect(roadSegments(noSegments)).toHaveLength(1)
  })
})

describe('worldToSvg', () => {
  it('maps z to y with north up: larger world z gives larger SVG y', () => {
    const b = computeBounds(sample)
    const transform = createTransform(b, { svgWidth: 1600, marginLeft: 48, marginTop: 48 })
    const north = worldToSvg(point(0, -100), transform)
    const south = worldToSvg(point(0, 900), transform)
    expect(south[1]).toBeGreaterThan(north[1])
    expect(south[1] - north[1]).toBeCloseTo(1000 * transform.scale, 6)
    expect(north[1]).toBeCloseTo(48, 6)
  })

  it('keeps x monotonic and does not swap the axes', () => {
    const transform = createTransform(computeBounds(sample), { svgWidth: 1600, marginLeft: 48, marginTop: 48 })
    const west = worldToSvg(point(-400, 0), transform)
    const east = worldToSvg(point(400, 0), transform)
    expect(east[0]).toBeGreaterThan(west[0])
    expect(east[0] - west[0]).toBeCloseTo(800 * transform.scale, 6)
    expect(west[1]).toBe(east[1])
  })

  it('places the data bounds exactly at the plot margins', () => {
    const layout = makeLayout(sample)
    const topLeft = worldToSvg([layout.bounds.minX, layout.bounds.minZ], layout.transform)
    expect(topLeft[1]).toBeCloseTo(layout.marginTop, 6)
    expect(topLeft[0]).toBeCloseTo((layout.svgWidth - (layout.bounds.maxX - layout.bounds.minX) * layout.transform.scale) / 2, 6)
  })
})

describe('makeLayout', () => {
  it('never produces a width below 1600 and keeps the whole plot inside', () => {
    const layout = makeLayout(sample)
    expect(layout.svgWidth).toBeGreaterThanOrEqual(1600)
    expect(layout.svgHeight).toBeGreaterThan(layout.marginTop + 900)
    const bottomRight = worldToSvg([layout.bounds.maxX, layout.bounds.maxZ], layout.transform)
    expect(bottomRight[1]).toBeCloseTo(layout.marginTop + 900, 6)
    expect(bottomRight[0]).toBeLessThan(layout.svgWidth)
  })

  it('scales to fit width when the campus is very wide', () => {
    const wide = structuredClone(sample)
    wide.zones[0].polygon = [point(-5000, 0), point(5000, 0), point(5000, 10), point(-5000, 10)]
    wide.buildings = []
    wide.roads = []
    wide.roadNetwork = { nodes: [], edges: [] }
    const layout = makeLayout(wide)
    expect(layout.svgWidth).toBeGreaterThanOrEqual(1600)
    expect((layout.bounds.maxX - layout.bounds.minX) * layout.transform.scale).toBeCloseTo(layout.svgWidth - layout.marginLeft * 2, 6)
  })
})

describe('avoidLabels', () => {
  it('places every label when there is room and avoids overlaps', () => {
    const anchors: [number, number][] = [[100, 100], [300, 100], [500, 100]]
    const placements = avoidLabels(anchors, ['A', 'B', 'C'])
    expect(placements).toHaveLength(3)
    expect(placements.every((p) => p.placed)).toBe(true)
    const boxes = placements.map((p) => p.box!)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false)
    }
  })

  it('respects preoccupied boxes', () => {
    const occupied: LabelBox[] = [{ x: 80, y: 80, w: 40, h: 16 }]
    const p = avoidLabels([[100, 100]], ['Library'], occupied)[0]
    expect(p.placed).toBe(true)
    expect(boxesOverlap({ x: p.x - 5, y: p.y - 5, w: 10, h: 10 }, occupied[0])).toBe(false)
  })

  it('marks a label unplaced when every candidate overlaps', () => {
    const wall: LabelBox[] = []
    for (let x = -200; x < 200; x += 5) wall.push({ x, y: -100, w: 5, h: 200 })
    const p = avoidLabels([[0, 0]], ['No room'], wall, 0)[0]
    expect(p.placed).toBe(false)
  })

  it('estimates CJK text wider than latin text of the same length', () => {
    expect(estimateTextWidth('图书馆')).toBeGreaterThan(estimateTextWidth('abc'))
  })
})

describe('map furniture', () => {
  it('draws north pointing up with an N label', () => {
    const arrow = northArrow()
    expect(arrow).toContain('>N<')
    expect(arrow).toContain('M 0 6 L -5 19')
  })

  it('makes scale-bar segments exactly 100 world units apart', () => {
    const scale = 0.42
    const { segments, pixelsPerSegment } = scaleBar(scale)
    expect(pixelsPerSegment).toBeCloseTo(42, 6)
    expect(segments.length).toBeGreaterThanOrEqual(1)
    expect(segments[0].label).toBe('0')
    expect(segments[segments.length - 1].label).toBe(`${(segments.length - 1) * 100} m`)
    for (let i = 1; i < segments.length; i++) expect(segments[i].x - segments[i - 1].x).toBeCloseTo(pixelsPerSegment, 6)
  })
})
