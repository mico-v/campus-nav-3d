import { describe, it, expect } from 'vitest'
import { createDefaultCampusData } from '../src/data/campusData'

describe('campus 数据完整性', () => {
  const data = createDefaultCampusData()

  it('顶层集合存在且非空', () => {
    expect(data.buildings.length).toBeGreaterThan(0)
    expect(data.roads.length).toBeGreaterThan(0)
    expect(data.zones.length).toBeGreaterThan(0)
  })

  it('建筑数量与路网数量符合当前数据基线', () => {
    expect(data.buildings).toHaveLength(97)
    expect(data.roads).toHaveLength(135)
  })

  it('每个建筑都有合法的 position 与非负 height', () => {
    for (const b of data.buildings) {
      expect(b.position).toHaveLength(2)
      expect(Number.isFinite(b.position[0])).toBe(true)
      expect(Number.isFinite(b.position[1])).toBe(true)
      expect(b.height).toBeGreaterThanOrEqual(0)
    }
  })

  it('每条道路至少有 2 个点且坐标有限', () => {
    for (const r of data.roads) {
      expect(r.points.length).toBeGreaterThanOrEqual(2)
      for (const [x, z] of r.points) {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(z)).toBe(true)
      }
    }
  })
})
