// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Canvas2D } from './canvas2d.ts'
import { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'

function emptyData(): CampusData {
  return {
    name: 't',
    bounds: { width: 200, depth: 200 },
    zones: [{ id: 'z1', name: 'z', category: 'dorm', center: [0, 0], size: [10, 10], color: '#fff' }],
    buildings: [],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
    routes: [],
  }
}

function setup() {
  const host = document.createElement('div')
  host.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
  document.body.appendChild(host)
  const store = new EditorStore(emptyData())
  const canvas = new Canvas2D(host, store)
  canvas.fitToData()
  return { store, canvas }
}

describe('Canvas2D add/remove', () => {
  it('adds a building at the view center and selects it', () => {
    const { store, canvas } = setup()
    canvas.addEntityAtViewCenter('building')
    expect(store.data.buildings.length).toBe(1)
    expect(store.selection).toEqual({ kind: 'building', index: 0 })
    expect(store.dirty).toBe(true)
  })

  it('adds each entity type', () => {
    const { store, canvas } = setup()
    for (const t of ['building', 'road', 'zone', 'water', 'field', 'poi']) {
      canvas.addEntityAtViewCenter(t)
    }
    expect(store.data.buildings.length).toBe(1)
    expect(store.data.roads.length).toBe(1)
    expect(store.data.zones.length).toBe(2) // started with 1
    expect(store.data.waters.length).toBe(1)
    expect(store.data.fields.length).toBe(1)
    expect(store.data.pois.length).toBe(1)
  })

  it('deletes the selected entity and clears selection', () => {
    const { store, canvas } = setup()
    canvas.addEntityAtViewCenter('poi')
    expect(store.data.pois.length).toBe(1)
    canvas.deleteSelected()
    expect(store.data.pois.length).toBe(0)
    expect(store.selection).toBeNull()
  })

  it('add then undo removes it', () => {
    const { store, canvas } = setup()
    canvas.addEntityAtViewCenter('building')
    store.undo()
    expect(store.data.buildings.length).toBe(0)
  })
})
