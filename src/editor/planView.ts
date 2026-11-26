/**
 * 建模页「平面视图」的纯几何层：坐标变换、视图框、房间多边形兜底。
 *
 * 这一层不碰 DOM，可以单测。室内建模要的是「正交俯视的一层平面」，
 * 所以用世界坐标 (x, z) 直接投到 SVG 的 (x, y)，不做透视。
 */
import type { CampusFloor, CampusRoom } from '../data/pack-schema.ts'
import type { CampusBuilding, Point } from '../../packages/campus-schema/src/index.ts'

export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface PlanGeometry {
  /** 楼板外轮廓（本层 footprint 优先，退回建筑 footprint） */
  outline: Point[]
  outlineSource: 'floor' | 'building' | 'none'
  /** 房间面：有 polygon 用 polygon，没有就用占位格 */
  rooms: Array<{ room: CampusRoom; ring: Point[]; placeholder: boolean }>
  /** 建议的视图框（贴合 outline，留 padding） */
  viewBox: ViewBox
}

const DEFAULT_PADDING = 6

function isValidRing(ring: unknown): ring is Point[] {
  if (!Array.isArray(ring) || ring.length < 3) return false
  return ring.every(
    (point) =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  )
}

function ringBounds(ring: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, z] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minY) minY = z
    if (z > maxY) maxY = z
  }
  return { minX, minY, maxX, maxY }
}

/** 把一堆环包成一个视图框，空输入给 1x1 兜底（避免 SVG 宽高为 0） */
export function viewBoxOf(rings: Point[][], padding = DEFAULT_PADDING): ViewBox {
  const valid = rings.filter(isValidRing)
  if (valid.length === 0) return { minX: -padding, minY: -padding, width: padding * 2 || 1, height: padding * 2 || 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of valid) {
    const bounds = ringBounds(ring)
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  }
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
  }
}

/** 环 → SVG path 的 d 属性（闭合） */
export function ringToPath(ring: Point[]): string {
  if (!isValidRing(ring)) return ''
  const [first, ...rest] = ring
  const parts = [`M ${round(first[0])} ${round(first[1])}`]
  for (const [x, z] of rest) parts.push(`L ${round(x)} ${round(z)}`)
  parts.push('Z')
  return parts.join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 没有 polygon 的房间在 outline 里排一格占位，方便建模页「看得见、点得着」，但不是真实几何。
 * 这样做是因为现有数据里 4 个房间 polygon 全是空的 —— 不画占位，平面视图就是一张空楼板。
 */
export function layoutPlaceholderRooms(outline: Point[], count: number): Point[][] {
  if (!isValidRing(outline) || count <= 0) return []
  const { minX, minY, maxX, maxY } = ringBounds(outline)
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const cellW = width / columns
  const cellH = height / rows
  const gap = Math.min(cellW, cellH) * 0.12
  const cells: Point[][] = []
  for (let index = 0; index < count; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x0 = minX + column * cellW + gap / 2
    const y0 = minY + row * cellH + gap / 2
    cells.push([
      [x0, y0],
      [x0 + cellW - gap, y0],
      [x0 + cellW - gap, y0 + cellH - gap],
      [x0, y0 + cellH - gap],
    ])
  }
  return cells
}

/** 组装一层的平面几何 */
export function floorPlan(
  building: CampusBuilding | undefined,
  level: number,
): PlanGeometry {
  const floors: Array<Partial<CampusFloor> & { level: number }> = Array.isArray(building?.floors) ? building!.floors : []
  const floor = floors.find((item) => item.level === level)
  const floorOutline = isValidRing(floor?.footprint) ? floor!.footprint! : null
  const buildingOutline = isValidRing(building?.footprint) ? building!.footprint : null
  const outline = floorOutline ?? buildingOutline ?? []
  const outlineSource: PlanGeometry['outlineSource'] = floorOutline
    ? 'floor'
    : buildingOutline
      ? 'building'
      : 'none'

  const rooms = Array.isArray(floor?.rooms) ? floor!.rooms! : []
  const needsPlaceholder = rooms.filter((room) => !isValidRing(room.polygon))

  let placeholders: Point[][] = []
  if (outlineSource !== 'none' && needsPlaceholder.length > 0) {
    const reserved = new Set(needsPlaceholder.map((room) => room.id))
    placeholders = layoutPlaceholderRooms(outline, needsPlaceholder.length)
    let cursor = 0
    const withPlaceholder = rooms.map((room) => {
      if (!reserved.has(room.id) && isValidRing(room.polygon)) {
        return { room, ring: room.polygon, placeholder: false }
      }
      const ring = placeholders[cursor] ?? []
      cursor += 1
      return { room, ring, placeholder: true }
    })
    return {
      outline,
      outlineSource,
      rooms: withPlaceholder,
      viewBox: viewBoxOf([outline, ...withPlaceholder.map((item) => item.ring)]),
    }
  }

  const resolved = rooms.map((room) => ({
    room,
    ring: isValidRing(room.polygon) ? room.polygon : [],
    placeholder: false,
  }))
  return {
    outline,
    outlineSource,
    rooms: resolved.filter((item) => item.ring.length > 0),
    viewBox: viewBoxOf(outline.length ? [outline] : []),
  }
}

/** 平面里房间的居中标签位置 */
export function ringCenter(ring: Point[]): Point {
  if (!isValidRing(ring)) return [0, 0]
  const { minX, minY, maxX, maxY } = ringBounds(ring)
  return [round((minX + maxX) / 2), round((minY + maxY) / 2)]
}

export { isValidRing }
