import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, fitView, zoomAt, pan } from './projection.ts'

describe('worldToScreen / screenToWorld', () => {
  it('round-trips a point', () => {
    const v = { scale: 2.5, offsetX: 30, offsetY: -10 }
    const [sx, sy] = worldToScreen(v, 12, -7)
    const [wx, wz] = screenToWorld(v, sx, sy)
    expect(wx).toBeCloseTo(12)
    expect(wz).toBeCloseTo(-7)
  })
})

describe('fitView', () => {
  it('centers the bounds in the viewport', () => {
    const v = fitView({ minX: 0, maxX: 100, minZ: 0, maxZ: 50 }, 400, 300, 20)
    const center = worldToScreen(v, 50, 25)
    expect(center[0]).toBeCloseTo(200)
    expect(center[1]).toBeCloseTo(150)
  })
})

describe('zoomAt', () => {
  it('keeps the anchor point fixed', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 }
    const before = screenToWorld(v, 100, 80)
    const zoomed = zoomAt(v, 100, 80, 1.5)
    const after = screenToWorld(zoomed, 100, 80)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
    expect(zoomed.scale).toBeCloseTo(1.5)
  })
})

describe('pan', () => {
  it('shifts the offset', () => {
    expect(pan({ scale: 2, offsetX: 5, offsetY: 5 }, 10, -3)).toEqual({ scale: 2, offsetX: 15, offsetY: 2 })
  })
})
