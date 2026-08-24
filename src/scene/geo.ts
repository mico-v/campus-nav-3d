import * as THREE from 'three'

export type Vec2 = [number, number]

// 唯一约定：数据 [x, z] -> shape 空间 Vector2(x, -z)。
// 再对几何体施加 rotateX(-PI/2)，数据点 [x, z] 即落到世界 (x, *, z)，
// 不取反、不镜像。所有平面/拉伸几何必须经此模块，禁止散落的反向写法。
export function toShapeSpace(point: Vec2): THREE.Vector2 {
  return new THREE.Vector2(point[0], -point[1])
}

// 贴地多边形（道路、地块等），位于 y=0；调用方用 mesh.position.y 设置分层高度。
export function flatPolygon(points: Vec2[]): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(toShapeSpace))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

// 相对 center 的 footprint Shape；body 与 roof 共用，保证对齐。
export function footprintShape(points: Vec2[], center: Vec2): THREE.Shape {
  return new THREE.Shape(
    points.map(([x, z]) => new THREE.Vector2(x - center[0], -(z - center[1]))),
  )
}

// 建筑轮廓拉伸，相对 center；世界顶点落在精确的数据 XZ（不镜像），Y 为 0..height。
export function extrudeFootprint(points: Vec2[], center: Vec2, height: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(footprintShape(points, center), {
    depth: height,
    bevelEnabled: false,
  })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

export interface RoadCorridorOptions {
  join?: 'miter' | 'bevel'
  cap?: 'square' | 'butt' | 'round'
  miterLimit?: number
}

function cleanLine(points: Vec2[]): Vec2[] {
  const result: Vec2[] = []
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue
    if (!result.length || result[result.length - 1][0] !== point[0] || result[result.length - 1][1] !== point[1]) {
      result.push([point[0], point[1]])
    }
  }
  return result
}

function segmentDirection(a: Vec2, b: Vec2): THREE.Vector2 {
  const direction = new THREE.Vector2(b[0] - a[0], b[1] - a[1])
  return direction.lengthSq() > 1e-12 ? direction.normalize() : new THREE.Vector2(1, 0)
}

function offsetSide(points: Vec2[], halfWidth: number, side: 1 | -1, options: Required<RoadCorridorOptions>): Vec2[] {
  const result: Vec2[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const previousDirection = segmentDirection(points[Math.max(0, index - 1)], current)
    const nextDirection = segmentDirection(current, points[Math.min(points.length - 1, index + 1)])
    const previousNormal = new THREE.Vector2(-previousDirection.y, previousDirection.x).multiplyScalar(side)
    const nextNormal = new THREE.Vector2(-nextDirection.y, nextDirection.x).multiplyScalar(side)

    if (index === 0 || index === points.length - 1) {
      const direction = index === 0 ? nextDirection : previousDirection
      const capOffset = options.cap === 'square' ? direction.clone().multiplyScalar(index === 0 ? -halfWidth : halfWidth) : new THREE.Vector2()
      const normal = index === 0 ? nextNormal : previousNormal
      result.push([current[0] + normal.x * halfWidth + capOffset.x, current[1] + normal.y * halfWidth + capOffset.y])
      continue
    }

    const miter = previousNormal.clone().add(nextNormal)
    if (options.join === 'miter' && miter.lengthSq() > 1e-12) {
      miter.normalize()
      const denominator = miter.dot(nextNormal)
      const length = Math.abs(denominator) > 1e-6 ? halfWidth / denominator : Infinity
      if (Number.isFinite(length) && Math.abs(length) <= halfWidth * options.miterLimit) {
        result.push([current[0] + miter.x * length, current[1] + miter.y * length])
        continue
      }
    }

    // A bevel is stable at sharp turns and avoids the huge spikes produced by
    // an unrestricted miter join.
    result.push([current[0] + previousNormal.x * halfWidth, current[1] + previousNormal.y * halfWidth])
    result.push([current[0] + nextNormal.x * halfWidth, current[1] + nextNormal.y * halfWidth])
  }
  return result
}

function roundCap(center: Vec2, direction: THREE.Vector2, halfWidth: number, start: boolean): Vec2[] {
  const base = start ? direction.clone().multiplyScalar(-1) : direction.clone()
  const points: Vec2[] = []
  const steps = 8
  for (let step = 0; step <= steps; step += 1) {
    const angle = Math.atan2(base.y, base.x) + (Math.PI * step) / steps
    points.push([center[0] + Math.cos(angle) * halfWidth, center[1] + Math.sin(angle) * halfWidth])
  }
  return points
}

/** Build a stable corridor polygon with bounded joins and explicit end caps. */
export function buildRoadCorridor(points: Vec2[], width: number, input: RoadCorridorOptions = {}): Vec2[] {
  const line = cleanLine(points)
  if (line.length < 2) return []
  const options: Required<RoadCorridorOptions> = {
    join: input.join ?? 'miter',
    cap: input.cap ?? 'butt',
    miterLimit: input.miterLimit ?? 4,
  }
  const halfWidth = Math.max(0.01, Math.abs(width) / 2)
  const left = offsetSide(line, halfWidth, 1, options)
  const right = offsetSide(line, halfWidth, -1, options)
  if (options.cap === 'round') {
    const startDirection = segmentDirection(line[0], line[1])
    const endDirection = segmentDirection(line[line.length - 2], line[line.length - 1])
    return [
      ...roundCap(line[0], startDirection, halfWidth, true),
      ...left.slice(1, -1),
      ...roundCap(line[line.length - 1], endDirection, halfWidth, false),
      ...right.slice(1, -1).reverse(),
    ]
  }
  return [...left, ...right.reverse()]
}

/** Compatibility alias used by selection highlighting and existing tests. */
export function buildRoadOutline(points: Vec2[], width: number): Vec2[] {
  return buildRoadCorridor(points, width)
}
