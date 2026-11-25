// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDefaultCampusData, type CampusData } from '../data/campusData'
import { editorSearchResults } from './search'

function minimalData(): CampusData {
  return {
    name: 'alias-test',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [
      { id: 'canteen-2', name: '二食堂', aliases: ['一食堂'], category: 'canteen', position: [0, 0], size: [10, 10], height: 1 },
      { id: 'canteen-3', name: '三食堂', category: 'canteen', position: [10, 0], size: [10, 10], height: 1 },
      { id: 'canteen-west', name: '西区菜鸟驿站', aliases: ['西区快递点'], category: 'service', position: [20, 0], size: [10, 10], height: 1 },
    ],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

describe('editor search reads aliases', () => {
  it('「一食堂」命中二食堂别名，且排在名字包含 term 的三食堂之前', () => {
    const results = editorSearchResults(minimalData(), '一食堂')
    expect(results[0]?.label).toBe('二食堂')
    expect(results.map((result) => result.label)).toContain('二食堂')
  })

  it('「西区快递点」命中建筑别名', () => {
    const results = editorSearchResults(minimalData(), '西区快递点')
    expect(results[0]?.label).toBe('西区菜鸟驿站')
  })

  it('精确名优先于别名命中', () => {
    const data = minimalData()
    data.pois.push({ id: 'poi-old-name', name: '一食堂', aliases: [], kind: 'service', position: [0, 0, 0] })
    const results = editorSearchResults(data, '一食堂')
    expect(results[0]?.selection).toEqual({ kind: 'poi', index: 0 })
    expect(results.findIndex((result) => result.label === '二食堂')).toBeGreaterThan(0)
  })

  it('真实数据搜索「一食堂」，二食堂出现在结果里', () => {
    const data = createDefaultCampusData()
    const results = editorSearchResults(data, '一食堂')
    expect(results.map((result) => result.label)).toContain('二食堂')
  })
})
