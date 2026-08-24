// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { localBackdropRect, Canvas2D, type BackdropAlign } from '../src/editor/canvas2d'
import { EditorStore } from '../src/editor/store'
import { createDefaultCampusData } from '../src/data/campusData'

// export.png 的固有宽高比（2048×1296）
const IMAGE_ASPECT = 2048 / 1296

describe('localBackdropRect（固定比例底图）', () => {
  const base = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }

  it('恒等：offset=0 scale=1 时，宽=base 宽、高=base 宽/图宽高比', () => {
    const a: BackdropAlign = { offsetX: 0, offsetZ: 0, scale: 1 }
    const r = localBackdropRect(base, a, IMAGE_ASPECT)
    expect(r.maxX - r.minX).toBeCloseTo(200, 6)
    expect(r.maxZ - r.minZ).toBeCloseTo(200 / IMAGE_ASPECT, 6)
    // 中心对齐 base 中心（偏移为 0）
    expect((r.minX + r.maxX) / 2).toBeCloseTo(0, 6)
    expect((r.minZ + r.maxZ) / 2).toBeCloseTo(0, 6)
  })

  it('比例恒为图宽高比：任意 scale 下也不被拉伸', () => {
    for (const scale of [0.5, 1, 1.7, 2.5]) {
      const r = localBackdropRect(base, { offsetX: 0, offsetZ: 0, scale }, IMAGE_ASPECT)
      expect((r.maxX - r.minX) / (r.maxZ - r.minZ)).toBeCloseTo(IMAGE_ASPECT, 6)
    }
  })

  it('偏移整体移动矩形，scale 绕中心缩放（中心保持）', () => {
    const r = localBackdropRect(base, { offsetX: 30, offsetZ: 20, scale: 2 }, IMAGE_ASPECT)
    expect((r.minX + r.maxX) / 2).toBeCloseTo(30, 6)
    expect((r.minZ + r.maxZ) / 2).toBeCloseTo(20, 6)
    expect(r.maxX - r.minX).toBeCloseTo(400, 6)
    expect(r.maxZ - r.minZ).toBeCloseTo(400 / IMAGE_ASPECT, 6)
  })
})

class TestCanvas extends Canvas2D {
  constructor(host: HTMLElement, store: EditorStore) {
    super(host, store)
    const stub = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
    this.svgRoot.getBoundingClientRect = stub
  }
  backdropEl(): HTMLImageElement {
    return this.mapBackdrop
  }
  backdropBox(): { left: number; top: number; width: number; height: number } {
    const img = this.mapBackdrop
    return {
      left: parseFloat(img.style.left),
      top: parseFloat(img.style.top),
      width: parseFloat(img.style.width),
      height: parseFloat(img.style.height),
    }
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

describe('本地固定底图：不随数据 bounds 变化', () => {
  it('数据边界变化后，底图位置/尺寸/比例均不变（基准冻结）', () => {
    const { c, store } = setup()
    c.setMapBackdrop({ enabled: true, provider: 'local-file', imageUrl: './export.png' })
    const before = c.backdropBox()
    // 动态断言是 export.png 的固有比例（未被拉伸）
    expect(before.width / before.height).toBeCloseTo(IMAGE_ASPECT, 6)

    // 大幅扩展数据边界（例如往远处加一条路），bounds 剧烈变化
    store.mutate('test-far-road', (d) => {
      d.roads.push({ id: 'far-road', points: [[9000, 5000], [9200, 5200]], width: 3.2, kind: 'road', sourceIds: ['far-road'] })
    })
    c.render()

    const after = c.backdropBox()
    expect(after).toEqual(before)
    expect(after.width / after.height).toBeCloseTo(IMAGE_ASPECT, 6)
  })

  it('本地底图直接设置本地 src，不发起网络请求', () => {
    const { c } = setup()
    c.setMapBackdrop({ enabled: true, provider: 'local-file', imageUrl: './export.png' })
    expect(c.backdropEl().src.endsWith('/export.png')).toBe(true)
    expect(c.backdropEl().style.display).toBe('block')
  })
})