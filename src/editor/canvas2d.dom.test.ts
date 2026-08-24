// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { Canvas2D } from './canvas2d.ts'
import { EditorStore } from './store.ts'
import { createDefaultCampusData } from '../data/campusData.ts'

function makeHost(): HTMLElement {
  const host = document.createElement('div')
  host.getBoundingClientRect = () =>
    ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
  document.body.appendChild(host)
  return host
}

describe('Canvas2D rendering (DOM smoke)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the full campus into SVG without throwing', () => {
    const data = createDefaultCampusData()
    const store = new EditorStore(data)
    const host = makeHost()
    const canvas = new Canvas2D(host, store)
    canvas.fitToData()
    const svg = host.querySelector('svg')!
    expect(svg).toBeTruthy()
    // buildings layer should contain a polygon/rect per building
    const buildingsLayer = svg.querySelector('g[data-layer="buildings"]')!
    expect(buildingsLayer.children.length).toBe(data.buildings.length)
    // roads layer should contain polylines
    const roadsLayer = svg.querySelector('g[data-layer="roads"]')!
    if (data.roads.length > 0) expect(roadsLayer.children.length).toBeGreaterThan(0)
    // pois
    const poisLayer = svg.querySelector('g[data-layer="pois"]')!
    expect(poisLayer.children.length).toBe(data.pois.length)
  })

  it('draws selection handles for a selected footprint building', () => {
    const data = createDefaultCampusData()
    const store = new EditorStore(data)
    const host = makeHost()
    const canvas = new Canvas2D(host, store)
    canvas.fitToData()
    const idx = data.buildings.findIndex((b) => b.footprint && b.footprint.length >= 3)
    store.select({ kind: 'building', index: idx })
    canvas.render()
    const handles = host.querySelector('svg g[data-layer="handles"]')!
    expect(handles.children.length).toBe(data.buildings[idx].footprint!.length)
  })

  it('uses authored road width in the 2D editor and hides navigation routes', () => {
    const data = createDefaultCampusData()
    data.buildings = []
    data.zones = []
    data.waters = []
    data.fields = []
    data.trees = []
    data.pois = []
    data.roads = [{ id: 'editor-road', points: [[0, 0], [100, 0]], width: 24 }]
    const store = new EditorStore(data)
    const host = makeHost()
    const canvas = new Canvas2D(host, store)
    canvas.fitToData()

    const road = host.querySelector('g[data-layer="roads"] polyline')!
    expect(Number(road.getAttribute('stroke-width'))).toBeGreaterThan(6)
    expect(host.querySelector('g[data-layer="route"]')).toBeNull()
  })

  it('can make building fills transparent for overlay inspection', () => {
    const data = createDefaultCampusData()
    const store = new EditorStore(data)
    const host = makeHost()
    const canvas = new Canvas2D(host, store)
    canvas.setBuildingsTransparent(true)
    canvas.fitToData()
    const index = 0
    store.select({ kind: 'building', index })
    canvas.render()

    const building = host.querySelector('g[data-layer="buildings"]')!.children[index] as SVGElement
    expect(Number(building.getAttribute('fill-opacity'))).toBeLessThan(0.2)
  })
})
