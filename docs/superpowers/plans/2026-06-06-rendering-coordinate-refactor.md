# 3D 校园渲染坐标修复与观感重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复道路被镜像翻转的渲染 bug（根因：坐标系不统一），并把 807 行 `main.ts` 重构为模块化、Apple 地图风格的干净渲染。

**Architecture:** 确立唯一坐标约定（数据 `[x,z]` → 世界 `(x,Y,z)`，永不取反/镜像），所有平面与拉伸几何统一经 `src/scene/geo.ts`。数据从死 JSON 抽到 `campus.json`（数值不变）。渲染拆分为 geo / theme / builders / CampusScene / ui / interaction 模块。观感走 Apple 地图风（无投影、无雾、道路描边、分层防 z-fighting）。

**Tech Stack:** Vite 8 + TypeScript 6 + Three.js 0.183；新增 Vitest 做坐标纯函数回归测试。

**Spec:** `docs/superpowers/specs/2026-06-06-rendering-coordinate-refactor-design.md`

**范围说明:** 本计划覆盖阶段 1–4（数据重整 / 坐标修复 / 模块化 / 观感升级），交付一个渲染正确且美观的地图。阶段 5（恢复编辑器，参照 `64dbc2e`）是独立交互子系统，待本计划落地后单独立计划。

---

## File Structure

```
vitest.config.ts          // 新增：vitest 配置（node 环境）
tests/geo.test.ts         // 新增：坐标纯函数回归测试（钉死 bug）
tests/data.test.ts        // 新增：campus.json 与原数据等价校验
src/scene/geo.ts          // 新增：唯一坐标/形状映射（根因修复所在）
src/scene/theme.ts        // 新增：Apple 地图风配色 + Y 层级常量
src/scene/builders.ts     // 新增：各实体 → 网格（从 main.ts 迁移并改走 geo）
src/scene/CampusScene.ts  // 新增：场景/相机/灯光/控制器/循环 + 按数据重建
src/ui/panel.ts           // 新增：侧栏/路线/实体列表/DOM 标签/选中提示
src/interaction.ts        // 新增：拾取(raycast) + 建筑聚焦
src/main.ts               // 改薄：组装模块、启动
src/data/campusData.ts    // 改薄：类型 + 从 campus.json 加载
src/data/campus.json      // 新增：几何数据（从死 JSON 抽出，数值不变）
tsconfig.json             // 改：resolveJsonModule
package.json              // 改：vitest 依赖 + test 脚本
```

---

## Phase 0 — 测试工具

### Task 1: 引入 Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 安装 vitest**

Run: `npm install -D vitest`
Expected: `package.json` 出现 `"vitest"` 于 devDependencies。

- [ ] **Step 2: 添加 test 脚本**

修改 `package.json` 的 `"scripts"`，新增：

```json
    "test": "vitest run"
```

- [ ] **Step 3: 创建 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: 验证 vitest 可运行**

Run: `npx vitest run`
Expected: 退出码 0，提示 "No test files found"（此时还没有测试文件，属正常）。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for coordinate regression tests"
```

---

## Phase 1 — 数据重整（数值不变）

### Task 2: 把死 JSON 抽到 campus.json

**Files:**
- Create: `src/data/campus.json`
- Modify: `src/data/campusData.ts`
- Modify: `tsconfig.json`
- Create: `tests/data.test.ts`

- [ ] **Step 1: 先写等价性测试（红）**

Create `tests/data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 抽出当前 campusData.ts 中内联的 baseCampusData 字面量原文，作为黄金基准。
function extractInlineBase(): unknown {
  const src = readFileSync(new URL('../src/data/campusData.ts', import.meta.url), 'utf8')
  const start = src.indexOf('{', src.indexOf('const baseCampusData'))
  const end = src.indexOf('\nexport function cloneCampusData')
  if (start < 0 || end < 0) return null // 内联已被移除（重构后）
  return JSON.parse(src.slice(start, end).trim())
}

describe('campus.json 等价性', () => {
  it('campus.json 与原内联数据逐字段相等', async () => {
    const json = (await import('../src/data/campus.json', { with: { type: 'json' } })).default
    const inline = extractInlineBase()
    // 重构完成后 inline 为 null，仅校验 json 非空且键齐全
    if (inline === null) {
      expect(Object.keys(json as object)).toContain('buildings')
      return
    }
    expect(json).toEqual(inline)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL —— `campus.json` 尚不存在，import 报错。

- [ ] **Step 3: 生成 campus.json（数值不变）**

Run（用脚本从当前内联数据精确抽取，避免手抄）:

```bash
node -e '
const fs=require("fs");
const s=fs.readFileSync("src/data/campusData.ts","utf8");
const a=s.indexOf("{",s.indexOf("const baseCampusData"));
const b=s.indexOf("\nexport function cloneCampusData");
const d=JSON.parse(s.slice(a,b).trim());
fs.writeFileSync("src/data/campus.json", JSON.stringify(d,null,2)+"\n");
console.log("written buildings=",d.buildings.length,"roads=",d.roads.length);
'
```
Expected: 打印 `written buildings= 57 roads= 80`。

- [ ] **Step 4: 让测试先通过（此时内联仍在，json 应等于内联）**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS（`json` deep-equals 内联）。

- [ ] **Step 5: 开启 resolveJsonModule**

修改 `tsconfig.json`，在 `compilerOptions` 内 `"types": ["vite/client"],` 下一行加入：

```json
    "resolveJsonModule": true,
```

- [ ] **Step 6: 瘦身 campusData.ts —— 用 import 替换内联字面量**

在 `src/data/campusData.ts` 中：
1. 删除 `const baseCampusData: CampusData = { ... }` 整段内联字面量（第 95 行那一大段 JSON）。
2. 在文件顶部（类型定义之前或之后均可，需在使用前）加入：

```ts
import campusJson from './campus.json'
```
3. 用下面这行替代被删除的字面量声明：

```ts
const baseCampusData: CampusData = campusJson as unknown as CampusData
```

保留文件末尾原有的 `cloneCampusData` / `createDefaultCampusData` / `export const campusData` 不变。

- [ ] **Step 7: 验证等价测试 + 构建**

Run: `npx vitest run tests/data.test.ts && npm run build`
Expected: 测试 PASS（内联已删，走 json 分支，键齐全）；`tsc` 类型检查通过；vite 构建成功。

- [ ] **Step 8: Commit**

```bash
git add src/data/campus.json src/data/campusData.ts tsconfig.json tests/data.test.ts
git commit -m "refactor(data): extract baked map data to campus.json (values unchanged)"
```

---

## Phase 2 — 坐标修复（TDD，根因）

### Task 3: 新建 geo.ts 唯一坐标映射 + 回归测试

**Files:**
- Create: `tests/geo.test.ts`
- Create: `src/scene/geo.ts`

- [ ] **Step 1: 先写坐标回归测试（红）**

Create `tests/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { flatPolygon, extrudeFootprint, buildRoadOutline } from '../src/scene/geo'
import type * as THREE from 'three'

function worldVerts(geo: THREE.BufferGeometry): number[][] {
  const arr = geo.attributes.position.array as ArrayLike<number>
  const out: number[][] = []
  for (let i = 0; i < arr.length; i += 3) out.push([arr[i], arr[i + 1], arr[i + 2]])
  return out
}

describe('flatPolygon', () => {
  it('数据 Z 映射为世界 +Z（不取反）—— 道路偏移 bug 的回归护栏', () => {
    const geo = flatPolygon([[0, 90], [10, 90], [10, 110], [0, 110]])
    const zs = worldVerts(geo).map((v) => v[2])
    expect(Math.min(...zs)).toBeCloseTo(90, 4)
    expect(Math.max(...zs)).toBeCloseTo(110, 4)
  })
})

describe('extrudeFootprint', () => {
  it('不在 Z 方向镜像 footprint', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [0, 30]] // 直角三角形，顶点在数据 (0,30)
    const center: [number, number] = [10 / 3, 10]
    const geo = extrudeFootprint(pts, center, 5)
    const verts = worldVerts(geo).map((v) => [v[0] + center[0], v[1], v[2] + center[1]])
    const hasApex = verts.some((v) => Math.abs(v[0] - 0) < 1e-3 && Math.abs(v[2] - 30) < 1e-3)
    expect(hasApex).toBe(true) // 镜像时顶点会落到 z=-10，此断言失败
  })

  it('高度沿 +Y 拉伸', () => {
    const geo = extrudeFootprint([[0, 0], [10, 0], [10, 10], [0, 10]], [5, 5], 12)
    const ys = worldVerts(geo).map((v) => v[1])
    expect(Math.min(...ys)).toBeCloseTo(0, 4)
    expect(Math.max(...ys)).toBeCloseTo(12, 4)
  })
})

describe('buildRoadOutline', () => {
  it('沿 X 的直路在数据空间生成以折线为中心的带', () => {
    const outline = buildRoadOutline([[0, 100], [50, 100]], 10)
    const zs = outline.map((p) => p[1])
    expect(Math.min(...zs)).toBeCloseTo(95, 4)
    expect(Math.max(...zs)).toBeCloseTo(105, 4)
  })

  it('重合点不产生 NaN', () => {
    const outline = buildRoadOutline([[0, 0], [0, 0], [10, 0]], 4)
    expect(outline.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/geo.test.ts`
Expected: FAIL —— `src/scene/geo.ts` 不存在，import 报错。

- [ ] **Step 3: 实现 geo.ts**

Create `src/scene/geo.ts`:

```ts
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
    const safe = Number.isFinite(tangent.x) && Number.isFinite(tangent.y) ? tangent : new THREE.Vector2(1, 0)
    const normal = new THREE.Vector2(-safe.y, safe.x).normalize().multiplyScalar(width / 2)
    left.push([cur[0] + normal.x, cur[1] + normal.y])
    right.unshift([cur[0] - normal.x, cur[1] - normal.y])
  }
  return [...left, ...right]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/geo.test.ts`
Expected: 全部 PASS（5 个断言）。

- [ ] **Step 5: Commit**

```bash
git add src/scene/geo.ts tests/geo.test.ts
git commit -m "feat(scene): add geo.ts single-source coordinate mapping (fixes road mirror)"
```

---

## Phase 3 — 模块化拆分

### Task 4: 主题与层级常量 theme.ts

**Files:**
- Create: `src/scene/theme.ts`

- [ ] **Step 1: 创建 theme.ts**

Create `src/scene/theme.ts`:

```ts
// Apple 地图风：低饱和柔和配色 + Y 层级栈（避免共面 z-fighting）。
export const LAYER = {
  ground: 0,
  zone: 0.05,
  field: 0.1,
  water: 0.15,
  roadCasing: 0.18,
  road: 0.2,
  marker: 0.25,
} as const

export const COLORS = {
  background: '#eef3f6',
  ground: '#e7ece3',
  roof: '#fbfcfe',
  roofSelected: '#fff1f2',
  selected: '#fb7185',
  road: '#ffffff',
  roadCasing: '#d7dde3',
  routePrimary: '#ff4fa3',
} as const

// 建筑体色（按类别），柔和低饱和。
export const BUILDING_COLOR: Record<string, string> = {
  dorm: '#cdd6f4',
  academic: '#bcd4f2',
  admin: '#c2e6cd',
  sports: '#bfeaf0',
  library: '#f5e2ad',
  gate: '#f6c79a',
  canteen: '#f3bcbc',
  service: '#f3d2ab',
  poi: '#f3c4dc',
  landscape: '#c2e6cd',
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 通过（theme.ts 暂未被引用，`noUnusedLocals` 针对局部变量而非导出，安全）。

- [ ] **Step 3: Commit**

```bash
git add src/scene/theme.ts
git commit -m "feat(scene): add theme palette and Y-layer constants"
```

### Task 5: builders.ts —— 迁移实体构建并改走 geo

**Files:**
- Create: `src/scene/builders.ts`
- Reference: `src/main.ts:363-691`（现有构建逻辑来源）

- [ ] **Step 1: 创建 builders.ts 骨架与导入**

Create `src/scene/builders.ts`，先放导入与类型：

```ts
import * as THREE from 'three'
import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { LAYER, COLORS, BUILDING_COLOR } from './theme'
import { flatPolygon, extrudeFootprint, footprintShape, buildRoadOutline } from './geo'

export interface BuiltLabel {
  marker: PoiMarker
  element: HTMLDivElement
}
```

- [ ] **Step 2: 迁移地面/地块/水体/操场/树（改用 LAYER 高度）**

在 `builders.ts` 追加（逻辑迁移自 `main.ts:376-485`，平面位置用 `LAYER` 常量替换原散落的 `0.025/0.12/0.14/0.18`）：

```ts
export function buildGround(bounds: { center: [number, number]; width: number; depth: number }): THREE.Mesh {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.width, bounds.depth),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(bounds.center[0], LAYER.ground, bounds.center[1])
  ground.receiveShadow = false
  return ground
}

export function buildZones(data: CampusData): THREE.Object3D[] {
  return data.zones.map((zone) => {
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.size[0], zone.size[1]),
      new THREE.MeshStandardMaterial({
        color: zone.color, transparent: true, opacity: 0.5,
        roughness: 1, metalness: 0, depthWrite: false,
      }),
    )
    tile.rotation.x = -Math.PI / 2
    tile.position.set(zone.center[0], LAYER.zone, zone.center[1])
    return tile
  })
}

export function buildWaters(data: CampusData): THREE.Object3D[] {
  return data.waters.map((water) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshStandardMaterial({ color: water.color ?? '#7cb5f0', transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0 }),
    )
    mesh.scale.set(water.size[0] / 2, water.size[1] / 2, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(water.center[0], LAYER.water, water.center[1])
    return mesh
  })
}

export function buildFields(data: CampusData): THREE.Object3D[] {
  return data.fields.map((field) => {
    const group = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(field.size[0], field.size[1]),
      new THREE.MeshStandardMaterial({ color: field.color ?? '#9fd9ad', roughness: 1 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = LAYER.field
    group.add(base)
    const track = new THREE.Mesh(
      new THREE.RingGeometry(field.size[0] / 2 + 2, field.size[0] / 2 + 6, 48),
      new THREE.MeshStandardMaterial({ color: '#e0a35f', roughness: 1 }),
    )
    track.scale.set(1, field.size[1] / field.size[0], 1)
    track.rotation.x = -Math.PI / 2
    track.position.y = LAYER.field + 0.005
    group.add(track)
    group.position.set(field.center[0], 0, field.center[1])
    return group
  })
}

export function buildTrees(data: CampusData): THREE.Object3D[] {
  return data.trees.map(([x, z]) => {
    const group = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 1 }),
    )
    trunk.position.y = 2.2
    group.add(trunk)
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 12, 12),
      new THREE.MeshStandardMaterial({ color: '#5fae72', roughness: 1 }),
    )
    crown.position.y = 5.4
    group.add(crown)
    group.position.set(x, 0, z)
    return group
  })
}
```

- [ ] **Step 3: 迁移道路（改用 buildRoadOutline + flatPolygon + 描边 casing）**

在 `builders.ts` 追加（替代旧 `buildRoadShape`/`main.ts:402-422`，这是修复 + 观感升级合一）：

```ts
export function buildRoads(data: CampusData): THREE.Object3D[] {
  const objects: THREE.Object3D[] = []
  for (const road of data.roads) {
    if (road.points.length < 2) continue
    const outline = buildRoadOutline(road.points, road.width)
    const casingOutline = buildRoadOutline(road.points, road.width + 2.2)

    const casing = new THREE.Mesh(
      flatPolygon(casingOutline),
      new THREE.MeshStandardMaterial({ color: COLORS.roadCasing, roughness: 1, metalness: 0 }),
    )
    casing.position.y = LAYER.roadCasing
    objects.push(casing)

    const surface = new THREE.Mesh(
      flatPolygon(outline),
      new THREE.MeshStandardMaterial({ color: road.color ?? COLORS.road, roughness: 1, metalness: 0 }),
    )
    surface.position.y = LAYER.road
    objects.push(surface)
  }
  return objects
}
```

- [ ] **Step 4: 迁移建筑（footprint 走 extrudeFootprint/footprintShape，box 分支保留）**

在 `builders.ts` 追加（迁移自 `main.ts:553-628`，几何改走 geo，材质用 theme，去掉镜像）：

```ts
export function buildBuilding(building: Building, selected: boolean): THREE.Group {
  const group = new THREE.Group()
  const color = selected ? COLORS.selected : building.color ?? BUILDING_COLOR[building.category] ?? '#cbd5e1'
  const h = building.height

  if (building.footprint && building.footprint.length >= 3) {
    const body = new THREE.Mesh(
      extrudeFootprint(building.footprint, building.position, h),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
    )
    group.add(body)
    const roof = new THREE.Mesh(
      new THREE.ShapeGeometry(footprintShape(building.footprint, building.position)),
      new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
    )
    roof.rotation.x = -Math.PI / 2
    roof.position.y = h + 0.05
    group.add(roof)
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0], h, building.size[1]),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
    )
    body.position.y = h / 2
    group.add(body)
    if (h > 8) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(building.size[0] * 0.82, Math.max(1.2, h * 0.06), building.size[1] * 0.82),
        new THREE.MeshStandardMaterial({ color: selected ? COLORS.roofSelected : COLORS.roof, roughness: 0.9 }),
      )
      roof.position.y = h + 0.4
      group.add(roof)
    }
  }
  group.position.set(building.position[0], 0, building.position[1])
  return group
}
```

- [ ] **Step 5: 迁移 POI 标记与 DOM 标签构建、路线管线**

在 `builders.ts` 追加（迁移自 `main.ts:487-550, 736-753`；`resolvePois` 也迁移过来）：

```ts
const markerGeometry = new THREE.CylinderGeometry(0.9, 0.9, 7, 12)

export function resolvePois(data: CampusData): PoiMarker[] {
  const map = new Map(data.buildings.map((b) => [b.id, b]))
  return data.pois.map((poi) => {
    if (!poi.sourceBuildingId) return poi
    const b = map.get(poi.sourceBuildingId)
    if (!b) return poi
    return {
      ...poi,
      name: b.name,
      color: poi.color ?? b.color,
      position: [b.position[0], b.height + 2, b.position[1]] as [number, number, number],
    }
  })
}

export function buildPois(data: CampusData, labelLayer: HTMLDivElement): { objects: THREE.Object3D[]; labels: BuiltLabel[] } {
  const objects: THREE.Object3D[] = []
  const labels: BuiltLabel[] = []
  for (const poi of resolvePois(data)) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: poi.color ?? '#ffffff', emissiveIntensity: 0.4 }),
    )
    cap.position.set(...poi.position)
    objects.push(cap)
    const stem = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: poi.color ?? '#ffffff' }))
    stem.position.set(poi.position[0], poi.position[1] - 3.2, poi.position[2])
    objects.push(stem)
    const element = document.createElement('div')
    element.className = `map-label ${poi.kind}`
    element.textContent = poi.name
    labelLayer.appendChild(element)
    labels.push({ marker: poi, element })
  }
  return { objects, labels }
}
```

- [ ] **Step 6: 类型检查**

Run: `npm run build`
Expected: 通过。若报 `noUnusedParameters`/未用导入，移除对应未用项。

- [ ] **Step 7: Commit**

```bash
git add src/scene/builders.ts
git commit -m "feat(scene): builders module — all entities routed through geo, road casing added"
```

### Task 6: CampusScene.ts —— 场景/相机/灯光/循环/重建

**Files:**
- Create: `src/scene/CampusScene.ts`
- Reference: `src/main.ts:81-150,206-375,510-664,693-734`

- [ ] **Step 1: 创建 CampusScene 类（构造 + 公共接口）**

Create `src/scene/CampusScene.ts`:

```ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CampusData } from '../data/campusData'
import { COLORS } from './theme'
import { buildGround, buildZones, buildWaters, buildFields, buildTrees, buildRoads, buildBuilding, buildPois, type BuiltLabel } from './builders'

export class CampusScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly renderer: THREE.WebGLRenderer
  readonly campusGroup = new THREE.Group()
  clickableObjects: THREE.Object3D[] = []
  labels: BuiltLabel[] = []

  private readonly host: HTMLDivElement
  private readonly labelLayer: HTMLDivElement
  private data!: CampusData
  private selectedIndex = 0
  private routeCurve: THREE.CatmullRomCurve3 | null = null
  private routeGlow: THREE.MeshBasicMaterial | null = null
  private routePulse: THREE.Mesh | null = null
  private routePoints: THREE.Vector3[] = []
  private readonly tempVector = new THREE.Vector3()

  constructor(host: HTMLDivElement, labelLayer: HTMLDivElement) {
    this.host = host
    this.labelLayer = labelLayer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = false // 方案甲：无投影
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.background)
    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 5000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.maxPolarAngle = Math.PI / 2.08
    this.controls.minDistance = 35
    this.controls.maxDistance = 4200

    this.addLights()
    this.scene.add(this.campusGroup)
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight('#ffffff', '#cdd6df', 2.0)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight('#ffffff', 0.6)
    key.position.set(-120, 220, 90)
    key.castShadow = false
    this.scene.add(key)
  }
}
```

- [ ] **Step 2: 迁移 computeMapBounds 为方法 + setData/重建**

在 `CampusScene` 类中追加（迁移自 `main.ts:316-361,363-373`）：

```ts
  computeBounds(padding = 0) {
    const xs: number[] = []
    const zs: number[] = []
    for (const b of this.data.buildings) {
      xs.push(b.position[0]); zs.push(b.position[1])
      b.footprint?.forEach(([x, z]) => { xs.push(x); zs.push(z) })
    }
    for (const r of this.data.roads) r.points.forEach(([x, z]) => { xs.push(x); zs.push(z) })
    for (const z of this.data.zones) { xs.push(z.center[0] - z.size[0] / 2, z.center[0] + z.size[0] / 2); zs.push(z.center[1] - z.size[1] / 2, z.center[1] + z.size[1] / 2) }
    for (const w of this.data.waters) { xs.push(w.center[0] - w.size[0] / 2, w.center[0] + w.size[0] / 2); zs.push(w.center[1] - w.size[1] / 2, w.center[1] + w.size[1] / 2) }
    for (const f of this.data.fields) { xs.push(f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2); zs.push(f.center[1] - f.size[1] / 2, f.center[1] + f.size[1] / 2) }
    const minX = Math.min(...xs) - padding, maxX = Math.max(...xs) + padding
    const minZ = Math.min(...zs) - padding, maxZ = Math.max(...zs) + padding
    return { center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number], width: Math.max(1, maxX - minX), depth: Math.max(1, maxZ - minZ) }
  }

  setData(data: CampusData): void {
    this.data = data
    this.rebuild()
  }

  setSelected(index: number): void {
    this.selectedIndex = index
    this.rebuild()
  }
```

- [ ] **Step 3: 迁移 rebuild（清理 + 调 builders + 路线）**

在 `CampusScene` 追加（合并自 `main.ts:363-551` 的实体装配与 `disposeChildren`/`disposeObject` 776-794）：

```ts
  private rebuild(): void {
    this.disposeGroup()
    this.labelLayer.innerHTML = ''
    this.clickableObjects = []
    this.labels = []
    this.routeCurve = null; this.routeGlow = null; this.routePulse = null; this.routePoints = []

    const bounds = this.computeBounds(140)
    this.campusGroup.add(buildGround(bounds))
    buildZones(this.data).forEach((o) => this.campusGroup.add(o))
    buildRoads(this.data).forEach((o) => this.campusGroup.add(o))
    buildWaters(this.data).forEach((o) => this.campusGroup.add(o))
    buildFields(this.data).forEach((o) => this.campusGroup.add(o))
    this.data.buildings.forEach((b, index) => {
      const mesh = buildBuilding(b, index === this.selectedIndex)
      mesh.traverse((child) => {
        child.userData = { kind: 'building', index }
        if (child instanceof THREE.Mesh) this.clickableObjects.push(child)
      })
      this.campusGroup.add(mesh)
    })
    buildTrees(this.data).forEach((o) => this.campusGroup.add(o))
    const { objects, labels } = buildPois(this.data, this.labelLayer)
    objects.forEach((o) => this.campusGroup.add(o))
    this.labels = labels
    this.buildRoute()
  }

  private buildRoute(): void {
    const route = this.data.routes[0]
    if (!route || route.points.length < 2) return
    this.routePoints = route.points.map((p) => new THREE.Vector3(...p))
    this.routeCurve = new THREE.CatmullRomCurve3(this.routePoints)
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.routeCurve, 220, 1.55, 16, false),
      new THREE.MeshStandardMaterial({ color: COLORS.routePrimary, emissive: COLORS.routePrimary, emissiveIntensity: 0.9, transparent: true, opacity: 0.98 }),
    )
    this.campusGroup.add(tube)
    this.routeGlow = new THREE.MeshBasicMaterial({ color: '#ff9dce', transparent: true, opacity: 0.2 })
    this.campusGroup.add(new THREE.Mesh(new THREE.TubeGeometry(this.routeCurve, 220, 3.1, 16, false), this.routeGlow))
    this.routePulse = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 20, 20),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: COLORS.routePrimary, emissiveIntensity: 1.2 }),
    )
    this.campusGroup.add(this.routePulse)
  }

  private disposeGroup(): void {
    while (this.campusGroup.children.length > 0) {
      const child = this.campusGroup.children[0]
      this.campusGroup.remove(child)
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const m = node.material
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
          else m.dispose()
        }
      })
    }
  }
```

- [ ] **Step 4: 迁移相机（overview/focus）、resize、动画循环、标签更新**

在 `CampusScene` 追加（迁移自 `main.ts:195-235,279-314,693-734`；`samplePolylinePoint` 内联为私有方法）：

```ts
  setOverviewCamera(): void {
    const bounds = this.computeBounds(160)
    const maxDim = Math.max(bounds.width, bounds.depth)
    const target = new THREE.Vector3(bounds.center[0], 0, bounds.center[1])
    this.controls.target.copy(target)
    this.camera.position.set(target.x - maxDim * 0.72, maxDim * 0.42, target.z + maxDim * 0.68)
    this.camera.near = 5
    this.camera.far = Math.max(5000, maxDim * 4)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  focusBuilding(index: number): void {
    const b = this.data.buildings[index]
    if (!b) return
    const target = new THREE.Vector3(b.position[0], Math.max(8, b.height * 0.55), b.position[1])
    const dist = Math.max(110, Math.max(b.size[0], b.size[1]) * 4.5)
    this.controls.target.copy(target)
    this.camera.position.set(target.x - dist * 0.7, target.y + dist * 0.8, target.z + dist)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  render(elapsed: number): void {
    this.controls.update()
    if (this.routeGlow) this.routeGlow.opacity = 0.14 + Math.sin(elapsed * 2.2) * 0.06
    if (this.routeCurve && this.routePulse) {
      const t = Math.min((elapsed * 0.08) % 1, 0.999)
      this.routePulse.position.copy(this.routeCurve.getPointAt(t))
      this.routePulse.scale.setScalar(0.8 + (Math.sin(elapsed * 5.5) + 1) * 0.12)
    }
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
  }

  private updateLabels(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    for (const t of this.labels) {
      this.tempVector.set(...t.marker.position).project(this.camera)
      const visible = this.tempVector.z < 1 && this.tempVector.z > -1
      const left = ((this.tempVector.x + 1) / 2) * w
      const top = ((-this.tempVector.y + 1) / 2) * h
      const inside = left >= -80 && left <= w + 80 && top >= -30 && top <= h + 30
      t.element.style.opacity = visible && inside ? '1' : '0'
      t.element.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`
    }
  }
```

注：路线脉冲改用 `routeCurve.getPointAt(t)` 取代旧 `samplePolylinePoint`，去掉冗余折线采样函数（DRY）。

- [ ] **Step 5: 类型检查**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add src/scene/CampusScene.ts
git commit -m "feat(scene): CampusScene owns scene/camera/lights/rebuild loop"
```

### Task 7: ui/panel.ts —— DOM 渲染

**Files:**
- Create: `src/ui/panel.ts`
- Reference: `src/main.ts:246-277,765-773,796-807`

- [ ] **Step 1: 创建 panel.ts（纯 DOM 渲染函数 + 转义/格式化工具）**

Create `src/ui/panel.ts`:

```ts
import type { CampusData } from '../data/campusData'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function renderRouteInfo(data: CampusData, els: { routeName: HTMLElement; routeSteps: HTMLElement; routeLandmarks: HTMLElement }): void {
  const route = data.routes[0]
  if (!route) {
    els.routeName.textContent = '无路线数据'
    els.routeSteps.innerHTML = ''
    els.routeLandmarks.innerHTML = '<span class="chip">无</span>'
    return
  }
  els.routeName.textContent = route.name
  els.routeSteps.innerHTML = route.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')
  els.routeLandmarks.innerHTML = route.landmarks.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join('')
}

export function renderEntityList(data: CampusData, selectedIndex: number, container: HTMLElement): void {
  container.innerHTML = data.buildings.map((b, index) => {
    const selected = index === selectedIndex
    const zoneName = data.zones.find((z) => z.id === b.zoneId)?.name ?? b.zoneId
    return `
      <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="building" data-index="${index}">
        <span>
          <strong>${escapeHtml(b.name || b.id || `建筑 ${index + 1}`)}</strong>
          <small>${escapeHtml(b.category)} · ${escapeHtml(zoneName)}</small>
          <small>X ${formatCoordinate(b.position[0])} / Z ${formatCoordinate(b.position[1])} · 高 ${formatCoordinate(b.height)}</small>
        </span>
        <span class="pill">${index + 1}</span>
      </button>`
  }).join('')
}

export function updateSelectionToast(data: CampusData, selectedIndex: number, toast: HTMLElement): void {
  const b = data.buildings[selectedIndex]
  toast.textContent = b ? `已选中建筑：${b.name}` : '未选择对象'
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/ui/panel.ts
git commit -m "feat(ui): panel module for route/entity/toast DOM rendering"
```

### Task 8: interaction.ts —— 拾取

**Files:**
- Create: `src/interaction.ts`
- Reference: `src/main.ts:173-193`

- [ ] **Step 1: 创建 interaction.ts**

Create `src/interaction.ts`:

```ts
import * as THREE from 'three'

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// 返回点击命中的建筑 index，未命中返回 null。
export function pickBuilding(
  event: MouseEvent,
  dom: HTMLCanvasElement,
  camera: THREE.Camera,
  clickable: THREE.Object3D[],
): number | null {
  const rect = dom.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(clickable, true).find((c) => {
    const d = c.object.userData as { kind?: string; index?: number }
    return d.kind === 'building' && typeof d.index === 'number'
  })
  if (!hit) return null
  return (hit.object.userData as { index: number }).index
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/interaction.ts
git commit -m "feat: interaction module for raycast building picking"
```

### Task 9: 改薄 main.ts —— 组装各模块

**Files:**
- Modify: `src/main.ts`（整体重写为薄入口）

- [ ] **Step 1: 用模块化入口替换 main.ts 全文**

将 `src/main.ts` 全文替换为：

```ts
import './style.css'
import * as THREE from 'three'
import { createDefaultCampusData } from './data/campusData'
import { CampusScene } from './scene/CampusScene'
import { pickBuilding } from './interaction'
import { renderRouteInfo, renderEntityList, updateSelectionToast } from './ui/panel'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

app.innerHTML = `
  <div class="app-shell">
    <div class="scene-wrap">
      <header class="topbar">
        <span class="brand" id="hero-title"></span>
        <span class="hint">拖拽旋转 · 滚轮缩放 · 右键平移 · 点击建筑</span>
      </header>
      <div id="scene"></div>
      <div id="label-layer"></div>
      <div class="selection-toast" id="selection-toast">未选择对象</div>
    </div>
    <aside class="panel">
      <section>
        <h2>示例路线</h2>
        <p class="route-name" id="route-name"></p>
        <ol class="route-steps" id="route-steps"></ol>
      </section>
      <section>
        <h2>沿途地标</h2>
        <div class="chip-list" id="route-landmarks"></div>
      </section>
      <section>
        <h2>建筑信息列表</h2>
        <div id="entity-list" class="entity-list"></div>
      </section>
    </aside>
  </div>
`

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel)
  if (!el) throw new Error(`UI element missing: ${sel}`)
  return el
}

const sceneHost = $<HTMLDivElement>('#scene')
const labelLayer = $<HTMLDivElement>('#label-layer')
const heroTitle = $<HTMLElement>('#hero-title')
const entityList = $<HTMLDivElement>('#entity-list')
const selectionToast = $<HTMLDivElement>('#selection-toast')
const panelEls = {
  routeName: $<HTMLElement>('#route-name'),
  routeSteps: $<HTMLElement>('#route-steps'),
  routeLandmarks: $<HTMLElement>('#route-landmarks'),
}

const data = createDefaultCampusData()
let selectedIndex = data.buildings.length > 0 ? 0 : -1

const campus = new CampusScene(sceneHost, labelLayer)
campus.setData(data)
campus.setSelected(selectedIndex)
campus.setOverviewCamera()

function syncUi(): void {
  heroTitle.textContent = data.name
  renderRouteInfo(data, panelEls)
  renderEntityList(data, selectedIndex, entityList)
  updateSelectionToast(data, selectedIndex, selectionToast)
}

function select(index: number): void {
  if (!data.buildings[index]) return
  selectedIndex = index
  campus.setSelected(index)
  syncUi()
  campus.focusBuilding(index)
}

syncUi()

entityList.addEventListener('click', (event) => {
  const item = (event.target as HTMLElement)?.closest<HTMLElement>('[data-kind][data-index]')
  if (!item) return
  const index = Number(item.dataset.index)
  if (Number.isInteger(index)) select(index)
})

campus.renderer.domElement.addEventListener('click', (event) => {
  const index = pickBuilding(event, campus.renderer.domElement, campus.camera, campus.clickableObjects)
  if (index !== null) select(index)
})

const onResize = () => campus.resize()
onResize()
window.addEventListener('resize', onResize)

const timer = new THREE.Timer()
timer.connect(document)
const animate = (t?: number) => {
  timer.update(t)
  campus.render(timer.getElapsed())
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npm run build`
Expected: 通过，无未用变量告警。

- [ ] **Step 3: 全量测试**

Run: `npx vitest run`
Expected: geo + data 测试全部 PASS。

- [ ] **Step 4: 可视验证（关键）**

Run: `npm run dev`，浏览器打开本地地址。
Expected：**道路与建筑对齐**（道路不再翻到地图另一侧）；建筑、地块、水体、操场、路线位置正确；点击建筑/列表可选中并聚焦。
> 用 `verify` 或 `run` 技能启动并截图核对。若道路仍偏移，停止并回到 systematic-debugging。

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "refactor: slim main.ts into module wiring; fixes road offset end-to-end"
```

---

## Phase 4 — Apple 地图风观感升级

> 坐标已正确、模块已就位。本阶段只调材质/配色/布局，每步后用 `npm run dev` 截图核对。

### Task 10: 样式重构 —— 顶栏与背景

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: 删除旧 hero-copy 样式，新增 topbar 样式**

在 `src/style.css` 中删除 `.hero-copy / .eyebrow / .subtitle / .hero-badges` 相关规则（约 59-110 行）与 `.scene-help`（已不再使用，38 行对应 DOM 已移除），新增：

```css
.topbar {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0));
  pointer-events: none;
}
.topbar .brand { font-weight: 700; font-size: 1.05rem; color: #18324a; }
.topbar .hint { font-size: 0.8rem; color: #5b748f; }
```

- [ ] **Step 2: 背景与 scene-wrap 调为干净浅色**

把 `.scene-wrap` 的 `background` 改为：

```css
  background: #eef3f6;
```

- [ ] **Step 3: 可视核对 + Commit**

Run: `npm run dev`（截图确认顶栏不挡视野、背景干净）
```bash
git add src/style.css
git commit -m "style: replace hero overlay with compact topbar, clean background"
```

### Task 11: 道路观感微调（分级）

**Files:**
- Modify: `src/scene/builders.ts:buildRoads`

- [ ] **Step 1: 道路宽窄分级与描边比例**

将 `buildRoads` 中 `casingOutline` 的加宽量按道路宽度自适应（窄路细边、宽路粗边），替换该行为：

```ts
    const casingWidth = road.width + Math.max(1.6, road.width * 0.3)
    const casingOutline = buildRoadOutline(road.points, casingWidth)
```

- [ ] **Step 2: 可视核对 + Commit**

Run: `npm run dev`（确认主干路/支路层次清晰、描边自然）
```bash
git add src/scene/builders.ts
git commit -m "style(road): width-adaptive casing for clearer road hierarchy"
```

### Task 12: 建筑材质与选中态打磨

**Files:**
- Modify: `src/scene/theme.ts`、`src/scene/builders.ts:buildBuilding`

- [ ] **Step 1: 选中态加轻微 emissive 提示**

在 `buildBuilding` 的 footprint 与 box 两个 body 的 `MeshStandardMaterial` 中，加入选中高亮（两处都改）：

```ts
      new THREE.MeshStandardMaterial({
        color, roughness: 0.85, metalness: 0,
        emissive: selected ? COLORS.selected : '#000000',
        emissiveIntensity: selected ? 0.18 : 0,
      }),
```

- [ ] **Step 2: 可视核对配色（如需微调，改 theme.ts 的 BUILDING_COLOR/COLORS）**

Run: `npm run dev`（确认白顶 + 柔和体色 + 选中粉色高亮的 Apple 地图观感）

- [ ] **Step 3: Commit**

```bash
git add src/scene/theme.ts src/scene/builders.ts
git commit -m "style(building): white roofs, soft palette, selected highlight"
```

### Task 13: 标签去重叠（择优显示）

**Files:**
- Modify: `src/scene/CampusScene.ts:updateLabels`

- [ ] **Step 1: 标签按屏幕距离去重叠**

将 `updateLabels` 方法体替换为带去重叠的版本：

```ts
  private updateLabels(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    const placed: { x: number; y: number }[] = []
    const minGap = 46
    const ranked = this.labels.map((t) => {
      this.tempVector.set(...t.marker.position).project(this.camera)
      return { t, depth: this.tempVector.z, x: ((this.tempVector.x + 1) / 2) * w, y: ((-this.tempVector.y + 1) / 2) * h }
    }).sort((a, b) => a.depth - b.depth)
    for (const r of ranked) {
      const visible = r.depth < 1 && r.depth > -1
      const inside = r.x >= -80 && r.x <= w + 80 && r.y >= -30 && r.y <= h + 30
      const clashes = placed.some((p) => Math.abs(p.x - r.x) < minGap && Math.abs(p.y - r.y) < minGap * 0.5)
      const show = visible && inside && !clashes
      r.t.element.style.opacity = show ? '1' : '0'
      r.t.element.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)`
      if (show) placed.push({ x: r.x, y: r.y })
    }
  }
```

- [ ] **Step 2: 类型检查 + 可视核对**

Run: `npm run build && npm run dev`
Expected: 通过；密集区标签不再糊成一团。

- [ ] **Step 3: Commit**

```bash
git add src/scene/CampusScene.ts
git commit -m "style(labels): declutter overlapping map labels by depth priority"
```

### Task 14: 收尾验证

- [ ] **Step 1: 全量测试 + 构建**

Run: `npx vitest run && npm run build`
Expected: 全 PASS，构建成功。

- [ ] **Step 2: 完整可视走查**

Run: `npm run dev`，逐项核对：道路对齐、无 z-fighting 闪烁、建筑观感、标签清晰、点击/聚焦、概览相机。用 `verify` 技能记录截图。

- [ ] **Step 3: 清理 .editor-backups（用户确认丢弃）**

```bash
git rm -r --cached .editor-backups 2>/dev/null || true
rm -rf .editor-backups
echo ".editor-backups/" >> .gitignore
git add .gitignore
git commit -m "chore: drop incomplete .editor-backups snapshots"
```

- [ ] **Step 4: 更新 README 功能描述（移除已删的编辑器/旧 UI 描述，补充模块结构）**

将 `README.md` 中"后续手工编辑入口"等过时段落更新为当前结构（`src/scene/*` 模块、`src/data/campus.json` 数据源、编辑器为后续计划）。

```bash
git add README.md
git commit -m "docs: update README for modular scene structure"
```

---

## Self-Review 结论

- **Spec 覆盖**：坐标唯一映射(Task3) / 数据重整(Task2) / 模块化(Task4-9) / Apple 风+无投影+道路描边+分层(Task10-13) / 测试护栏(Task1,3) / 丢弃 backups(Task14) 均有对应任务。阶段 5 编辑器按 spec 风险说明另立计划。
- **类型一致性**：`CampusScene` 公共成员（`renderer/camera/clickableObjects/setData/setSelected/setOverviewCamera/focusBuilding/resize/render`）与 main.ts 调用点一致；builders 导出名与 CampusScene 导入一致；`buildRoadOutline/flatPolygon/extrudeFootprint/footprintShape` 在 geo 定义并在 builders 使用，签名一致。
- **无占位符**：每个改动步骤含完整代码或精确迁移指令（含源行号）。
```
