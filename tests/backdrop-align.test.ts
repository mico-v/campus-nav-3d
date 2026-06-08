// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyBackdropAlign, type BackdropAlign } from '../src/editor/canvas2d'

const bounds = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }

describe('applyBackdropAlign', () => {
  it('恒等：offset=0 scale=1 时等于原 bounds', () => {
    const a: BackdropAlign = { offsetX: 0, offsetZ: 0, scale: 1 }
    expect(applyBackdropAlign(bounds, a)).toEqual(bounds)
  })

  it('平移：offset 整体移动矩形', () => {
    const r = applyBackdropAlign(bounds, { offsetX: 10, offsetZ: -20, scale: 1 })
    expect(r).toEqual({ minX: -90, maxX: 110, minZ: -70, maxZ: 30 })
  })

  it('缩放：scale 绕中心放大（中心不变）', () => {
    const r = applyBackdropAlign(bounds, { offsetX: 0, offsetZ: 0, scale: 2 })
    expect((r.minX + r.maxX) / 2).toBeCloseTo(0, 6)
    expect((r.minZ + r.maxZ) / 2).toBeCloseTo(0, 6)
    expect(r.maxX - r.minX).toBeCloseTo(400, 6)
    expect(r.maxZ - r.minZ).toBeCloseTo(200, 6)
  })
})
