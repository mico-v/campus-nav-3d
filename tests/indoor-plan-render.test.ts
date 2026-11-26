import { describe, expect, it } from 'vitest'
import { floorPlan, ringCenter, ringToPath } from '../src/editor/planView.ts'
import { addRoom, promotePlaceholder, setRoomPolygon } from '../src/editor/roomOps.ts'
import type { CampusData } from '../src/data/campusData.ts'
import type { CampusFloor } from '../packages/campus-schema/src/index.ts'

/**
 * 面板本身依赖 DOM，单测只覆盖它依赖的「数据 → 可视元素」这条链：
 * 树里的计数、平面上每个房间是否排得下、描点后几何能否落盘。
 * DOM 交互留给 CI 的 ui-smoke（真浏览器）。
 */
function data(): CampusData {
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
              { id: 'hot', name: '热炒档口', kind: 'dining' },
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

describe('楼层树的计数（面板左侧要显示「已描/总数」）', () => {
  it('一层 3 个房间全占位 → 0/3 已描', () => {
    const building = data().buildings[0]
    const floor = (building.floors as unknown as CampusFloor[])[0]
    const described = (floor.rooms ?? []).filter((room) => Array.isArray(room.polygon) && room.polygon.length >= 3).length
    expect(described).toBe(0)
    expect(floor.rooms).toHaveLength(3)
  })

  it('描完一个之后是 1/3', () => {
    const d = data()
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    promotePlaceholder(d, ref, [[2, 2], [10, 2], [10, 8], [2, 8]])
    const floor = (d.buildings[0].floors as unknown as CampusFloor[])[0]
    const described = (floor.rooms ?? []).filter((room) => Array.isArray(room.polygon) && room.polygon.length >= 3).length
    expect(described).toBe(1)
  })
})

describe('平面渲染依赖的几何：每个房间都要有能画的环', () => {
  it('占位房间也能拿到 path，不会渲染成空 d 属性', () => {
    const plan = floorPlan(data().buildings[0] as never, 0)
    expect(plan.rooms).toHaveLength(3)
    for (const item of plan.rooms) {
      expect(item.placeholder).toBe(true)
      expect(ringToPath(item.ring).startsWith('M ')).toBe(true)
      expect(ringToPath(item.ring).endsWith('Z')).toBe(true)
    }
  })

  it('标签居中点落在环的包围盒中心', () => {
    const ring: Array<[number, number]> = [[0, 0], [10, 0], [10, 4], [0, 4]]
    expect(ringCenter(ring)).toEqual([5, 2])
  })

  it('描点完成后，同一层平面立刻用真几何而不是占位', () => {
    const d = data()
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    promotePlaceholder(d, ref, [[2, 2], [10, 2], [10, 8], [2, 8]])
    const plan = floorPlan(d.buildings[0] as never, 0)
    const kfc = plan.rooms.find((item) => item.room.id === 'kfc')!
    expect(kfc.placeholder).toBe(false)
    expect(kfc.ring).toHaveLength(4)
    expect(plan.rooms.filter((item) => item.placeholder)).toHaveLength(2)
  })

  it('重描已有房间会替换几何（不是叠一层）', () => {
    const d = data()
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'kfc' }
    promotePlaceholder(d, ref, [[2, 2], [10, 2], [10, 8], [2, 8]])
    setRoomPolygon(d, ref, [[30, 12], [36, 12], [36, 18], [30, 18]])
    const plan = floorPlan(d.buildings[0] as never, 0)
    const kfc = plan.rooms.find((item) => item.room.id === 'kfc')!
    expect(kfc.ring[0]).toEqual([30, 12])
  })
})

describe('新增房间后平面里能立刻看到它', () => {
  it('addRoom 之后该层房间数 +1，且新房间有可画的环', () => {
    const d = data()
    const ref = addRoom(d, 'place-14', 0)
    const plan = floorPlan(d.buildings[0] as never, 0)
    expect(plan.rooms).toHaveLength(4)
    const created = plan.rooms.find((item) => item.room.id === ref.roomId)!
    expect(created.placeholder).toBe(false)
    expect(ringToPath(created.ring)).toContain('L')
  })

  it('切到没房间的楼层，平面只剩楼板不报错', () => {
    const d = data()
    d.buildings[0].floors![1].rooms = []
    const plan = floorPlan(d.buildings[0] as never, 1)
    expect(plan.rooms).toEqual([])
    expect(plan.outline).toHaveLength(4)
    expect(plan.viewBox.width).toBeGreaterThan(0)
  })
})
