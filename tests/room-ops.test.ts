import { describe, expect, it } from 'vitest'
import {
  addRoom,
  deleteRoomVertex,
  findRoom,
  insertRoomVertex,
  isValidRing,
  moveRoomVertex,
  nextRoomId,
  pointInRing,
  promotePlaceholder,
  removeRoom,
  ringsOverlap,
  setRoomPolygon,
  updateRoom,
  validateRooms,
} from '../src/editor/roomOps.ts'
import type { CampusData } from '../src/data/campusData.ts'

const buildingOutline = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
] as Array<[number, number]>

function makeData(rooms: unknown[] = []): CampusData {
  return {
    name: '测试校区',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [
      {
        id: 'place-14',
        name: '二食堂',
        footprint: buildingOutline,
        height: 10,
        floors: [
          { level: 0, name: '1F', rooms: rooms as never },
          { level: 1, name: '2F', rooms: [] },
        ],
      },
    ],
    pois: [],
    trees: [],
  } as unknown as CampusData
}

describe('pointInRing / ringsOverlap', () => {
  it('点在框内为 true，框外为 false', () => {
    expect(pointInRing([20, 10], buildingOutline)).toBe(true)
    expect(pointInRing([-1, 10], buildingOutline)).toBe(false)
    expect(pointInRing([41, 10], buildingOutline)).toBe(false)
  })

  it('分离的环不算重叠，相交算', () => {
    const a = [[0, 0], [10, 0], [10, 10], [0, 10]] as Array<[number, number]>
    const b = [[20, 20], [30, 20], [30, 30], [20, 30]] as Array<[number, number]>
    const c = [[5, 5], [15, 5], [15, 15], [5, 15]] as Array<[number, number]>
    expect(ringsOverlap(a, b)).toBe(false)
    expect(ringsOverlap(a, c)).toBe(true)
  })
})

describe('addRoom / removeRoom', () => {
  it('新房间落在楼板中心，id 不冲突，默认 4 个点', () => {
    const data = makeData([{ id: 'room-01', name: '已有的' }])
    const ref = addRoom(data, 'place-14', 0)
    expect(ref.roomId).toBe('room-02')
    const room = findRoom(data, ref)!
    expect(room.polygon).toHaveLength(4)
    const xs = room.polygon!.map((p) => p[0])
    const ys = room.polygon!.map((p) => p[1])
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(40)
    expect(Math.min(...ys)).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(20)
  })

  it('指定已占用的 id 会被换成新 id，不覆盖已有房间', () => {
    const data = makeData([{ id: 'room-01', name: '已有的' }])
    const ref = addRoom(data, 'place-14', 0, { id: 'room-01', name: '想抢 id 的' })
    expect(ref.roomId).not.toBe('room-01')
    expect(data.buildings[0].floors![0].rooms).toHaveLength(2)
  })

  it('楼层不存在时抛错，不静默建到别层', () => {
    const data = makeData()
    expect(() => addRoom(data, 'place-14', 9)).toThrow('楼层不存在')
  })

  it('删除存在与不存在的房间', () => {
    const data = makeData([{ id: 'r1', name: 'a' }])
    expect(removeRoom(data, { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' })).toBe(true)
    expect(data.buildings[0].floors![0].rooms).toHaveLength(0)
    expect(removeRoom(data, { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' })).toBe(false)
  })
})

describe('顶点编辑', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10]] as Array<[number, number]>

  it('移动顶点', () => {
    const data = makeData([{ id: 'r1', name: 'a', polygon: ring.map((p) => [...p]) }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    expect(moveRoomVertex(data, ref, 1, [12, 1])).toBe(true)
    expect(findRoom(data, ref)!.polygon![1]).toEqual([12, 1])
    expect(moveRoomVertex(data, ref, 9, [0, 0])).toBe(false)
  })

  it('插入与删除顶点，少于 3 点不许删', () => {
    const data = makeData([{ id: 'r1', name: 'a', polygon: ring.map((p) => [...p]) }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    const index = insertRoomVertex(data, ref, 0, [5, -2])
    expect(index).toBe(1)
    expect(findRoom(data, ref)!.polygon).toHaveLength(5)

    expect(deleteRoomVertex(data, ref, 1)).toBe(true)
    expect(findRoom(data, ref)!.polygon).toHaveLength(4)

    const triangle = makeData([{ id: 'r2', name: 'b', polygon: [[0, 0], [1, 0], [1, 1]] }])
    expect(deleteRoomVertex(triangle, { buildingId: 'place-14', floorLevel: 0, roomId: 'r2' }, 0)).toBe(false)
  })

  it('setRoomPolygon 去掉重复的闭合点', () => {
    const data = makeData([{ id: 'r1', name: 'a' }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    setRoomPolygon(data, ref, [[0, 0], [5, 0], [5, 5], [0, 0]])
    expect(findRoom(data, ref)!.polygon).toHaveLength(3)
  })
})

describe('promotePlaceholder', () => {
  it('没 polygon 的房间能转真几何，已有几何的不许覆盖', () => {
    const data = makeData([{ id: 'r1', name: 'KFC' }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    expect(promotePlaceholder(data, ref, [[1, 1], [5, 1], [5, 5]])).toBe(true)
    expect(findRoom(data, ref)!.polygon).toHaveLength(3)
    expect(promotePlaceholder(data, ref, [[2, 2], [6, 2], [6, 6]])).toBe(false)
  })

  it('非法环不写进去', () => {
    const data = makeData([{ id: 'r1', name: 'KFC' }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    expect(promotePlaceholder(data, ref, [[1, 1], [2, 2]])).toBe(false)
    expect(findRoom(data, ref)!.polygon).toBeUndefined()
  })
})

describe('updateRoom / nextRoomId / isValidRing', () => {
  it('改名字与类型', () => {
    const data = makeData([{ id: 'r1', name: '旧名', kind: 'dining' }])
    const ref = { buildingId: 'place-14', floorLevel: 0, roomId: 'r1' }
    expect(updateRoom(data, ref, { name: '肯悦咖啡', kind: 'shop' })).toBe(true)
    expect(findRoom(data, ref)).toMatchObject({ name: '肯悦咖啡', kind: 'shop' })
  })

  it('nextRoomId 跳过已占用的编号', () => {
    expect(nextRoomId({ level: 0, name: '1F', rooms: [{ id: 'room-01', name: 'a' }, { id: 'room-02', name: 'b' }] })).toBe(
      'room-03',
    )
  })

  it('isValidRing 的边界', () => {
    expect(isValidRing([[0, 0], [1, 0], [1, 1]])).toBe(true)
    expect(isValidRing([[0, 0], [1, 0]])).toBe(false)
    expect(isValidRing([[0, 0], [1, Number.NaN], [1, 1]])).toBe(false)
    expect(isValidRing(null)).toBe(false)
  })
})

describe('validateRooms：campusValidation 不查房间，这里补上', () => {
  it('真实数据形状：24 个房间全无 polygon → 全 warning，不是 error', () => {
    const rooms = Array.from({ length: 24 }, (_, index) => ({ id: `r${index}`, name: `房间${index}` }))
    const data = makeData(rooms)
    const issues = validateRooms(data)
    expect(issues).toHaveLength(24)
    expect(issues.every((issue) => issue.code === 'missing-polygon' && issue.level === 'warning')).toBe(true)
  })

  it('顶点落在楼板外报 outside-outline', () => {
    const data = makeData([{ id: 'r1', name: 'a', polygon: [[0, 0], [50, 0], [50, 5], [0, 5]] }])
    const issues = validateRooms(data)
    expect(issues.some((issue) => issue.code === 'outside-outline' && issue.level === 'error')).toBe(true)
  })

  it('同层两个房间重叠报 overlap', () => {
    const data = makeData([
      { id: 'r1', name: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      { id: 'r2', name: 'b', polygon: [[5, 5], [15, 5], [15, 15], [5, 15]] },
    ])
    expect(validateRooms(data).some((issue) => issue.code === 'overlap')).toBe(true)
  })

  it('不同楼层的房间不算重叠', () => {
    const data = makeData([{ id: 'r1', name: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }])
    data.buildings[0].floors![1].rooms = [{ id: 'r2', name: 'b', polygon: [[5, 5], [15, 5], [15, 15], [5, 15]] }]
    expect(validateRooms(data).some((issue) => issue.code === 'overlap')).toBe(false)
  })

  it('id 重复与非法楼层引用', () => {
    const data = makeData([
      { id: 'dup', name: 'a', polygon: [[0, 0], [5, 0], [5, 5]] },
      { id: 'dup', name: 'b' },
      { id: 'r3', name: 'c', level: 9 },
    ])
    const codes = validateRooms(data).map((issue) => issue.code)
    expect(codes).toContain('duplicate-id')
    expect(codes).toContain('bad-level')
  })

  it('合法的房间不报错', () => {
    const data = makeData([{ id: 'r1', name: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }])
    expect(validateRooms(data)).toEqual([])
  })
})
