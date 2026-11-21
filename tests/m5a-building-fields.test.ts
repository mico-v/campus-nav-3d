// @vitest-environment happy-dom
/**
 * M5-A：建筑详情字段完整性、列表/详情同源、楼层入口复用 M2-C 能力。
 */
import { describe, expect, it } from 'vitest'
import { createDefaultCampusData, type Building, type CampusData } from '../src/data/campusData'
import { buildingFields, CATEGORY_LABELS } from '../src/ui/detail-fields'
import { renderBuildingFields, renderDetails, renderEntityList } from '../src/ui/panel'
import { indoorLevelsOf, mountIndoorLevels } from '../src/ui/indoor-levels'

function baseData(): CampusData {
  return {
    name: 'test',
    bounds: { width: 100, depth: 100 },
    zones: [{ id: 'zone-a', name: '中心区', category: 'academic', center: [0, 0], size: [10, 10], color: '#93c5fd' }],
    buildings: [],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

function fullBuilding(): Building {
  return {
    id: 'lib-1',
    name: '图书馆',
    category: 'library',
    position: [12.5, -8],
    size: [20, 10],
    height: 18,
    zoneId: 'zone-a',
    info: '馆藏丰富的自习与借阅空间',
    floors: [
      { level: -1, name: 'B1' },
      { level: 0, name: '1F' },
      { level: 2, name: '3F' },
    ],
    facilities: ['阅览室', '自习区'],
    entrance: { level: 0, name: '南门', position: [12.5, -3] },
  }
}

describe('M5-A 详情字段完整性', () => {
  it('九类字段从建筑数据落到详情 HTML', () => {
    const data = baseData()
    data.buildings.push(fullBuilding())
    const fields = buildingFields(data, data.buildings[0])
    expect(fields).toMatchObject({
      name: '图书馆',
      category: CATEGORY_LABELS.library,
      zone: '中心区',
      info: '馆藏丰富的自习与借阅空间',
      coordinate: 'X 12.5 / Z -8',
      height: '18',
      floorSummary: 'B1 · 1F · 3F',
      entrance: '南门 · 1F · X 12.5 / Z -3',
    })
    expect(fields.facilities).toEqual(['阅览室', '自习区'])
    expect(fields.entranceLevel).toBe(0)

    const html = renderBuildingFields(fields)
    for (const label of ['名称', '类别', '分区', '简介', '坐标', '高度', '楼层', '室内入口', '设施']) {
      if (label === '简介') expect(html).toContain(fields.info)
      else expect(html).toContain(`<dt>${label}</dt>`)
    }
  })

  it('旧 pack 只给 7 个必填字段时全部回落，不抛错', () => {
    const data = baseData()
    const legacy: Building = { id: 'old-1', name: '老楼', category: 'academic', position: [0, 0], size: [10, 10], height: 12 }
    data.buildings.push(legacy)
    expect(() => buildingFields(data, legacy)).not.toThrow()
    const fields = buildingFields(data, legacy)
    expect(fields.info).toBe('暂无简介')
    expect(fields.zone).toBe('未分区')
    expect(fields.floorSummary).toBe('无楼层数据')
    expect(fields.entrance).toBe('暂无入口信息')
    expect(fields.entranceLevel).toBeNull()
    expect(fields.facilitySummary).toBe('暂无设施信息')
    expect(renderBuildingFields(fields)).toContain('暂无简介')
  })

  it('默认数据集里有带楼层的真实建筑，演示入口能直接点到', () => {
    const data = createDefaultCampusData()
    const withFloors = data.buildings.filter((building) => indoorLevelsOf(building).length)
    expect(withFloors.length).toBeGreaterThan(0)
    const fields = buildingFields(data, withFloors[0])
    expect(fields.floors.length).toBeGreaterThan(0)
    expect(fields.entranceLevel).not.toBeNull()
  })

  it('字段类型脏数据（floors/facilities 非法）也不崩，按缺省回落', () => {
    const data = baseData()
    const dirty = { ...fullBuilding(), floors: 'oops', facilities: [1, null, 'ok'], entrance: { level: 9, position: 'bad' } } as unknown as Building
    data.buildings.push(dirty)
    const fields = buildingFields(data, dirty)
    expect(fields.floors).toEqual([])
    expect(fields.facilities).toEqual(['ok'])
    expect(fields.entrance).toBe('暂无入口信息')
  })
})

describe('M5-A 列表与详情同源', () => {
  it('同一 buildingId 两处渲染的字段一致（真实 pack 兜底 + 自定义数据）', () => {
    const data = baseData()
    data.buildings.push(fullBuilding())
    const list = document.createElement('div')
    const detail = document.createElement('div')
    renderEntityList(data, { kind: 'building', index: 0 }, list, '', 'all')
    renderDetails(data, { kind: 'building', index: 0 }, detail)
    const fields = buildingFields(data, data.buildings[0])

    expect(list.textContent).toContain(fields.name)
    expect(list.textContent).toContain(fields.category)
    expect(list.textContent).toContain(fields.zone)
    expect(detail.textContent).toContain(fields.name)
    expect(detail.textContent).toContain(fields.category)
    expect(detail.textContent).toContain(fields.zone)
    expect(detail.textContent).toContain(fields.coordinate)
    expect(detail.textContent).toContain(fields.floorSummary)
    expect(detail.textContent).toContain(fields.facilitySummary)

    // 真实 pack 的 7 字段建筑同样不能两处分叉
    const real = createDefaultCampusData()
    const realFields = buildingFields(real, real.buildings[0])
    const realList = document.createElement('div')
    renderEntityList(real, { kind: 'building', index: 0 }, realList, '', 'all')
    expect(realList.textContent).toContain(realFields.name)
    expect(realList.textContent).toContain(realFields.category)
    expect(realList.textContent).toContain(realFields.zone)
  })
})

describe('M5-A 楼层与室内入口复用 M2-C', () => {
  it('有楼层的建筑详情给出楼层入口，复用 indoorLevelsOf 的同一份列表', () => {
    const data = baseData()
    data.buildings.push(fullBuilding())
    const fields = buildingFields(data, data.buildings[0])
    expect(fields.floors).toEqual(indoorLevelsOf(data.buildings[0]))
    expect(fields.floorSummary).toContain('B1')
    expect(fields.entrance).toContain('1F')

    const host = document.createElement('div')
    const bar = mountIndoorLevels(host, { data, onSelect: () => {} })
    bar.update(data.buildings[0], 0)
    expect(host.hidden).toBe(false)
    expect([...host.querySelectorAll<HTMLButtonElement>('.indoor-level-btn')].map((btn) => btn.dataset.level)).toEqual(['-1', '0', '2'])
    bar.destroy()
  })

  it('无楼层建筑不显示楼层入口，列表/详情照常回落', () => {
    const data = baseData()
    data.buildings.push({ id: 'flat', name: '平房', category: 'service', position: [1, 2], size: [5, 5], height: 3 })
    const fields = buildingFields(data, data.buildings[0])
    expect(fields.floors).toEqual([])
    expect(fields.entrance).toBe('暂无入口信息')
    const host = document.createElement('div')
    const bar = mountIndoorLevels(host, { data, onSelect: () => {} })
    bar.update(data.buildings[0], null)
    expect(host.hidden).toBe(true)
    bar.destroy()
  })
})
