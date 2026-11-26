/**
 * 室内房间的编辑操作：在 CampusData 上做纯数据变换，由编辑器 store.mutate 包一层 undo。
 *
 * 现状（查过真实数据）：4 栋楼 5 层 24 个房间，`polygon` 全空，且 `src/data/campusValidation.ts`
 * 根本不校验 rooms —— 所以「保存成功」不代表室内数据没错。这里补一份房间自己的校验，
 * 让建模页能在保存前把问题说出来。
 */
import type { CampusData } from '../data/campusData.ts'
import type { CampusBuilding, CampusFloor, CampusRoom, Point } from '../../packages/campus-schema/src/index.ts'

export interface RoomRef {
  buildingId: string
  /** 房间挂在哪一层（CampusFloor.level） */
  floorLevel: number
  roomId: string
}

export interface RoomIssue {
  level: 'error' | 'warning'
  code: 'open-ring' | 'too-few-points' | 'outside-outline' | 'overlap' | 'duplicate-id' | 'missing-polygon' | 'bad-level'
  message: string
  ref?: RoomRef
}

const MIN_RING_POINTS = 3

export function isFinitePoint(point: unknown): point is Point {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite((point as number[])[0]) &&
    Number.isFinite((point as number[])[1])
  )
}

export function isValidRing(ring: unknown): ring is Point[] {
  return Array.isArray(ring) && ring.length >= MIN_RING_POINTS && ring.every(isFinitePoint)
}

/** 找建筑 */
export function findBuilding(data: CampusData, buildingId: string): CampusBuilding | undefined {
  return (data.buildings as unknown as CampusBuilding[]).find((building) => building.id === buildingId)
}

/** 找楼层 */
export function findFloor(data: CampusData, buildingId: string, level: number): CampusFloor | undefined {
  const floors = (findBuilding(data, buildingId)?.floors ?? []) as unknown as CampusFloor[]
  return floors.find((floor) => floor.level === level)
}

/** 找房间 */
export function findRoom(data: CampusData, ref: RoomRef): CampusRoom | undefined {
  return findFloor(data, ref.buildingId, ref.floorLevel)?.rooms?.find((room) => room.id === ref.roomId)
}

/** 浅环判定（闭合的多边形里首尾相同视为显式闭合，落盘时去掉重复点） */
function normalizeRing(ring: Point[]): Point[] {
  const points = ring.map(([x, z]) => [x, z] as Point)
  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) points.pop()
  }
  return points
}

/** 射线法：点是否在多边形内 */
export function pointInRing(point: Point, ring: Point[]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 环的包围盒 */
export function ringBounds(ring: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** 两个环的包围盒是否明显重叠（够用就行的粗判，不做精确多边形相交） */
export function ringsOverlap(a: Point[], b: Point[]): boolean {
  if (!isValidRing(a) || !isValidRing(b)) return false
  const ra = ringBounds(a)
  const rb = ringBounds(b)
  const overlapX = Math.min(ra.maxX, rb.maxX) - Math.max(ra.minX, rb.minX)
  const overlapY = Math.min(ra.maxY, rb.maxY) - Math.max(ra.minY, rb.minY)
  if (overlapX <= 0 || overlapY <= 0) return false
  // 中心点落在对方内部也算重叠（处理包含关系）
  return overlapX * overlapY > 1e-6
}

/** 生成一个不与现有 id 冲突的房间 id */
export function nextRoomId(floor: CampusFloor | undefined, seed = 'room'): string {
  const used = new Set((floor?.rooms ?? []).map((room) => room.id))
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${seed}-${String(index).padStart(2, '0')}`
    if (!used.has(candidate)) return candidate
  }
  return `${seed}-${Date.now()}`
}

/** 在楼层上新建房间（按 outline 中心给一个小方框，等用户拖） */
export function addRoom(
  data: CampusData,
  buildingId: string,
  floorLevel: number,
  init: Partial<CampusRoom> = {},
): RoomRef {
  const floor = findFloor(data, buildingId, floorLevel)
  if (!floor) throw new Error(`楼层不存在：${buildingId} / ${floorLevel}`)
  if (!Array.isArray(floor.rooms)) floor.rooms = []

  const outline = isValidRing(floor.footprint)
    ? floor.footprint
    : ((findBuilding(data, buildingId)?.footprint ?? []) as unknown as Point[])
  const bounds = isValidRing(outline) ? ringBounds(outline) : { minX: 0, minY: 0, maxX: 20, maxY: 20 }
  const size = Math.max(Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.18, 2)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2

  const id = init.id && !floor.rooms.some((room) => room.id === init.id) ? init.id : nextRoomId(floor)
  const room: CampusRoom = {
    id,
    name: init.name ?? '新房间',
    kind: init.kind ?? 'other',
    level: init.level ?? floorLevel,
    polygon: init.polygon ?? [
      [cx - size / 2, cy - size / 2],
      [cx + size / 2, cy - size / 2],
      [cx + size / 2, cy + size / 2],
      [cx - size / 2, cy + size / 2],
    ],
  }
  floor.rooms.push(room)
  return { buildingId, floorLevel, roomId: room.id }
}

/** 删除房间 */
export function removeRoom(data: CampusData, ref: RoomRef): boolean {
  const floor = findFloor(data, ref.buildingId, ref.floorLevel)
  if (!floor?.rooms) return false
  const index = floor.rooms.findIndex((room) => room.id === ref.roomId)
  if (index < 0) return false
  floor.rooms.splice(index, 1)
  return true
}

/** 改房间字段（name / kind / level / aliases）。kind 收 string，方便表单直接把输入扔进来 */
export function updateRoom(
  data: CampusData,
  ref: RoomRef,
  patch: Partial<Omit<CampusRoom, 'id' | 'kind'>> & { kind?: string },
): boolean {
  const room = findRoom(data, ref)
  if (!room) return false
  Object.assign(room, patch)
  return true
}

/** 整体替换 polygon（拖点结束 / 占位格转真几何都走这里） */
export function setRoomPolygon(data: CampusData, ref: RoomRef, ring: Point[]): boolean {
  const room = findRoom(data, ref)
  if (!room) return false
  room.polygon = normalizeRing(ring)
  return true
}

/** 移动第 index 个顶点 */
export function moveRoomVertex(data: CampusData, ref: RoomRef, index: number, point: Point): boolean {
  const room = findRoom(data, ref)
  if (!room?.polygon || index < 0 || index >= room.polygon.length) return false
  room.polygon[index] = [point[0], point[1]]
  return true
}

/** 在最近的边上插入一个顶点，返回新顶点索引 */
export function insertRoomVertex(data: CampusData, ref: RoomRef, afterIndex: number, point: Point): number {
  const room = findRoom(data, ref)
  if (!room?.polygon) return -1
  const at = Math.max(0, Math.min(afterIndex, room.polygon.length - 1))
  room.polygon.splice(at + 1, 0, [point[0], point[1]])
  return at + 1
}

/** 删除第 index 个顶点；少于 3 个点时拒绝 */
export function deleteRoomVertex(data: CampusData, ref: RoomRef, index: number): boolean {
  const room = findRoom(data, ref)
  if (!room?.polygon || room.polygon.length <= MIN_RING_POINTS) return false
  if (index < 0 || index >= room.polygon.length) return false
  room.polygon.splice(index, 1)
  return true
}

/** 占位转真几何：没有 polygon 的房间补上给定环（用户在平面上刚描的那条） */
export function promotePlaceholder(data: CampusData, ref: RoomRef, ring: Point[]): boolean {
  const room = findRoom(data, ref)
  if (!room) return false
  if (isValidRing(room.polygon)) return false
  if (!isValidRing(ring)) return false
  room.polygon = normalizeRing(ring)
  return true
}

/**
 * 房间级校验。campusValidation.ts 不查 rooms，所以这份是补的：
 * 顶点数、outline 包含、同层重叠、id 重复、跨层引用。
 */
export function validateRooms(data: CampusData): RoomIssue[] {
  const issues: RoomIssue[] = []
  for (const building of data.buildings) {
    const buildingOutline = isValidRing(building.footprint) ? building.footprint : null
    const seenIds = new Set<string>()
    for (const floor of building.floors ?? []) {
      const outline = isValidRing(floor.footprint) ? floor.footprint : buildingOutline
      const withPolygon: Array<{ ref: RoomRef; ring: Point[] }> = []
      for (const room of floor.rooms ?? []) {
        const ref: RoomRef = { buildingId: building.id, floorLevel: floor.level, roomId: room.id }
        if (seenIds.has(room.id)) {
          issues.push({ level: 'error', code: 'duplicate-id', message: `房间 id 重复：${room.id}`, ref })
        }
        seenIds.add(room.id)

        if (room.level !== undefined && !(building.floors ?? []).some((item) => item.level === room.level)) {
          issues.push({
            level: 'error',
            code: 'bad-level',
            message: `房间 ${room.name} 指向不存在的楼层 ${room.level}`,
            ref,
          })
        }

        if (room.polygon === undefined) {
          issues.push({ level: 'warning', code: 'missing-polygon', message: `房间 ${room.name} 还没描轮廓`, ref })
          continue
        }
        if (!Array.isArray(room.polygon) || room.polygon.length < MIN_RING_POINTS) {
          issues.push({
            level: 'error',
            code: 'too-few-points',
            message: `房间 ${room.name} 顶点不足 3 个`,
            ref,
          })
          continue
        }
        if (!room.polygon.every(isFinitePoint)) {
          issues.push({ level: 'error', code: 'open-ring', message: `房间 ${room.name} 有非法坐标`, ref })
          continue
        }
        if (outline) {
          const outside = room.polygon.filter((point) => !pointInRing(point, outline))
          if (outside.length > 0) {
            issues.push({
              level: 'error',
              code: 'outside-outline',
              message: `房间 ${room.name} 有 ${outside.length} 个顶点落在楼板外`,
              ref,
            })
          }
        }
        withPolygon.push({ ref, ring: room.polygon })
      }

      for (let i = 0; i < withPolygon.length; i += 1) {
        for (let j = i + 1; j < withPolygon.length; j += 1) {
          if (ringsOverlap(withPolygon[i].ring, withPolygon[j].ring)) {
            issues.push({
              level: 'warning',
              code: 'overlap',
              message: `房间 ${withPolygon[i].ref.roomId} 与 ${withPolygon[j].ref.roomId} 轮廓重叠`,
              ref: withPolygon[i].ref,
            })
          }
        }
      }
    }
  }
  return issues
}
