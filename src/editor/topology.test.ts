import { describe, expect, it } from 'vitest'
import { EditorStore } from './store'
import type { CampusData } from '../data/campusData'

function data(): CampusData {
  return {
    name: 'test',
    bounds: { width: 100, depth: 100 },
    zones: [], buildings: [],
    roads: [
      { id: 'h', points: [[0, 0], [10, 0]], width: 8 },
      { id: 'v', points: [[5, -5], [5, 5]], width: 8 },
    ],
    waters: [], fields: [], trees: [], pois: [],
  }
}

describe('editor road topology synchronization', () => {
  it('builds junction nodes when data enters the store', () => {
    const store = new EditorStore(data())
    expect(store.data.roadNetwork?.segments).toHaveLength(4)
    expect(store.data.roadNetwork?.nodes.some((node) => node.kind === 'junction')).toBe(true)
  })

  it('refreshes topology after a road mutation and undo', () => {
    const store = new EditorStore(data())
    store.mutate('move-road', (current) => { current.roads[1].points = [[8, -5], [8, 5]] })
    expect(store.data.roadNetwork?.nodes.some((node) => node.position[0] === 8 && node.position[1] === 0)).toBe(true)
    store.undo()
    expect(store.data.roadNetwork?.nodes.some((node) => node.position[0] === 5 && node.position[1] === 0)).toBe(true)
  })

})
