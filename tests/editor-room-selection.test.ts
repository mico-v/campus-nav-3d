// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { selectionKey, type Selection } from '../src/editor/types.ts'
import { findRoom, validateRooms } from '../src/editor/roomOps.ts'
import type { CampusData } from '../src/data/campusData.ts'

function dataWithRooms(): CampusData {
  return {
    name: 't',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [
      {
        id: 'place-14',
        name: '二食堂',
        footprint: [[0, 0], [40, 0], [40, 20], [0, 20]],
        height: 10,
        floors: [
          {
            level: 0,
            name: '1F',
            rooms: [
              { id: 'kfc', name: 'KFC', kind: 'service' },
              { id: 'noodle', name: '面点档口', kind: 'dining' },
            ],
          },
          { level: 1, name: '2F', rooms: [{ id: 'coffee', name: '肯悦咖啡', kind: 'service' }] },
        ],
      },
    ],
    pois: [],
    trees: [],
  } as unknown as CampusData
}

describe('selectionKey：房间用三段 id，不跟下标', () => {
  it('房间 key 由 buildingId + floorLevel + roomId 组成', () => {
    const sel: Selection = { kind: 'room', buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    expect(selectionKey(sel)).toBe('room:place-14:0:kfc')
  })

  it('同层不同房间、同房间不同层都是不同的 key', () => {
    const a: Selection = { kind: 'room', buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    const b: Selection = { kind: 'room', buildingId: 'place-14', floorLevel: 0, roomId: 'noodle' }
    const c: Selection = { kind: 'room', buildingId: 'place-14', floorLevel: 1, roomId: 'kfc' }
    expect(new Set([selectionKey(a), selectionKey(b), selectionKey(c)]).size).toBe(3)
  })

  it('旧的选择类型行为不变（下标 / road-node / null）', () => {
    expect(selectionKey({ kind: 'building', index: 3 })).toBe('building:3')
    expect(selectionKey({ kind: 'road-node', id: 'n7' })).toBe('road-node:n7')
    expect(selectionKey(null)).toBe('none')
  })

  it('楼层里删掉房间后，按三段 id 仍然找得到 / 找不到', () => {
    const data = dataWithRooms()
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    expect(findRoom(data, ref)?.name).toBe('KFC')
    data.buildings[0].floors![0].rooms = [{ id: 'noodle', name: '面点档口', kind: 'dining' }]
    expect(findRoom(data, ref)).toBeUndefined()
  })
})

describe('真实数据形状：二食堂 4 个房间', () => {
  it('一层 3 个二层 1 个，全无 polygon → 4 条 warning，0 条 error', () => {
    const data = dataWithRooms()
    data.buildings[0].floors![0].rooms = [
      { id: 'kfc', name: 'KFC', kind: 'service' },
      { id: 'noodle', name: '面点档口', kind: 'dining' },
      { id: 'hot', name: '热炒档口', kind: 'dining' },
    ]
    const issues = validateRooms(data)
    expect(issues).toHaveLength(4)
    expect(issues.every((issue) => issue.level === 'warning' && issue.code === 'missing-polygon')).toBe(true)
  })

  it('给一层房间补上互不重叠的 polygon 后，warning 只剩二层那一个', () => {
    const data = dataWithRooms()
    const floor = data.buildings[0].floors![0]
    floor.rooms = [
      { id: 'kfc', name: 'KFC', kind: 'service', polygon: [[1, 1], [10, 1], [10, 9], [1, 9]] },
      { id: 'noodle', name: '面点档口', kind: 'dining', polygon: [[12, 1], [20, 1], [20, 9], [12, 9]] },
    ]
    const issues = validateRooms(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].ref?.roomId).toBe('coffee')
  })
})
