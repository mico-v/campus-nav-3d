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
    expect(roadsLayer.children.length).toBeGreaterThan(0)
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
})
