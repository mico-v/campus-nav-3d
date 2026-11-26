import { describe, expect, it } from 'vitest'
import { floorPlan, isValidRing, layoutPlaceholderRooms, ringCenter, ringToPath, viewBoxOf } from '../src/editor/planView.ts'
import type { CampusBuilding, Point } from '../packages/campus-schema/src/index.ts'

const outline: Point[] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
]

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: 'b1',
    name: '测试楼',
    footprint: outline,
    height: 10,
    ...overrides,
  }
}

describe('viewBoxOf', () => {
  it('贴合所有环比，留 padding', () => {
    const box = viewBoxOf([outline], 4)
    expect(box).toEqual({ minX: -4, minY: -4, width: 48, height: 28 })
  })

  it('空输入给 1x1 兜底，宽高不为 0', () => {
    const box = viewBoxOf([])
    expect(box.width).toBeGreaterThan(0)
    expect(box.height).toBeGreaterThan(0)
  })

  it('退化的单点环被忽略', () => {
    const box = viewBoxOf([[[5, 5]] as unknown as Point[]], 2)
    expect(box.width).toBeGreaterThan(0)
  })
})

describe('ringToPath / ringCenter', () => {
  it('闭合路径以 Z 结尾，首点重复只画一次', () => {
    expect(ringToPath(outline)).toBe('M 0 0 L 40 0 L 40 20 L 0 20 Z')
  })

  it('环中心取包围盒中心', () => {
    expect(ringCenter(outline)).toEqual([20, 10])
  })

  it('非法环给空 path', () => {
    expect(ringToPath([[0, 0], [1, 1]] as Point[])).toBe('')
  })
})

describe('isValidRing', () => {
  it('三点以上、数字、成对才有效', () => {
    expect(isValidRing(outline)).toBe(true)
    expect(isValidRing([[0, 0], [1, 1]] as Point[])).toBe(false)
    expect(isValidRing([[0, 'x'], [1, 1], [2, 2]] as unknown as Point[])).toBe(false)
    expect(isValidRing(null)).toBe(false)
  })
})

describe('layoutPlaceholderRooms：没 polygon 的房间排格子', () => {
  it('4 个房间排成 2x2，全部落在 outline 内', () => {
    const cells = layoutPlaceholderRooms(outline, 4)
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell).toHaveLength(4)
      for (const [x, y] of cell) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(40)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(20)
      }
    }
  })

  it('格子之间不重叠', () => {
    const cells = layoutPlaceholderRooms(outline, 4)
    const boxes = cells.map((cell) => {
      const xs = cell.map((p) => p[0])
      const ys = cell.map((p) => p[1])
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    })
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlapX = a.minX < b.maxX && b.minX < a.maxX
        const overlapY = a.minY < b.maxY && b.minY < a.maxY
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('outline 非法时返回空数组，不炸', () => {
    expect(layoutPlaceholderRooms([], 3)).toEqual([])
  })
})

describe('floorPlan：楼板 + 房间面', () => {
  it('本层有 footprint 用它，没有退回建筑 footprint', () => {
    const floorOutline: Point[] = [[2, 2], [10, 2], [10, 8], [2, 8]]
    const withFloor = floorPlan(
      building({ floors: [{ level: 0, name: '1F', footprint: floorOutline, rooms: [] }] }),
      0,
    )
    expect(withFloor.outline).toEqual(floorOutline)
    expect(withFloor.outlineSource).toBe('floor')

    const fallback = floorPlan(building({ floors: [{ level: 0, name: '1F', rooms: [] }] }), 0)
    expect(fallback.outline).toEqual(outline)
    expect(fallback.outlineSource).toBe('building')
  })

  it('房间有真 polygon 时原样用，不生成占位', () => {
    const roomPoly: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const plan = floorPlan(
      building({
        floors: [{ level: 0, name: '1F', rooms: [{ id: 'r1', name: 'KFC', polygon: roomPoly }] }],
      }),
      0,
    )
    expect(plan.rooms).toHaveLength(1)
    expect(plan.rooms[0]).toMatchObject({ placeholder: false })
    expect(plan.rooms[0].ring).toEqual(roomPoly)
  })

  it('房间全都没 polygon（当前真实数据的样子）时给占位格，数量对得上', () => {
    const plan = floorPlan(
      building({
        floors: [
          {
            level: 0,
            name: '1F',
            rooms: [
              { id: 'a', name: 'KFC', kind: 'service' },
              { id: 'b', name: '面点档口', kind: 'dining' },
              { id: 'c', name: '热炒档口', kind: 'dining' },
              { id: 'd', name: '咖啡', kind: 'shop' },
            ],
          },
        ],
      }),
      0,
    )
    expect(plan.rooms).toHaveLength(4)
    expect(plan.rooms.every((item) => item.placeholder)).toBe(true)
    expect(plan.rooms.every((item) => item.ring.length === 4)).toBe(true)
    expect(plan.viewBox.width).toBeGreaterThan(0)
  })

  it('混合情况：有 polygon 的用真几何，没的给占位，顺序与数据一致', () => {
    const roomPoly: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const plan = floorPlan(
      building({
        floors: [
          {
            level: 0,
            name: '1F',
            rooms: [
              { id: 'a', name: '有面', polygon: roomPoly },
              { id: 'b', name: '没面' },
            ],
          },
        ],
      }),
      0,
    )
    expect(plan.rooms.map((item) => item.room.id)).toEqual(['a', 'b'])
    expect(plan.rooms[0].placeholder).toBe(false)
    expect(plan.rooms[1].placeholder).toBe(true)
  })

  it('楼层不存在 / 建筑为空时返回空平面而不是抛错', () => {
    const missing = floorPlan(building({ floors: [] }), 3)
    expect(missing.rooms).toEqual([])
    expect(missing.outlineSource).toBe('building')

    const nothing = floorPlan(undefined, 0)
    expect(nothing.outline).toEqual([])
    expect(nothing.outlineSource).toBe('none')
    expect(nothing.viewBox.width).toBeGreaterThan(0)
  })
})
