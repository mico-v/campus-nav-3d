import { describe, it, expect, vi } from 'vitest'
import { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'

function makeData(): CampusData {
  return {
    name: 'test',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [
      { id: 'b1', name: 'B1', category: 'academic', position: [0, 0], size: [10, 10], height: 12, zoneId: 'z1' },
    ],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

describe('EditorStore', () => {
  it('mutate marks dirty and changes data', () => {
    const store = new EditorStore(makeData())
    expect(store.dirty).toBe(false)
    store.mutate('move', (d) => {
      d.buildings[0].height = 30
    })
    expect(store.dirty).toBe(true)
    expect(store.data.buildings[0].height).toBe(30)
  })

  it('undo restores previous state, redo re-applies', () => {
    const store = new EditorStore(makeData())
    store.mutate('h', (d) => {
      d.buildings[0].height = 30
    })
    store.undo()
    expect(store.data.buildings[0].height).toBe(12)
    store.redo()
    expect(store.data.buildings[0].height).toBe(30)
  })

  it('undo with no history is a no-op', () => {
    const store = new EditorStore(makeData())
    store.undo()
    expect(store.data.buildings[0].height).toBe(12)
  })

  it('markSaved clears dirty', () => {
    const store = new EditorStore(makeData())
    store.mutate('x', (d) => {
      d.name = 'changed'
    })
    store.markSaved()
    expect(store.dirty).toBe(false)
  })

  it('notifies subscribers on mutate and undo', () => {
    const store = new EditorStore(makeData())
    const fn = vi.fn()
    store.subscribe(fn)
    store.mutate('x', (d) => {
      d.name = 'a'
    })
    store.undo()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('select updates selection and notifies', () => {
    const store = new EditorStore(makeData())
    const fn = vi.fn()
    store.subscribe(fn)
    store.select({ kind: 'building', index: 0 })
    expect(store.selection).toEqual({ kind: 'building', index: 0 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('selection transitions notify both views without changing data', () => {
    const store = new EditorStore(makeData())
    const fn = vi.fn()
    store.subscribe(fn)
    store.select({ kind: 'building', index: 0 })
    store.select(null)
    expect(store.selection).toBeNull()
    expect(store.data.buildings[0].position).toEqual([0, 0])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('recordUndo makes a constrained external edit reversible', () => {
    const store = new EditorStore(makeData())
    const before = JSON.parse(JSON.stringify(store.data)) as CampusData
    store.data.buildings[0].position = [20, 30]
    store.recordUndo(before)
    store.undo()
    expect(store.data.buildings[0].position).toEqual([0, 0])
  })

  it('mutations on the working copy do not leak into undo snapshots', () => {
    const store = new EditorStore(makeData())
    store.mutate('h', (d) => {
      d.buildings[0].height = 30
    })
    store.mutate('h2', (d) => {
      d.buildings[0].height = 40
    })
    store.undo()
    expect(store.data.buildings[0].height).toBe(30)
    store.undo()
    expect(store.data.buildings[0].height).toBe(12)
  })
})
