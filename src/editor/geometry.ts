export type Point = [number, number]

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function polygonCentroid(points: Point[]): Point {
  let area2 = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i]
    const [x2, z2] = points[(i + 1) % points.length]
    const cross = x1 * z2 - x2 * z1
    area2 += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  }
  if (Math.abs(area2) < 1e-9) {
    // Degenerate polygon — fall back to the average of the vertices.
    const sum = points.reduce<Point>((acc, [x, z]) => [acc[0] + x, acc[1] + z], [0, 0])
    return [sum[0] / points.length, sum[1] / points.length]
  }
  const area = area2 / 2
  return [cx / (6 * area), cz / (6 * area)]
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  depth: number
}

export function polygonBounds(points: Point[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ }
}

/** Insert `at` immediately after `edgeIndex` (i.e. between edgeIndex and edgeIndex+1). */
export function insertVertex(points: Point[], edgeIndex: number, at: Point): Point[] {
  const result = points.slice()
  result.splice(edgeIndex + 1, 0, [at[0], at[1]])
  return result
}

/** Remove vertex at `index`; refuses (returns the original array) when fewer than 4 vertices. */
export function removeVertex(points: Point[], index: number): Point[] {
  if (points.length <= 3) return points
  const result = points.slice()
  result.splice(index, 1)
  return result
}

export function moveVertex(points: Point[], index: number, to: Point): Point[] {
  const result = points.slice()
  result[index] = [to[0], to[1]]
  return result
}

export function nearestVertex(points: Point[], target: Point, maxDist: number): number | null {
  let best: number | null = null
  let bestDist = maxDist
  for (let i = 0; i < points.length; i++) {
    const d = distance(points[i], target)
    if (d <= bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function projectOnSegment(a: Point, b: Point, p: Point): { point: Point; dist: number } {
  const abx = b[0] - a[0]
  const abz = b[1] - a[1]
  const lenSq = abx * abx + abz * abz
  let t = lenSq > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / lenSq : 0
  t = Math.max(0, Math.min(1, t))
  const point: Point = [a[0] + abx * t, a[1] + abz * t]
  return { point, dist: distance(point, p) }
}

/**
 * Find the closest polygon/polyline edge to `target` within `maxDist`.
 * `index` is the edge's starting vertex index; inserting after it splits that edge.
 */
export function nearestEdge(
  points: Point[],
  target: Point,
  maxDist: number,
): { index: number; point: Point } | null {
  let best: { index: number; point: Point } | null = null
  let bestDist = maxDist
  for (let i = 0; i < points.length - 1; i++) {
    const { point, dist } = projectOnSegment(points[i], points[i + 1], target)
    if (dist <= bestDist) {
      bestDist = dist
      best = { index: i, point }
    }
  }
  return best
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  const [px, pz] = point
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function translatePoints(points: Point[], dx: number, dz: number): Point[] {
  return points.map(([x, z]) => [x + dx, z + dz] as Point)
}
