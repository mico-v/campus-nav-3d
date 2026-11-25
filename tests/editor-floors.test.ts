// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CampusData } from '../src/data/campusData.ts'
import { clampFloor, floorRangeOf, floorRoomsOf, levelRange, listBuildingConnectors } from '../src/editor/floors.ts'

function data(): CampusData {
  return {
    name: 't',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
  }
}

describe('editor floors 纯函数', () => {
  it('levelRange 排序去重，并兼容空数据', () => {
    expect(levelRange([2, -1, 0, 2])).toEqual([-1, 0, 2])
    expect(levelRange([{ index: 3, name: '4F', elevation: 0, height: 3 }, { index: 1, name: '2F', elevation: 0, height: 3 }])).toEqual([1, 3])
    expect(levelRange(undefined)).toEqual([0])
  })

  it('clampFloor 夹取到最近楼层，越界不抛错', () => {
    expect(clampFloor(1, [0, 1, 2])).toBe(1)
    expect(clampFloor(99, [0, 1, 2])).toBe(2)
    expect(clampFloor(-99, [0, 1, 2])).toBe(0)
    expect(clampFloor('x', [0, 1, 2])).toBe(0)
  })

  it('floorRangeOf 新 floors 优先，老 levels 兜底', () => {
    const d = data()
    d.buildings = [
      { id: 'b1', name: 'B1', category: 'academic', position: [0, 0], size: [10, 10], height: 12, floors: [{ level: 0, name: '1F' }, { level: 1, name: '2F' }] },
      { id: 'b2', name: 'B2', category: 'academic', position: [0, 0], size: [10, 10], height: 12, levels: [{ index: -1, name: 'B1', elevation: -3, height: 3 }, { index: 0, name: '1F', elevation: 0, height: 3 }] },
    ] as unknown as CampusData['buildings']
    expect(floorRangeOf(d.buildings[0])).toEqual([0, 1])
    expect(floorRangeOf(d.buildings[1])).toEqual([-1, 0])
  })

  it('floorRoomsOf 只读当前层 rooms，老数据返回空数组', () => {
    const d = data()
    d.buildings = [
      {
        id: 'canteen', name: '二食堂', category: 'service', position: [0, 0], size: [10, 10], height: 12,
        floors: [
          { level: 0, name: '1F', rooms: [{ id: 'kfc', name: 'KFC', aliases: ['肯德基'], kind: 'service' }] },
          { level: 1, name: '2F' },
        ],
      },
      { id: 'legacy', name: '老楼', category: 'academic', position: [0, 0], size: [10, 10], height: 12 },
    ] as unknown as CampusData['buildings']
    expect(floorRoomsOf(d.buildings[0], 0)).toEqual([{ id: 'kfc', name: 'KFC', aliases: ['肯德基'], kind: 'service' }])
    expect(floorRoomsOf(d.buildings[0], 1)).toEqual([])
    expect(floorRoomsOf(d.buildings[1], 0)).toEqual([])
    expect(floorRoomsOf(undefined, 0)).toEqual([])
  })

  it('listBuildingConnectors 从 pack connectors 取本栋连接', () => {
    const d = data()
    d.buildings = [{ id: 'b1', name: 'B1', category: 'academic', position: [0, 0], size: [10, 10], height: 12 }]
    Object.assign(d, {
      connectors: [
        { id: 'c1', kind: 'stairs', from: { building: 'b1', level: 0 }, to: { building: 'b1', level: 1 } },
        { id: 'c2', kind: 'elevator', from: { building: 'b2', level: 0 }, to: { building: 'b1', level: 1 } },
        { id: 'c3', kind: 'ramp', from: { building: 'b2', level: 0 }, to: { building: 'b2', level: 1 } },
      ],
    })
    expect(listBuildingConnectors(d, d.buildings[0])).toEqual([
      { id: 'c1', kind: 'stairs', from: 0, to: 1 },
      { id: 'c2', kind: 'elevator', from: 0, to: 1 },
    ])
  })

  it('listBuildingConnectors 老 levels[].verticals 兜底，空表返回空数组', () => {
    const d = data()
    d.buildings = [
      {
        id: 'b1', name: 'B1', category: 'academic', position: [0, 0], size: [10, 10], height: 12,
        levels: [
          { index: 0, name: '1F', elevation: 0, height: 3, verticals: [{ id: 'v1', kind: 'stairs', at: [0, 0], to: 1 }] },
        ],
      },
      { id: 'b2', name: 'B2', category: 'academic', position: [0, 0], size: [10, 10], height: 12 },
    ] as unknown as CampusData['buildings']
    expect(listBuildingConnectors(d, d.buildings[0])).toEqual([{ id: 'v1', kind: 'stairs', from: 0, to: 1 }])
    expect(listBuildingConnectors(d, d.buildings[1])).toEqual([])
  })
})
