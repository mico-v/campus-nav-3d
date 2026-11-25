// @vitest-environment node
import { describe, expect, it } from 'vitest'
import packData from '../../packs/usts-tianping/campus.json'
import { createDefaultCampusData } from './campusData'

describe('pack 别名归一', () => {
  it('建筑不再保留重复 alias 字段，aliases 全部带到运行时', () => {
    const raw = packData.buildings as Array<Record<string, unknown>>
    expect(raw.filter((building) => building.alias !== undefined)).toHaveLength(0)
    expect(raw.filter((building) => Array.isArray(building.aliases) && building.aliases.length > 0)).toHaveLength(16)

    const data = createDefaultCampusData()
    expect(data.buildings.find((building) => building.id === 'place-14')?.aliases).toEqual(['一食堂'])
    expect(data.buildings.find((building) => building.id === 'osm-building-920093710')?.aliases).toContain('西区快递点')
  })

  it('POI 别名从 pack 进入运行时', () => {
    const data = createDefaultCampusData()
    expect(data.pois.find((poi) => poi.id === 'poi-m1-048')?.aliases).toEqual(['肯德基'])
    expect(data.pois.find((poi) => poi.id === 'poi-m1-054')?.aliases).toContain('西区快递点')
  })
})
