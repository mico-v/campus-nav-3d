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

// 折线 -> 道路带状轮廓（数据空间 [x,z][]）。纯几何，交给 flatPolygon 落位。
export function buildRoadOutline(points: Vec2[], width: number): Vec2[] {
  const left: Vec2[] = []
  const right: Vec2[] = []
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(i - 1, 0)]
    const cur = points[i]
    const next = points[Math.min(i + 1, points.length - 1)]
    const dirPrev = new THREE.Vector2(cur[0] - prev[0], cur[1] - prev[1]).normalize()
    const dirNext = new THREE.Vector2(next[0] - cur[0], next[1] - cur[1]).normalize()
    const dir = dirPrev.clone().add(dirNext).normalize()
    const fallback = new THREE.Vector2(next[0] - prev[0], next[1] - prev[1]).normalize()
    const tangent =
      Number.isFinite(dir.x) && Number.isFinite(dir.y) && dir.lengthSq() > 0 ? dir : fallback
    const safe = tangent.lengthSq() > 1e-10 ? tangent : new THREE.Vector2(1, 0)
    const normal = new THREE.Vector2(-safe.y, safe.x).normalize().multiplyScalar(width / 2)
    left.push([cur[0] + normal.x, cur[1] + normal.y])
    right.unshift([cur[0] - normal.x, cur[1] - normal.y])
  }
  return [...left, ...right]
}
