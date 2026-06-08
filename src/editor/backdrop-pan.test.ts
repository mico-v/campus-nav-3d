// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Canvas2D } from './canvas2d.ts'
import { EditorStore } from './store.ts'
import { createDefaultCampusData } from '../data/campusData.ts'

function ev(x: number, y: number, button = 0): PointerEvent {
  return { pointerId: 1, clientX: x, clientY: y, button, preventDefault() {} } as unknown as PointerEvent
}

class TestCanvas extends Canvas2D {
  constructor(host: HTMLElement, store: EditorStore) {
    super(host, store)
    const stub = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
    this.svgRoot.getBoundingClientRect = stub
    this.svgRoot.setPointerCapture = () => {}
    this.svgRoot.releasePointerCapture = () => {}
  }
  viewOffset(): [number, number] {
    return [this.view.offsetX, this.view.offsetY]
  }
  down(x: number, y: number, button = 0) {
    this.handlePointerDown(ev(x, y, button))
  }
  move(x: number, y: number) {
    this.handlePointerMove(ev(x, y))
  }
  up(x: number, y: number) {
    this.handlePointerUp(ev(x, y))
  }
}

function setup() {
  const host = document.createElement('div')
  Object.defineProperty(host, 'clientWidth', { value: 800 })
  Object.defineProperty(host, 'clientHeight', { value: 600 })
  const store = new EditorStore(createDefaultCampusData())
  const c = new TestCanvas(host, store)
  c.fitToData()
  return { c, store }
}

describe('中键平移画布', () => {
  it('中键(button=1)拖动改变 view 偏移，且不改数据', () => {
    const { c, store } = setup()
    const before = JSON.stringify(store.data)
    const [ox, oy] = c.viewOffset()
    c.down(400, 300, 1)
    c.move(450, 320)
    c.up(450, 320)
    const [nx, ny] = c.viewOffset()
    expect(nx).not.toBe(ox)
    expect(ny).not.toBe(oy)
    expect(JSON.stringify(store.data)).toBe(before)
  })
})

describe('解锁后左键拖动平移底图', () => {
  it('解锁时左键拖动改变 backdropAlign.offset，不改数据/不入撤销', () => {
    const { c, store } = setup()
    c.setBackdropLocked(false)
    const before = JSON.stringify(store.data)
    const a0 = c.getBackdropAlign()
    c.down(400, 300, 0)
    c.move(440, 300)
    c.up(440, 300)
    const a1 = c.getBackdropAlign()
    expect(a1.offsetX).not.toBe(a0.offsetX)
    expect(JSON.stringify(store.data)).toBe(before)
    expect(store.canUndo).toBe(false)
  })

  it('锁定时左键拖动不动底图(走元素编辑路径)', () => {
    const { c } = setup()
    c.setBackdropLocked(true)
    const a0 = c.getBackdropAlign()
    c.down(400, 300, 0)
    c.move(440, 300)
    c.up(440, 300)
    expect(c.getBackdropAlign().offsetX).toBe(a0.offsetX)
  })
})
