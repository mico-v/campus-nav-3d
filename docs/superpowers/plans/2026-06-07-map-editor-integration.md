# 地图编辑器整合 + 卫星底图修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `feat/map-editor` 的独立 2D 地图编辑器 cherry-pick 进当前 main，统一数据源到 `campus.json`，并修复卫星底图不显示的问题。

**Architecture:** 编辑器是自包含的 `src/editor/*` 模块 + dev-server API 后端，仅通过 `CampusData` 类型与 3D 渲染器耦合。整合 = 复制文件 + 调和 vite/package 配置 + 把后端数据路径指向 `campus.json`。底图修复 = 让 SVG 不透明 ground 矩形在底图启用时透明（消除遮挡）。

**Tech Stack:** Vite 8 多页构建 + TypeScript + Vitest（+ happy-dom 用于编辑器 DOM 测试）。

**Spec:** `docs/superpowers/specs/2026-06-07-map-editor-integration-design.md`

**关键已核实事实：**
- 编辑器 `src/editor/*` 不依赖任何已删除的坐标 hack（0 命中）。
- 后端 `validateCampusData` 只校验必填字段，**不拒绝额外字段** → `footprint` 自动放行。
- 客户端 `api.ts` 与后端均用 **PUT** `/api/campus`。
- 我们的 `campus.json` 有 `name`(string) 和 `bounds.{width,depth}`(number) → 通过后端校验。
- DOM 测试用 per-file `// @vitest-environment happy-dom`；其余用全局 node 环境 → 与现配置兼容。
- 底图遮挡根因：SVG `ground` 层画不透明深色矩形 `fill:'#0c1a2e'`，DOM 中排在 `<img>` 之后，盖住底图。
- ArcGIS `export` 端点实测 HTTP 200 返回真实 PNG；bbox 经纬跨度 ~1.23km（合理）。问题在显示层，非端点/数据。

---

## File Structure

```
editor.html                          # 新增：编辑器入口页（多页第二入口）
src/editor/main.ts                   # 新增：编辑器引导
src/editor/canvas2d.ts               # 新增：2D SVG 画布（含底图，需改 ground 透明）
src/editor/store.ts                  # 新增：可变数据 + 撤销/重做
src/editor/form.ts                   # 新增：属性表单
src/editor/geometry.ts               # 新增：几何工具
src/editor/projection.ts             # 新增：世界↔屏幕投影
src/editor/api.ts                    # 新增：/api/campus 客户端
src/editor/types.ts                  # 新增：LayerFlags 等
src/editor/editor.css                # 新增：编辑器样式
src/editor/*.test.ts                 # 新增：8 个编辑器测试
vite-plugin-campus-api.ts            # 新增：dev API 中间件（DATA_PATH 改 campus.json）
tools/campus-store.ts                # 新增：后端读写/校验
tools/campus-store.test.ts           # 新增：后端测试
tests/backdrop-geo.test.ts           # 新增：底图坐标换算单测
vite.config.ts                       # 改：多页入口 + campusApiPlugin
vitest.config.ts                     # 改：include 扩到 src/** 和 tools/**
package.json                         # 改：加 happy-dom
```

---

## Phase A — 编辑器整合

### Task 1: Cherry-pick 编辑器文件并修正数据路径

**Files:**
- Create（从分支复制）: 见下方 git checkout 列表
- Modify: `vite-plugin-campus-api.ts`（DATA_PATH）

- [ ] **Step 1: 从 feat/map-editor 精确复制编辑器文件**

Run:
```bash
git checkout feat/map-editor -- \
  src/editor \
  editor.html \
  vite-plugin-campus-api.ts \
  tools/campus-store.ts \
  tools/campus-store.test.ts
```
Expected: 这些路径出现在工作区（`git status` 显示 new files）。`src/editor/` 含 9 个 `.ts` + `editor.css` + 8 个 `.test.ts`。

- [ ] **Step 2: 确认复制结果**

Run: `ls src/editor/ && ls tools/ && test -f editor.html && echo OK`
Expected: 列出 canvas2d/store/form/geometry/projection/api/types/main/editor.css + 各 test；`tools/campus-store.ts`；`editor.html` 存在。

- [ ] **Step 3: 把后端数据路径从 campusData.json 改为 campus.json**

在 `vite-plugin-campus-api.ts` 中，将：
```ts
const DATA_PATH = resolve(process.cwd(), 'src/data/campusData.json')
```
改为：
```ts
const DATA_PATH = resolve(process.cwd(), 'src/data/campus.json')
```

- [ ] **Step 4: 确认编辑器不引用对方旧数据文件**

Run: `grep -rn "campusData.json" src/editor tools vite-plugin-campus-api.ts || echo "无残留引用"`
Expected: `无残留引用`（若有命中，把该引用也改成 `campus.json`，仅限路径字符串）。

- [ ] **Step 5: Commit**

```bash
git add src/editor editor.html vite-plugin-campus-api.ts tools/campus-store.ts tools/campus-store.test.ts
git commit -m "feat(editor): cherry-pick 2D map editor; point backend at campus.json"
```

### Task 2: 配置多页构建、API 插件、测试环境

**Files:**
- Modify: `vite.config.ts`、`vitest.config.ts`、`package.json`

- [ ] **Step 1: 安装 happy-dom**

Run: `npm install -D happy-dom`
Expected: `package.json` devDependencies 出现 `happy-dom`。

- [ ] **Step 2: vite.config.ts 加多页入口 + API 插件**

将 `vite.config.ts` 全文替换为：
```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { campusApiPlugin } from './vite-plugin-campus-api.ts'

export default defineConfig({
  base: './',
  plugins: [campusApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
})
```

- [ ] **Step 3: vitest.config.ts 扩大测试范围**

将 `vitest.config.ts` 的 `include` 改为覆盖编辑器与 tools 测试：
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'tools/**/*.test.ts'],
    passWithNoTests: true,
  },
})
```
（DOM 测试文件各自用 `// @vitest-environment happy-dom` 覆盖为 happy-dom，全局保持 node。）

- [ ] **Step 4: 运行全部测试**

Run: `npx vitest run`
Expected: 原有 14 个测试 + 编辑器 8 个 + campus-store 测试全部 PASS。若 happy-dom 报"environment not found"，确认 `npm install -D happy-dom` 成功且 `node_modules/happy-dom` 存在。

- [ ] **Step 5: 多页构建**

Run: `npm run build`
Expected: tsc 通过；vite 构建产出 `dist/index.html` 和 `dist/editor.html` 两个页面。
Run: `test -f dist/index.html && test -f dist/editor.html && echo "两页都构建成功"`

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts vitest.config.ts package.json package-lock.json
git commit -m "build: multipage (index+editor) + campus-api plugin + happy-dom test env"
```

### Task 3: 验证数据契约（编辑器 ↔ campus.json，footprint 保留）

**Files:**
- Create: `tools/campus-store.footprint.test.ts`

- [ ] **Step 1: 写测试——footprint 数据存盘往返保留**

Create `tools/campus-store.footprint.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCampusData, validateCampusData, serializeCampusData } from './campus-store'
import { createDefaultCampusData } from '../src/data/campusData'

describe('campus-store 保留 footprint 字段', () => {
  it('校验通过含 footprint 的 zone/water/field 数据', () => {
    const data = createDefaultCampusData()
    // 不抛错即通过
    expect(() => validateCampusData(data)).not.toThrow()
  })

  it('保存后磁盘文件仍包含 zone/water/field 的 footprint', async () => {
    const data = createDefaultCampusData()
    const zoneWithFp = data.zones.find((z) => z.footprint && z.footprint.length >= 3)
    expect(zoneWithFp, '测试数据应至少有一个带 footprint 的 zone').toBeTruthy()

    const dir = await mkdtemp(join(tmpdir(), 'campus-fp-'))
    try {
      const dataPath = join(dir, 'campus.json')
      const backupDir = join(dir, 'backups')
      await saveCampusData(dataPath, backupDir, data, '2026-06-07T00:00:00.000Z')
      const written = JSON.parse(await readFile(dataPath, 'utf8'))
      const writtenZone = written.zones.find((z: { id: string }) => z.id === zoneWithFp!.id)
      expect(writtenZone.footprint).toEqual(zoneWithFp!.footprint)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tools/campus-store.footprint.test.ts`
Expected: PASS。若第一个用例失败（validate 抛错），说明后端校验拒绝了某字段——读报错信息，按需在 `validateCampusData` 放行该字段（仅当确为合法字段）。若第二个失败，说明 `serializeCampusData` 丢了字段（不应发生，因为它是 `JSON.stringify` 全量）。

- [ ] **Step 3: 验证 createDefaultCampusData 是 97 楼（确认编辑器吃我们的数据）**

Run: `npx vite-node -e "import('./src/data/campusData.ts').then(m=>console.log('buildings', m.createDefaultCampusData().buildings.length))"`
Expected: `buildings 97`。

- [ ] **Step 4: Commit**

```bash
git add tools/campus-store.footprint.test.ts
git commit -m "test: campus-store preserves zone/water/field footprint round-trip"
```

---

## Phase B — 卫星底图修复

### Task 4: 消除 SVG ground 对底图的遮挡

**Files:**
- Modify: `src/editor/canvas2d.ts`（render 中 ground 矩形绘制）

**背景：** `render()` 里 `ground` 层画一个 `fill:'#0c1a2e'`（不透明深色）的矩形覆盖整个数据范围，盖住底层 `<img>` 底图。修复：当底图处于启用且已成功显示状态时，ground 矩形改为透明描边（`fill:'none'`），让底图透出；底图未启用时维持原深色背景。

- [ ] **Step 1: 在 canvas2d.ts 增加"底图是否激活"的内部状态读取**

确认类中已有 `private mapBackdropConfig: MapBackdropConfig | null`（构造时为 null，`setMapBackdrop` 设置）。在绘制 ground 处依据它判断。找到 `render()` 中 ground 矩形绘制（约 598-612 行）：
```ts
    const ground = this.layerGroup('ground')
    const [gx1, gy1] = this.toScreen(bounds.minX, bounds.minZ)
    const [gx2, gy2] = this.toScreen(bounds.maxX, bounds.maxZ)
    ground.appendChild(
      svg('rect', {
        x: Math.min(gx1, gx2),
        y: Math.min(gy1, gy2),
        width: Math.abs(gx2 - gx1),
        height: Math.abs(gy2 - gy1),
        fill: '#0c1a2e',
        stroke: '#1e3a5f',
        'stroke-width': 1,
      }),
    )
```
替换为（底图激活时 fill 透明，保留描边作边界）：
```ts
    const ground = this.layerGroup('ground')
    const [gx1, gy1] = this.toScreen(bounds.minX, bounds.minZ)
    const [gx2, gy2] = this.toScreen(bounds.maxX, bounds.maxZ)
    const backdropActive = this.mapBackdropConfig !== null
    ground.appendChild(
      svg('rect', {
        x: Math.min(gx1, gx2),
        y: Math.min(gy1, gy2),
        width: Math.abs(gx2 - gx1),
        height: Math.abs(gy2 - gy1),
        fill: backdropActive ? 'none' : '#0c1a2e',
        stroke: '#1e3a5f',
        'stroke-width': 1,
      }),
    )
```

- [ ] **Step 2: 确认其它层不再有不透明全覆盖背景**

Run: `grep -nE "fill: '#0c1a2e'|fill: '#0b1426'|fill: '#16233b'" src/editor/canvas2d.ts || echo "无其它不透明全幅背景"`
Expected: 仅剩 ground 那处（已改为条件）。若有别的全幅不透明矩形也需同样条件化——但只针对覆盖整个 bounds 的背景矩形，不要动建筑/地块本身的填充。

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npm run build && npx vitest run`
Expected: 通过；测试数不减。

- [ ] **Step 4: Commit**

```bash
git add src/editor/canvas2d.ts
git commit -m "fix(editor): make ground transparent when satellite backdrop active (was occluding it)"
```

### Task 5: 底图坐标换算单元测试（node 可验证部分）

**Files:**
- Modify: `src/editor/canvas2d.ts`（导出 `buildWorldToGeo` 的纯函数版以便测试）
- Create: `tests/backdrop-geo.test.ts`

**背景：** `buildWorldToGeo` 当前是 `Canvas2D` 私有方法，依赖 DOM 无法直接测。把其纯数学抽成模块级导出纯函数，既可单测又不改行为。

- [ ] **Step 1: 抽出纯函数 worldBoundsToGeo**

在 `src/editor/canvas2d.ts` 顶部（类外，靠近其它模块级 helper）新增导出纯函数：
```ts
export interface GeoBox { minLat: number; maxLat: number; minLon: number; maxLon: number }

// 纯函数：世界 bounds + 锚点经纬 → 经纬 bbox。无 DOM 依赖，可单测。
export function worldBoundsToGeo(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  opts: { latitude: number; longitude: number; metersPerWorldUnit?: number; zToLatitude?: number },
): GeoBox {
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const zToLatitude = opts.zToLatitude ?? 1
  const metersPerUnit = opts.metersPerWorldUnit ?? 1
  const metersPerLon = 111_320 * Math.cos(opts.latitude * (Math.PI / 180))
  const metersPerLat = 110_574
  const minLat = opts.latitude + ((bounds.minZ - centerZ) * metersPerUnit * zToLatitude) / metersPerLat
  const maxLat = opts.latitude + ((bounds.maxZ - centerZ) * metersPerUnit * zToLatitude) / metersPerLat
  const minLon = opts.longitude + ((bounds.minX - centerX) * metersPerUnit) / metersPerLon
  const maxLon = opts.longitude + ((bounds.maxX - centerX) * metersPerUnit) / metersPerLon
  return {
    minLat: Math.min(minLat, maxLat),
    maxLat: Math.max(minLat, maxLat),
    minLon: Math.min(minLon, maxLon),
    maxLon: Math.max(minLon, maxLon),
  }
}
```
然后把私有方法 `buildWorldToGeo` 的方法体改为委托此纯函数（保留 clamp 行为）：
```ts
  private buildWorldToGeo(bounds: ViewBounds, config: MapBackdropConfig): MapBoundsGeo {
    const geo = worldBoundsToGeo(bounds, {
      latitude: config.latitude,
      longitude: config.longitude,
      metersPerWorldUnit: config.metersPerWorldUnit,
      zToLatitude: config.zToLatitude,
    })
    return {
      minLat: clamp(geo.minLat, -85, 85),
      maxLat: clamp(geo.maxLat, -85, 85),
      minLon: clamp(geo.minLon, -180, 180),
      maxLon: clamp(geo.maxLon, -180, 180),
    }
  }
```

- [ ] **Step 2: 写测试**

Create `tests/backdrop-geo.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { worldBoundsToGeo } from '../src/editor/canvas2d'

describe('worldBoundsToGeo', () => {
  const anchor = { latitude: 31.251759, longitude: 120.572634 }

  it('中心点映射回锚点经纬', () => {
    const geo = worldBoundsToGeo({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, anchor)
    expect((geo.minLat + geo.maxLat) / 2).toBeCloseTo(anchor.latitude, 6)
    expect((geo.minLon + geo.maxLon) / 2).toBeCloseTo(anchor.longitude, 6)
  })

  it('校区量级的世界范围产生合理的经纬跨度(<3km)', () => {
    const geo = worldBoundsToGeo({ minX: -693, maxX: 2120, minZ: -224, maxZ: 996 }, anchor)
    const latSpanKm = (geo.maxLat - geo.minLat) * 110.574
    const lonSpanKm = (geo.maxLon - geo.minLon) * 111.32 * Math.cos(anchor.latitude * Math.PI / 180)
    expect(latSpanKm).toBeGreaterThan(0)
    expect(latSpanKm).toBeLessThan(3)
    expect(lonSpanKm).toBeGreaterThan(0)
    expect(lonSpanKm).toBeLessThan(5)
  })

  it('minLat 始终 <= maxLat（不论 zToLatitude 正负）', () => {
    const flipped = worldBoundsToGeo({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, { ...anchor, zToLatitude: -1 })
    expect(flipped.minLat).toBeLessThanOrEqual(flipped.maxLat)
  })
})
```

- [ ] **Step 3: 运行测试 + 构建**

Run: `npx vitest run tests/backdrop-geo.test.ts && npm run build`
Expected: 3 个断言 PASS；构建通过。

- [ ] **Step 4: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/editor/canvas2d.ts tests/backdrop-geo.test.ts
git commit -m "test(editor): extract worldBoundsToGeo pure fn + bbox sanity tests"
```

### Task 6: 浏览器验证清单（用户手动）

**Files:** 无代码改动；本任务产出验证步骤并记录结果。

- [ ] **Step 1: 启动 dev 并打开编辑器**

Run: `npm run dev`，浏览器打开 `http://localhost:5173/editor.html`
Expected: 编辑器加载，顶栏/画布/表单可见；非只读模式（无"只读模式"横幅）。

- [ ] **Step 2: 确认卫星底图显示**

观察画布背景：应能看到苏州科技大学石湖校区的**卫星影像**透出，建筑/道路/地块叠加其上。
- 若显示：底图修复成功。
- 若仍空白：打开浏览器控制台，查看是否有 `Map backdrop image failed, tried providers:` 警告。把控制台输出反馈给负责人以便迭代（可能需调整 provider、投影或 CORS 处理）。

- [ ] **Step 3: 验证编辑→保存→3D 闭环**

在编辑器中拖动一条道路的某个点 → 点"保存" → 应提示成功（写回 `src/data/campus.json`，并在 `.editor-backups/` 生成备份）。打开 `http://localhost:5173/`（3D 页）刷新 → 该道路位置应已更新。

- [ ] **Step 4: 记录验证结果**

把第 2、3 步结果（成功/失败 + 控制台信息）反馈，决定是否需要底图迭代或收尾。

---

## Self-Review 结论

- **Spec 覆盖**：cherry-pick(Task1) / 多页+插件+happy-dom(Task2) / 数据契约+footprint(Task3) / 底图遮挡修复(Task4) / 坐标换算测试(Task5) / 浏览器验证(Task6) 均有对应任务。数据源统一到 campus.json：Task1 Step3 + Task3。
- **验证约束**：底图最终显示由 Task6 用户浏览器验证（spec 已声明此约束）。
- **类型/契约一致**：DATA_PATH→campus.json、PUT 端点、validateCampusData 放行 footprint（已核实不拒额外字段）、happy-dom per-file 环境——均与已核实事实一致。
- **无占位符**：每步含真实命令/代码。文件复制用 `git checkout feat/map-editor -- <paths>` 取精确内容，避免手抄。
