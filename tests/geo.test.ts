import { describe, it, expect } from 'vitest'
import { flatPolygon, extrudeFootprint, buildRoadOutline } from '../src/scene/geo'
import type * as THREE from 'three'

function worldVerts(geo: THREE.BufferGeometry): number[][] {
  const arr = geo.attributes.position.array as ArrayLike<number>
  const out: number[][] = []
  for (let i = 0; i < arr.length; i += 3) out.push([arr[i], arr[i + 1], arr[i + 2]])
  return out
}

describe('flatPolygon', () => {
  it('数据 Z 映射为世界 +Z（不取反）—— 道路偏移 bug 的回归护栏', () => {
    const geo = flatPolygon([[0, 90], [10, 90], [10, 110], [0, 110]])
    const zs = worldVerts(geo).map((v) => v[2])
    expect(Math.min(...zs)).toBeCloseTo(90, 4)
    expect(Math.max(...zs)).toBeCloseTo(110, 4)
  })
})

describe('extrudeFootprint', () => {
  it('不在 Z 方向镜像 footprint', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [0, 30]]
    const center: [number, number] = [10 / 3, 10]
    const geo = extrudeFootprint(pts, center, 5)
    const verts = worldVerts(geo).map((v) => [v[0] + center[0], v[1], v[2] + center[1]])
    const hasApex = verts.some((v) => Math.abs(v[0] - 0) < 1e-3 && Math.abs(v[2] - 30) < 1e-3)
    expect(hasApex).toBe(true)
  })

  it('高度沿 +Y 拉伸', () => {
    const geo = extrudeFootprint([[0, 0], [10, 0], [10, 10], [0, 10]], [5, 5], 12)
    const ys = worldVerts(geo).map((v) => v[1])
    expect(Math.min(...ys)).toBeCloseTo(0, 4)
    expect(Math.max(...ys)).toBeCloseTo(12, 4)
  })
})

describe('buildRoadOutline', () => {
  it('沿 X 的直路在数据空间生成以折线为中心的带', () => {
    const outline = buildRoadOutline([[0, 100], [50, 100]], 10)
    const zs = outline.map((p) => p[1])
    expect(Math.min(...zs)).toBeCloseTo(95, 4)
    expect(Math.max(...zs)).toBeCloseTo(105, 4)
    const xs = outline.map((p) => p[0])
    expect(Math.min(...xs)).toBeCloseTo(0, 4)
    expect(Math.max(...xs)).toBeCloseTo(50, 4)
  })

  it('重合点不产生 NaN', () => {
    const outline = buildRoadOutline([[0, 0], [0, 0], [10, 0]], 4)
    expect(outline.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true)
    const zs = outline.map((p) => p[1])
    // 重合起点不应把道路掐断为零宽：仍应存在 ±2 的半宽偏移
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0)
  })
})
