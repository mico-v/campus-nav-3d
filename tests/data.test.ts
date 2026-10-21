import { describe, it, expect } from 'vitest'
import { createDefaultCampusData, prepareCampusData } from '../src/data/campusData'

describe('campus 数据完整性', () => {
  const data = createDefaultCampusData()

  it('顶层集合存在且非空', () => {
    expect(data.buildings.length).toBeGreaterThan(0)
    expect(data.zones.length).toBeGreaterThan(0)
  })

  it('建筑与路网集合具有稳定的唯一 ID', () => {
    expect(data.buildings.length).toBeGreaterThan(0)
    expect(new Set(data.buildings.map((building) => building.id)).size).toBe(data.buildings.length)
    expect(new Set(data.roads.map((road) => road.id)).size).toBe(data.roads.length)
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

  it('默认数据包含与道路来源一致的可寻路拓扑', () => {
    expect(data.roadNetwork?.nodes.length).toBeGreaterThan(0)
    expect(data.roadNetwork?.segments.length).toBeGreaterThan(0)
    expect(data.roadNetwork?.nodes.every((node) => (node.sourceIds?.length ?? 0) > 0)).toBe(true)
    expect(data.roadNetwork?.segments.every((segment) => (segment.sourceIds?.length ?? 0) > 0)).toBe(true)
  })

  it('包含按参考图补齐的河道与慢行步道', () => {
    const rivers = data.waters.filter((water) => water.id.startsWith('river-'))
    const walkways = data.roads.filter((road) => road.roadClass === 'walkway')
    expect(rivers.length).toBeGreaterThanOrEqual(5)
    expect(walkways.length).toBeGreaterThanOrEqual(10)
    expect(rivers.every((water) => (water.footprint?.length ?? 0) >= 3)).toBe(true)
  })

  it('编辑器载入数据也应用同一套高度修正且不修改源数据', () => {
    const source = JSON.parse(JSON.stringify(data)) as typeof data
    const library = source.buildings.find((building) => building.name === '图书馆')!
    library.height = 100

    const prepared = prepareCampusData(source)

    expect(prepared.buildings.find((building) => building.name === '图书馆')?.height).toBe(40)
    expect(library.height).toBe(100)
  })
})
