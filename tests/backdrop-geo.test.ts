// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { worldBoundsToGeo } from '../src/editor/canvas2d'

describe('worldBoundsToGeo', () => {
  const anchor = { latitude: 31.251759, longitude: 120.572634 }

  it('中心点映射回锚点经纬', () => {
    const geo = worldBoundsToGeo({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, anchor)
    expect((geo.minLat + geo.maxLat) / 2).toBeCloseTo(anchor.latitude, 6)
    expect((geo.minLon + geo.maxLon) / 2).toBeCloseTo(anchor.longitude, 6)
  })

  it('校区量级的世界范围产生合理的经纬跨度(<3km)', () => {
    const geo = worldBoundsToGeo({ minX: -693, maxX: 2120, minZ: -224, maxZ: 996 }, anchor)
    const latSpanKm = (geo.maxLat - geo.minLat) * 110.574
    const lonSpanKm = (geo.maxLon - geo.minLon) * 111.32 * Math.cos((anchor.latitude * Math.PI) / 180)
    expect(latSpanKm).toBeGreaterThan(0)
    expect(latSpanKm).toBeLessThan(3)
    expect(lonSpanKm).toBeGreaterThan(0)
    expect(lonSpanKm).toBeLessThan(5)
  })

  it('minLat 始终 <= maxLat（不论 zToLatitude 正负）', () => {
    const flipped = worldBoundsToGeo(
      { minX: -100, maxX: 100, minZ: -50, maxZ: 50 },
      { ...anchor, zToLatitude: -1 },
    )
    expect(flipped.minLat).toBeLessThanOrEqual(flipped.maxLat)
  })
})
