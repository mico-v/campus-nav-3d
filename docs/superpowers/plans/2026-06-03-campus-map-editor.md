# 校园地图可视化编辑后端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供本地编辑后端 + 类 OSM iD 的 2D 可视化编辑器，编辑校园所有对象的位置/大小/高度/信息并持久化回磁盘。

**Architecture:** 数据从内联 TS 迁移到 `src/data/campusData.json`（唯一数据源）。Vite dev 插件中间件提供 `GET/PUT /api/campus` 读写接口并自动备份。独立 `editor.html` 页面承载 2D 编辑器；3D 展示页 `index.html` 保持只读，import 同一 JSON。

**Tech Stack:** Vite + TypeScript + Three.js（展示页）、原生 DOM + SVG（编辑器画布）、Vitest（纯逻辑测试）、Node fs（后端）。

**约束（来自 tsconfig）：** `verbatimModuleSyntax`（类型导入用 `import type`）、`erasableSyntaxOnly`（禁运行时 enum/namespace）、`noUnusedLocals/Parameters`、`allowImportingTsExtensions`（相对导入带 `.ts`）。

---

## File Structure

- `src/data/campusData.json` — **新建**，迁移后的数据源。
- `src/data/campusData.ts` — **改**，瘦身为类型 + JSON 加载器；新增 `info?` 字段。
- `tools/campus-store.ts` — **新建**，后端读写/校验/备份的纯逻辑（可被 vitest 测）。
- `vite-plugin-campus-api.ts` — **新建**，Vite 中间件，调用 `tools/campus-store.ts`。
- `vite.config.ts` — **改**，注册插件 + 多页 build 入口。
- `editor.html` — **新建**，编辑器入口页。
- `src/editor/types.ts` — **新建**，编辑器内部类型（Selection、ViewState 等）。
- `src/editor/geometry.ts` — **新建**，纯几何辅助。
- `src/editor/projection.ts` — **新建**，世界↔屏幕变换 + pan/zoom。
- `src/editor/store.ts` — **新建**，工作副本/选择/撤销重做/dirty。
- `src/editor/api.ts` — **新建**，load/save 客户端。
- `src/editor/canvas2d.ts` — **新建**，2D 渲染 + 指针交互。
- `src/editor/form.ts` — **新建**，属性表单。
- `src/editor/main.ts` — **新建**，装配。
- `src/editor/editor.css` — **新建**，编辑器样式。
- `tsconfig.json` — **改**，`resolveJsonModule`，排除 `*.test.ts`。
- `package.json` — **改**，加 vitest + `test` 脚本。
- `.gitignore` — **改**，加 `.editor-backups/`。

---

## Task 1: 数据迁移到 JSON + 瘦身 campusData.ts

**Files:**
- Create: `src/data/campusData.json`
- Modify: `src/data/campusData.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: 生成 JSON** — 写一次性 Node 脚本把现有 `baseCampusData` 对象序列化到 `src/data/campusData.json`（`JSON.stringify(data, null, 2)`）。因为现数据已是 JSON 字面量结构，可直接用脚本 require 编译或手工提取 `baseCampusData` 字面量。校验：`node -e "JSON.parse(require('fs').readFileSync('src/data/campusData.json'))"` 无错。
- [ ] **Step 2: 改 tsconfig** — 在 `compilerOptions` 加 `"resolveJsonModule": true`；在顶层加 `"exclude": ["src/**/*.test.ts"]`。
- [ ] **Step 3: 瘦身 campusData.ts** — 保留所有 `export interface/type/const buildingCategoryOptions`；给 `Building` 与 `PoiMarker` 各加 `info?: string`；删除内联 `baseCampusData` 字面量，替换为：

```ts
import rawData from './campusData.json'
const baseCampusData = rawData as CampusData
export function cloneCampusData(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}
export function createDefaultCampusData(): CampusData {
  return cloneCampusData(baseCampusData)
}
export const campusData = createDefaultCampusData()
```

- [ ] **Step 4: 验证** — `npm run build`（tsc + vite build）通过；`npm run dev` 打开 3D 展示页渲染与迁移前一致（建筑/道路/POI 数量不变）。
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: migrate campus data to JSON source"`

---

## Task 2: 后端纯逻辑 campus-store + 校验（TDD）

**Files:**
- Create: `tools/campus-store.ts`
- Create: `tools/campus-store.test.ts`

接口：

```ts
export interface SaveResult { ok: true; backupPath: string }
export function validateCampusData(value: unknown): asserts value is CampusData // 抛 Error(消息) 表示非法
export function serializeCampusData(data: CampusData): string  // JSON.stringify(data, null, 2) + '\n'
export async function loadCampusData(dataPath: string): Promise<unknown>
export async function saveCampusData(dataPath: string, backupDir: string, data: unknown): Promise<SaveResult>
```

校验规则：顶层必须有 `name:string`、`bounds:{width,depth}`、数组 `zones/buildings/roads/waters/fields/trees/pois/routes`；逐元素检查关键字段类型（如 building 必须有 `id:string,name:string,category:string,position:[number,number],size:[number,number],height:number`）。

`saveCampusData`：先 `validateCampusData`；若原文件存在，复制到 `backupDir/<isoSafeTimestamp>.json`；写 `dataPath.tmp` 再 `rename` 到 `dataPath`（原子）。

- [ ] **Step 1: 失败测试** — `tools/campus-store.test.ts`：
  - `validateCampusData` 对合法最小对象不抛；缺 `buildings` 抛；building.height 为字符串抛。
  - `serializeCampusData` 输出可被 `JSON.parse` 还原且以换行结尾。
  - `saveCampusData` 写到临时目录后，文件内容等于 serialize 结果，且 backup 目录生成了一个备份文件（用 `node:os.tmpdir()` + 固定子目录；不可用 `Date.now`，时间戳由调用方传入或用递增计数——见下）。
- [ ] **Step 2: 运行测试看失败** — `npx vitest run tools/campus-store.test.ts`，Expected: FAIL（模块未实现）。
- [ ] **Step 3: 实现 campus-store.ts** — 备份文件名时间戳：`saveCampusData` 接受可选 `now: string` 参数（默认由调用方在中间件里用 `new Date().toISOString()` 传入；测试里传固定字符串），避免纯逻辑里直接调时间 API。
- [ ] **Step 4: 运行测试看通过** — `npx vitest run tools/campus-store.test.ts`，Expected: PASS。
- [ ] **Step 5: Commit** — `git add tools && git commit -m "feat: add campus-store backend logic with validation"`

---

## Task 3: Vite 中间件插件 + 多页构建

**Files:**
- Create: `vite-plugin-campus-api.ts`
- Modify: `vite.config.ts`
- Modify: `.gitignore`

插件 `configureServer(server)` 注册中间件，匹配 `/api/campus`：
- `GET` → `loadCampusData` → `200 application/json`。
- `PUT` → 读 body（聚合 chunk）→ `JSON.parse` → `saveCampusData(dataPath, backupDir, data, new Date().toISOString())` → 成功 `200 {ok:true,backupPath}`；`JSON.parse`/校验失败 `400 {error}`；其他 `500`。
- 路径常量：`dataPath = src/data/campusData.json`，`backupDir = .editor-backups`（用 `import.meta.dirname` 或 `process.cwd()` 解析绝对路径）。

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { campusApiPlugin } from './vite-plugin-campus-api'

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

`.gitignore` 追加 `.editor-backups/`。

- [ ] **Step 1: 实现插件 + 改 config + gitignore。**
- [ ] **Step 2: 验证 GET** — `npm run dev`，另开终端 `curl -s localhost:5173/api/campus | head -c 80` 返回 JSON 开头。
- [ ] **Step 3: 验证 PUT** — `curl -s -X PUT localhost:5173/api/campus -H 'content-type: application/json' --data-binary @src/data/campusData.json` 返回 `{"ok":true,...}`，且 `.editor-backups/` 生成备份文件。错误体测试：`curl -X PUT ... -d '{}'` 返回 400。
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: add dev api middleware for campus data + multipage build"`

---

## Task 4: 几何辅助（TDD）

**Files:**
- Create: `src/editor/geometry.ts`
- Create: `src/editor/geometry.test.ts`

接口（纯函数，全部针对世界坐标 `[x,z]`）：

```ts
export type Point = [number, number]
export function polygonCentroid(points: Point[]): Point
export function polygonBounds(points: Point[]): { minX:number; maxX:number; minZ:number; maxZ:number; width:number; depth:number }
export function insertVertex(points: Point[], edgeIndex: number, at: Point): Point[]   // 在 edgeIndex 与下一个点之间插入
export function removeVertex(points: Point[], index: number): Point[]                   // 少于 3 点时拒绝（返回原数组）
export function moveVertex(points: Point[], index: number, to: Point): Point[]
export function distance(a: Point, b: Point): number
export function nearestVertex(points: Point[], target: Point, maxDist: number): number | null
export function nearestEdge(points: Point[], target: Point, maxDist: number): { index:number; point:Point } | null // 投影到线段
export function pointInPolygon(point: Point, polygon: Point[]): boolean
export function translatePoints(points: Point[], dx: number, dz: number): Point[]
```

- [ ] **Step 1: 失败测试** `geometry.test.ts`：
  - `polygonCentroid([[0,0],[4,0],[4,4],[0,4]])` ≈ `[2,2]`。
  - `polygonBounds` 上例 width=4 depth=4。
  - `insertVertex([[0,0],[4,0]],0,[2,0])` → 3 点且中间为 `[2,0]`。
  - `removeVertex` 3 点时返回原数组（不破坏多边形）；4 点时删成 3 点。
  - `nearestVertex([[0,0],[10,0]],[0.5,0],1)` → 0；超出 maxDist → null。
  - `nearestEdge([[0,0],[10,0]],[5,0.5],1)` → index 0, point≈[5,0]。
  - `pointInPolygon([2,2], 正方形)` true；`[5,5]` false。
- [ ] **Step 2: 运行看失败** — `npx vitest run src/editor/geometry.test.ts`，Expected: FAIL。
- [ ] **Step 3: 实现 geometry.ts。**
- [ ] **Step 4: 运行看通过** — Expected: PASS。
- [ ] **Step 5: Commit** — `git commit -m "feat: add editor geometry helpers"`

---

## Task 5: 投影与视图（projection）

**Files:**
- Create: `src/editor/projection.ts`

```ts
export interface ViewState { scale: number; offsetX: number; offsetY: number } // screen = world*scale + offset
export function worldToScreen(v: ViewState, x: number, z: number): [number, number]
export function screenToWorld(v: ViewState, sx: number, sy: number): [number, number]
export function fitView(bounds: {minX:number;maxX:number;minZ:number;maxZ:number}, width:number, height:number, pad:number): ViewState
export function zoomAt(v: ViewState, sx: number, sy: number, factor: number): ViewState // 以光标为锚缩放
export function pan(v: ViewState, dxScreen: number, dyScreen: number): ViewState
```

- [ ] **Step 1: 实现 projection.ts**（worldToScreen/screenToWorld 互逆；fitView 让 bounds 居中铺满）。
- [ ] **Step 2: 快速自测** — 临时 `npx vitest` 一条断言 `screenToWorld(worldToScreen(...))` 往返一致（可并入 geometry.test 或新建 projection.test.ts）。建议直接建 `projection.test.ts` 测往返与 fitView 居中。
- [ ] **Step 3: Commit** — `git commit -m "feat: add editor 2d projection/view helpers"`

---

## Task 6: Store（工作副本/选择/撤销/dirty）

**Files:**
- Create: `src/editor/types.ts`
- Create: `src/editor/store.ts`

`types.ts`：

```ts
export type EntityKind = 'building'|'road'|'zone'|'water'|'field'|'poi'|'routePoint'
export type Selection =
  | { kind: 'building'|'road'|'zone'|'water'|'field'|'poi'; index: number }
  | { kind: 'routePoint'; routeIndex: number; index: number }
  | null
```

`store.ts`：持有 `data: CampusData`、`selection`、`dirty`、撤销/重做栈（存 `data` 的深拷贝快照，上限如 50 步）、订阅者列表。

```ts
export class EditorStore {
  constructor(initial: CampusData)
  get data(): CampusData
  get selection(): Selection
  get dirty(): boolean
  subscribe(fn: () => void): () => void
  select(sel: Selection): void
  // mutate: 接收一个修改函数，先 pushUndo(快照) 再修改，置 dirty，通知
  mutate(label: string, fn: (data: CampusData) => void): void
  undo(): void
  redo(): void
  markSaved(): void          // dirty=false
  replaceAll(data: CampusData): void
}
```

- [ ] **Step 1: 失败测试** `store.test.ts`：`mutate` 后 `dirty=true` 且数据变；`undo` 恢复且不影响其它字段；`redo` 重做；`markSaved` 清 dirty；`subscribe` 在 mutate/undo 时被调用。
- [ ] **Step 2: 运行看失败。**
- [ ] **Step 3: 实现 store.ts + types.ts。**
- [ ] **Step 4: 运行看通过。**
- [ ] **Step 5: Commit** — `git commit -m "feat: add editor store with undo/redo"`

---

## Task 7: API 客户端

**Files:**
- Create: `src/editor/api.ts`

```ts
export async function loadCampus(): Promise<CampusData>           // GET /api/campus
export async function saveCampus(data: CampusData): Promise<{ ok: true; backupPath: string }> // PUT
export class ApiUnavailableError extends Error {}
```

`loadCampus` 失败（fetch 抛或非 200）→ 抛 `ApiUnavailableError`，调用方回退到 `createDefaultCampusData()` 并进入只读。

- [ ] **Step 1: 实现 api.ts。**
- [ ] **Step 2: Commit** — `git commit -m "feat: add editor api client"`

---

## Task 8: editor.html + 装配骨架 + 工具栏

**Files:**
- Create: `editor.html`
- Create: `src/editor/editor.css`
- Create: `src/editor/main.ts`

`editor.html`：`#app` 容器，引 `/src/editor/main.ts`。
布局：顶部工具栏（保存按钮 + dirty 圆点 + 撤销/重做 + 图层复选框 + 新增对象下拉 + 删除 + "打开 3D 预览" 链接到 `./index.html`）、左 `#canvas-host`（放 SVG）、右 `#form-host`。

`main.ts` 启动流程：
1. `loadCampus()`（失败→`createDefaultCampusData()` + 顶部红色"只读：后端不可用"提示，禁用保存）。
2. `new EditorStore(data)`。
3. 初始化 `Canvas2D`(host, store) 与 `FormPanel`(host, store)。
4. 工具栏按钮接 store.undo/redo、save（调 `saveCampus` → `markSaved`，按钮态/toast 反馈）、图层显隐（传给 canvas）。
5. `beforeunload`：`store.dirty` 时 `preventDefault` 警告。
6. `store.subscribe` 触发 canvas/form/toolbar 重渲染。

- [ ] **Step 1: 写 editor.html + editor.css + main.ts（先接 store/save/undo，canvas 与 form 用占位，确保页面能开、保存能通）。**
- [ ] **Step 2: 验证** — `npm run dev` 打开 `/editor.html`：工具栏显示，点保存返回成功 toast，`.editor-backups` 有新备份。
- [ ] **Step 3: Commit** — `git commit -m "feat: scaffold editor page, toolbar, save flow"`

---

## Task 9: Canvas2D 渲染

**Files:**
- Create: `src/editor/canvas2d.ts`

职责：用 SVG 顶视渲染全部图层；维护 `ViewState`；暴露 `render()`、`setLayers(flags)`、pan/zoom 事件。渲染顺序：地块边界矩形 → zones（半透明矩形）→ waters/fields（矩形）→ roads（polyline，按 width 描边）→ buildings（footprint polygon 或 size 矩形）→ route（polyline+点）→ pois（圆点）。选中对象高亮描边；选中建筑额外画 footprint 顶点小方块、道路画节点圆。世界→屏幕用 `projection`。

- [ ] **Step 1: 实现渲染（只读显示，无交互）+ 在 main.ts 用真实 Canvas2D 替换占位 + fitView 初始视图。**
- [ ] **Step 2: 验证** — `/editor.html` 顶视图显示全部对象，与 3D 展示位置一致；滚轮缩放、拖空白平移可用。
- [ ] **Step 3: Commit** — `git commit -m "feat: render campus top-down view in editor canvas"`

---

## Task 10: Canvas2D 交互（选择 + 拖拽 + 顶点编辑）

**Files:**
- Modify: `src/editor/canvas2d.ts`

命中测试用 `geometry`（pointInPolygon / nearestVertex / nearestEdge）+ 屏幕坐标。pointerdown 判定：
- 命中选中建筑的顶点 → 拖该顶点（`moveVertex`，无 footprint 建筑则拖 position / size 把手）。
- 命中选中道路的节点 → 拖节点；双击边 → `insertVertex`；选中节点按 Delete → `removeVertex`。
- 命中对象主体 → 选中（`store.select`）；再拖动 → 整体平移（建筑 footprint 用 `translatePoints` 并同步 `position` 质心；road 用 translatePoints；zone/water/field 改 `center`；poi/routePoint 改坐标）。
- 命中空白 → 平移视图。

所有几何修改走 `store.mutate(label, ...)`（自动进撤销栈、置 dirty、通知重渲染）。拖拽过程可临时本地预览，pointerup 时提交一次 mutate（避免撤销栈爆炸）。

- [ ] **Step 1: 实现交互。**
- [ ] **Step 2: 验证** — 拖建筑移动、拖顶点改形、双击加点、Delete 删点、拖道路节点，均实时更新且撤销/重做有效，保存后刷新 3D 展示页看到变化。
- [ ] **Step 3: Commit** — `git commit -m "feat: editor canvas drag/vertex editing"`

---

## Task 11: 属性表单

**Files:**
- Create: `src/editor/form.ts`

按 `store.selection.kind` 渲染对应字段并双向绑定（输入即 `store.mutate`）：
- building：name、category(下拉 `buildingCategoryOptions`)、height(number)、size w/d(number)、color、zoneId(下拉 zones)、info(textarea)、position X/Z(number，精确调位)。
- road：width、color、节点数（只读）。
- zone：name、category、center X/Z、size w/d、color。
- water：name、center X/Z、size w/d、color。
- field：name、center X/Z、size w/d、color、stripeColor。
- poi：name、kind、info、position X/Y/Z、color。
- routePoint：X/Y/Z。
未选中 → 提示"未选择对象"。数值输入做 `Number.isFinite` 守卫，非法不写。

- [ ] **Step 1: 实现 form.ts + 在 main.ts 用真实 FormPanel 替换占位。**
- [ ] **Step 2: 验证** — 选中各类对象表单字段正确；改 height/info/坐标实时反映到画布；撤销可回退。
- [ ] **Step 3: Commit** — `git commit -m "feat: add editor attribute form"`

---

## Task 12: 新增/删除对象 + 收尾验证

**Files:**
- Modify: `src/editor/main.ts`（工具栏新增/删除接线）
- Modify: `src/editor/store.ts`（addEntity/removeSelected 辅助，如需要）

- [ ] **Step 1: 新增** — 工具栏下拉选类型 + "新增"：在当前视图中心创建默认对象（building 默认 size [20,20] height 12 无 footprint；road 两点；zone/water/field 默认矩形；poi 单点），选中它。删除：删当前选中对象（building/road/... splice；routePoint 删点），删前 `confirm`。均走 `store.mutate`。
- [ ] **Step 2: 全量验证** — 见下"Manual verification"。
- [ ] **Step 3: Commit** — `git commit -m "feat: add/remove entities in editor"`

---

## Task 13: 测试与构建收尾

- [ ] **Step 1: package.json** — devDep 加 `vitest`；scripts 加 `"test": "vitest run"`。`npm install`。
- [ ] **Step 2: 跑全部测试** — `npm run test`，Expected: 全部 PASS。
- [ ] **Step 3: 构建** — `npm run build`，Expected: tsc 无错 + 两页（index、editor）产物生成。
- [ ] **Step 4: Commit** — `git commit -m "chore: add vitest test script and deps"`

---

## Manual verification（验收）

1. `npm run dev`，打开 `/index.html` 3D 展示正常；打开 `/editor.html` 顶视图与之一致。
2. 拖建筑移动 / 改 footprint 顶点 / 双击加点 / Delete 删点。
3. 表单改 height、info、X/Z、size、category、color，画布实时更新。
4. 撤销/重做正确。
5. 点保存 → `{ok:true}` toast；`src/data/campusData.json` 落盘更新；`.editor-backups/` 有新备份。
6. 刷新 `/index.html`，3D 展示反映改动（如建筑移动/高度变化）。
7. 关后端（停 dev 用 `vite preview` 或断 fetch）打开编辑器 → 只读提示，保存禁用。
8. `npm run test` 与 `npm run build` 均通过。

## Self-Review 备注

- Spec 全部要素均有对应任务（迁移 T1、后端 T2-3、几何 T4、视图 T5、store T6、api T7、页面/工具栏 T8/T12、画布 T9-10、表单 T11、测试构建 T13）。
- 类型一致性：`Selection`、`ViewState`、`EditorStore.mutate(label,fn)` 在各任务签名统一。
- 无占位符：关键接口与测试用例已给出具体签名与断言。
