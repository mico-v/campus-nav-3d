import { describe, it, expect } from 'vitest'
import { SCALE_LADDER, chooseScaleBar, formatMeters, metersPerPixel } from './scale'

describe('metersPerPixel', () => {
  it('视距翻倍，每像素米数也翻倍', () => {
    const near = metersPerPixel(100, 45, 800)
    const far = metersPerPixel(200, 45, 800)
    expect(far / near).toBeCloseTo(2, 6)
  })

  it('视口越高，每像素米数越小', () => {
    expect(metersPerPixel(100, 45, 400)).toBeGreaterThan(metersPerPixel(100, 45, 800))
  })

  it('非法输入退回 1，不产生 NaN', () => {
    expect(metersPerPixel(0, 45, 800)).toBe(1)
    expect(metersPerPixel(100, 45, 0)).toBe(1)
    expect(Number.isNaN(metersPerPixel(Number.NaN, 45, 800))).toBe(false)
  })
})

describe('chooseScaleBar', () => {
  it('只在 1-2-5 阶梯上取值，且不超出像素预算', () => {
    for (const mpp of [0.05, 0.3, 1, 3.7, 12, 40, 130, 900, 5000]) {
      const bar = chooseScaleBar(mpp, 88)
      expect(SCALE_LADDER).toContain(bar.meters)
      expect(bar.pixels).toBeLessThanOrEqual(89)
      expect(bar.pixels).toBeGreaterThan(0)
    }
  })

  it('取预算内最长的一档，不是随便挑一个', () => {
    // mpp = 1 → 预算 88 米 → 最长可用档是 50 米
    expect(chooseScaleBar(1).meters).toBe(50)
    // mpp = 0.5 → 预算 44 米 → 25 米
    expect(chooseScaleBar(0.5).meters).toBe(25)
  })

  it('拉到极远时仍有像样的刻度，不缩成一条线', () => {
    // mpp = 5000（5 km/px）→ 预算 440 km → 阶梯里最长可用档 200 km，约 40px
    const bar = chooseScaleBar(5000)
    expect(bar.meters).toBe(200000)
    expect(bar.label).toBe('200 km')
    expect(bar.pixels).toBeGreaterThanOrEqual(20)
    expect(bar.pixels).toBeLessThanOrEqual(89)
  })

  it('近到最小档都装不下时也不空着', () => {
    const bar = chooseScaleBar(0.001)
    expect(bar.meters).toBe(1)
    expect(bar.pixels).toBeGreaterThanOrEqual(2)
  })

  it('公里与米分开标', () => {
    expect(formatMeters(50)).toBe('50 m')
    expect(formatMeters(1000)).toBe('1 km')
    expect(formatMeters(2500)).toBe('2.5 km')
    expect(formatMeters(200000)).toBe('200 km')
  })
})
