import { describe, expect, it } from 'vitest'
import { createDefaultCampusData } from '../data/campusData'
import { searchEntities } from './panel'

describe('main map entity search', () => {
  it('finds buildings and POIs by name, id, or kind', () => {
    const data = createDefaultCampusData()
    const building = data.buildings[0]
    expect(searchEntities(data, building.name).some((item) => item.kind === 'building' && item.id === building.id)).toBe(true)
    const poiData = {
      ...data,
      pois: [{ id: 'test-gate', name: '测试门', kind: 'gate' as const, position: [0, 0, 0] as [number, number, number] }],
    }
    expect(searchEntities(poiData, 'gate').some((item) => item.kind === 'poi')).toBe(true)
  })

  it('returns no results for an unknown query and ignores surrounding whitespace', () => {
    const data = createDefaultCampusData()
    expect(searchEntities(data, '   does-not-exist   ')).toEqual([])
    expect(searchEntities(data, ` ${data.buildings[0].id} `)[0].id).toBe(data.buildings[0].id)
  })
})
