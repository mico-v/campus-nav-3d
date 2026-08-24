// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Canvas2D } from './canvas2d.ts'
import { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'

function fakeEvent(x: number, y: number): PointerEvent {
  return { pointerId: 1, clientX: x, clientY: y, preventDefault() {} } as unknown as PointerEvent
}

class TestCanvas extends Canvas2D {
  constructor(host: HTMLElement, store: EditorStore) {
    super(host, store)
    const stub = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
    this.svgRoot.getBoundingClientRect = stub
    this.svgRoot.setPointerCapture = () => {}
    this.svgRoot.hasPointerCapture = () => false
    this.svgRoot.releasePointerCapture = () => {}
  }
  screenOf(x: number, z: number): [number, number] {
    return this.toScreen(x, z)
  }
  down(x: number, y: number) {
    this.handlePointerDown(fakeEvent(x, y))
  }
  move(x: number, y: number) {
    this.handlePointerMove(fakeEvent(x, y))
  }
  up(x: number, y: number) {
    this.handlePointerUp(fakeEvent(x, y))
  }
  dbl(x: number, y: number) {
    ;(this as unknown as { handleDoubleClick(e: MouseEvent): void }).handleDoubleClick(fakeEvent(x, y))
  }
  pressDelete() {
    ;(this as unknown as { handleKeyDown(e: KeyboardEvent): void }).handleKeyDown({
      key: 'Delete',
      target: document.body,
      preventDefault() {},
    } as unknown as KeyboardEvent)
  }
}

function fpData(): CampusData {
  return {
    name: 't',
    bounds: { width: 200, depth: 200 },
    zones: [],
    buildings: [
      {
        id: 'b1',
        name: 'B1',
        category: 'academic',
        position: [50, 50],
        size: [40, 40],
        height: 10,
        zoneId: 'z',
        footprint: [
          [30, 30],
          [70, 30],
          [70, 70],
          [30, 70],
        ],
      },
    ],
    roads: [{ id: 'r1', points: [[0, 0], [100, 0]], width: 3 }],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

function setup() {
  const host = document.createElement('div')
  host.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
  document.body.appendChild(host)
  const store = new EditorStore(fpData())
  const canvas = new TestCanvas(host, store)
  canvas.fitToData()
  return { store, canvas }
}

describe('Canvas2D interaction', () => {
  it('drags a footprint vertex and records one undo step', () => {
    const { store, canvas } = setup()
    store.select({ kind: 'building', index: 0 })
    const start = canvas.screenOf(30, 30) // vertex 0
    const target = canvas.screenOf(20, 25) // move to world (20,25)
    canvas.down(start[0], start[1])
    canvas.move(target[0], target[1])
    canvas.up(target[0], target[1])

    expect(store.data.buildings[0].footprint![0][0]).toBeCloseTo(20, 1)
    expect(store.data.buildings[0].footprint![0][1]).toBeCloseTo(25, 1)
    expect(store.dirty).toBe(true)
    store.undo()
    expect(store.data.buildings[0].footprint![0]).toEqual([30, 30])
  })

  it('moves a whole building by dragging its body', () => {
    const { store, canvas } = setup()
    store.select({ kind: 'building', index: 0 })
    const from = canvas.screenOf(50, 50) // centre, away from vertices
    const to = canvas.screenOf(60, 55)
    canvas.down(from[0], from[1])
    canvas.move(to[0], to[1])
    canvas.up(to[0], to[1])
    // footprint translated by (+10,+5)
    expect(store.data.buildings[0].footprint![0][0]).toBeCloseTo(40, 1)
    expect(store.data.buildings[0].footprint![0][1]).toBeCloseTo(35, 1)
  })

  it('double-click inserts a footprint vertex', () => {
    const { store, canvas } = setup()
    store.select({ kind: 'building', index: 0 })
    const mid = canvas.screenOf(50, 30) // midpoint of edge 0 (30,30)-(70,30)
    canvas.dbl(mid[0], mid[1])
    expect(store.data.buildings[0].footprint!.length).toBe(5)
  })

  it('Delete removes the active footprint vertex', () => {
    const { store, canvas } = setup()
    store.select({ kind: 'building', index: 0 })
    const v = canvas.screenOf(70, 30) // grab vertex 1 to make it active
    canvas.down(v[0], v[1])
    canvas.up(v[0], v[1])
    canvas.pressDelete()
    expect(store.data.buildings[0].footprint!.length).toBe(3)
  })

  it('selects a vertex directly and deletes it without selecting the object first', () => {
    const { store, canvas } = setup()
    const v = canvas.screenOf(70, 30)
    canvas.down(v[0], v[1])

    expect(store.selection).toEqual({ kind: 'building', index: 0 })
    expect(store.data.buildings[0].footprint).toHaveLength(4)
    expect(canvas.hasActiveVertex).toBe(true)

    canvas.pressDelete()
    expect(store.data.buildings[0].footprint).toHaveLength(3)
    expect(canvas.hasActiveVertex).toBe(false)
  })

  it('drags a road node', () => {
    const { store, canvas } = setup()
    store.select({ kind: 'road', index: 0 })
    const start = canvas.screenOf(100, 0)
    const target = canvas.screenOf(120, 20)
    canvas.down(start[0], start[1])
    canvas.move(target[0], target[1])
    canvas.up(target[0], target[1])
    expect(store.data.roads[0].points[1][0]).toBeCloseTo(120, 1)
    expect(store.data.roads[0].points[1][1]).toBeCloseTo(20, 1)
  })

  it('drags a junction node across all connected source roads', () => {
    const { store, canvas } = setup()
    store.data.roads = [
      { id: 'h', points: [[0, 0], [100, 0]], width: 8 },
      { id: 'v', points: [[50, -50], [50, 50]], width: 8 },
    ]
    store.notifyChange()
    const start = canvas.screenOf(50, 0)
    const target = canvas.screenOf(60, 10)
    canvas.down(start[0], start[1])
    canvas.move(target[0], target[1])
    canvas.up(target[0], target[1])

    expect(store.data.roads[0].points).toContainEqual([60, 10])
    expect(store.data.roads[1].points).toContainEqual([60, 10])
    expect(store.data.roadNetwork?.nodes.some((node) => node.kind === 'junction' && node.position[0] === 60 && node.position[1] === 10)).toBe(true)
  })
})
