import { describe, it, expect } from 'vitest'
import { routeParam } from '../src/scene/CampusScene'

describe('routeParam', () => {
  it('正常正值映射到 [0, 0.999]', () => {
    const t = routeParam(5)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThan(1)
  })
  it('负 elapsed(浏览器首帧)不产生负 t —— 崩溃回归护栏', () => {
    for (const e of [-0.301, -0.001, -5, -0.024]) {
      const t = routeParam(e)
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(1)
    }
  })
  it('NaN / Infinity 退化为 0', () => {
    expect(routeParam(NaN)).toBe(0)
    expect(routeParam(Infinity)).toBe(0)
    expect(routeParam(-Infinity)).toBe(0)
  })
  it('始终 < 1（getPointAt 在 t>=1 也会崩）', () => {
    for (let e = 0; e < 200; e += 0.37) {
      expect(routeParam(e)).toBeLessThan(1)
    }
  })
})
