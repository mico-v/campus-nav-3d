# 编辑器底图对齐 + 中键平移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 2D 地图编辑器加：中键拖动平移画布；解锁后左键拖动+滑块缩放对齐卫星底图；锁定开关；对齐参数 localStorage 持久化。

**Architecture:** 改 `src/editor/canvas2d.ts`（中键平移分支、`BackdropAlign` 世界坐标状态 + `applyBackdropAlign` 纯函数、底图拖动、lock/scale setters + 变更回调）与 `src/editor/main.ts`（工具栏锁定复选框 + 缩放滑块、localStorage 读写）。对齐在世界空间，故画布平移/缩放时底图自动跟随。

**Tech Stack:** TypeScript + Vite + Vitest（happy-dom 用于 DOM 测试）。

**Spec:** `docs/superpowers/specs/2026-06-08-backdrop-align-pan-design.md`

**已核实事实：**
- `DragState` 是联合类型（canvas2d.ts:51），已有 `{ kind: 'pan' }`。
- `handlePointerMove` 已有 `pan` 分支特殊处理（不走数据 applyDrag）；`handlePointerUp` 仅在 `drag.kind !== 'pan' && dragMoved` 时入撤销栈。
- 字段：`protected view`、`private drag/dragBefore/dragMoved/prevWorld/prevScreen`；`protected toScreen/toWorld`。
- `syncMapBackdrop`（约 624-650）用 `this.toScreen(bounds...)` 定位 `<img>`；geo bbox 请求用 `bounds`。
- 测试用 `class TestCanvas extends Canvas2D` 暴露 protected 方法；`fakeEvent(x,y)` 不含 `button`（默认 undefined → 左键路径，现有测试不受影响）。
- 工具栏 HTML 在 editor/main.ts:61-86，由多个 `<div class="group">` 组成；canvas 在 :109 `setMapBackdrop`，:111 `setLayers`。

---

## File Structure

```
src/editor/canvas2d.ts   # 改：中键平移；BackdropAlign 状态+纯函数+应用；backdrop 拖动；setters+回调
src/editor/main.ts       # 改：工具栏锁定复选框+缩放滑块；localStorage 读写；接回调
src/editor/editor.css    # 改：滑块/开关轻量样式
tests/backdrop-align.test.ts   # 新：applyBackdropAlign 纯函数单测（node）
src/editor/backdrop-pan.test.ts # 新：中键平移 + 解锁拖动 行为测试（happy-dom）
```

---

## Task 1: applyBackdropAlign 纯函数 + 单测

**Files:**
- Modify: `src/editor/canvas2d.ts`（加导出纯函数 + 类型）
- Create: `tests/backdrop-align.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/backdrop-align.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyBackdropAlign, type BackdropAlign } from '../src/editor/canvas2d'

const bounds = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }

describe('applyBackdropAlign', () => {
  it('恒等：offset=0 scale=1 时等于原 bounds', () => {
    const a: BackdropAlign = { offsetX: 0, offsetZ: 0, scale: 1 }
    expect(applyBackdropAlign(bounds, a)).toEqual(bounds)
  })

  it('平移：offset 整体移动矩形', () => {
    const r = applyBackdropAlign(bounds, { offsetX: 10, offsetZ: -20, scale: 1 })
    expect(r).toEqual({ minX: -90, maxX: 110, minZ: -70, maxZ: 30 })
  })

  it('缩放：scale 绕中心放大（中心不变）', () => {
    const r = applyBackdropAlign(bounds, { offsetX: 0, offsetZ: 0, scale: 2 })
    expect((r.minX + r.maxX) / 2).toBeCloseTo(0, 6)
    expect((r.minZ + r.maxZ) / 2).toBeCloseTo(0, 6)
    expect(r.maxX - r.minX).toBeCloseTo(400, 6)
    expect(r.maxZ - r.minZ).toBeCloseTo(200, 6)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/backdrop-align.test.ts`
Expected: FAIL（`applyBackdropAlign` 未导出）。

- [ ] **Step 3: 实现纯函数 + 类型**

在 `src/editor/canvas2d.ts` 顶部（紧邻 `clamp` / `worldBoundsToGeo` 等模块级 helper 处）新增：
```ts
export interface BackdropAlign {
  offsetX: number
  offsetZ: number
  scale: number
}

export const DEFAULT_BACKDROP_ALIGN: BackdropAlign = { offsetX: 0, offsetZ: 0, scale: 1 }

// 纯函数：把数据 bounds 经"绕中心缩放 + 偏移"得到底图覆盖的世界矩形。无 DOM 依赖。
export function applyBackdropAlign(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  align: BackdropAlign,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  const halfW = ((bounds.maxX - bounds.minX) / 2) * align.scale
  const halfH = ((bounds.maxZ - bounds.minZ) / 2) * align.scale
  return {
    minX: cx + align.offsetX - halfW,
    maxX: cx + align.offsetX + halfW,
    minZ: cz + align.offsetZ - halfH,
    maxZ: cz + align.offsetZ + halfH,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/backdrop-align.test.ts`
Expected: 3 PASS。

- [ ] **Step 5: Commit**
```bash
git add src/editor/canvas2d.ts tests/backdrop-align.test.ts
git commit -m "feat(editor): applyBackdropAlign pure fn for backdrop alignment"
```

---

## Task 2: 在 syncMapBackdrop 应用对齐 + setter

**Files:**
- Modify: `src/editor/canvas2d.ts`

- [ ] **Step 1: 加字段**

在类字段区（`private drag: DragState | null = null` 附近）新增：
```ts
  private backdropAlign: BackdropAlign = { ...DEFAULT_BACKDROP_ALIGN }
  private backdropLocked = true
  onBackdropAlignChange: ((align: BackdropAlign) => void) | null = null
```

- [ ] **Step 2: 加 setters（放在 setMapBackdrop 方法附近）**
```ts
  setBackdropAlign(align: BackdropAlign): void {
    this.backdropAlign = { offsetX: align.offsetX, offsetZ: align.offsetZ, scale: clamp(align.scale, 0.2, 5) }
    this.render()
  }

  setBackdropLocked(locked: boolean): void {
    this.backdropLocked = locked
  }

  setBackdropScale(scale: number): void {
    this.backdropAlign = { ...this.backdropAlign, scale: clamp(scale, 0.2, 5) }
    this.onBackdropAlignChange?.(this.backdropAlign)
    this.render()
  }

  getBackdropAlign(): BackdropAlign {
    return { ...this.backdropAlign }
  }
```

- [ ] **Step 3: 在 syncMapBackdrop 应用对齐定位**

在 `syncMapBackdrop` 中，把定位用的两角从原始 `bounds` 改为对齐后的世界矩形。找到：
```ts
    const [x1, y1] = this.toScreen(bounds.minX, bounds.minZ)
    const [x2, y2] = this.toScreen(bounds.maxX, bounds.maxZ)
```
替换为：
```ts
    const aligned = applyBackdropAlign(bounds, this.backdropAlign)
    const [x1, y1] = this.toScreen(aligned.minX, aligned.minZ)
    const [x2, y2] = this.toScreen(aligned.maxX, aligned.maxZ)
```
（geo bbox 的 `configKey` 与 `fetchMapBackdropImage(bounds)` 仍用原始 `bounds` 不变——卫星图像内容不变，仅贴图位置/大小随对齐改变。）

- [ ] **Step 4: 构建 + 全量测试**

Run: `npm run build && npx vitest run`
Expected: 通过；测试数不减。

- [ ] **Step 5: Commit**
```bash
git add src/editor/canvas2d.ts
git commit -m "feat(editor): apply backdrop alignment in syncMapBackdrop + setters"
```

---

## Task 3: 中键平移 + 解锁拖动底图

**Files:**
- Modify: `src/editor/canvas2d.ts`
- Create: `src/editor/backdrop-pan.test.ts`

- [ ] **Step 1: DragState 增加 backdrop 类型**

在 `type DragState =` 联合中加一行（在 `| { kind: 'pan' }` 之后）：
```ts
  | { kind: 'backdrop' }
```

- [ ] **Step 2: handlePointerDown 加中键平移 + 解锁底图拖动**

找到 `handlePointerDown` 开头：
```ts
  protected handlePointerDown(event: PointerEvent): void {
    const screen = this.pointerToScreen(event)
    const world = this.toWorld(screen[0], screen[1])

    // 1) grab a handle of the current selection
```
在 `const world = ...` 之后、`// 1) grab a handle` 之前插入：
```ts
    // 0) 中键(滚轮键) → 始终平移画布，无视光标下内容
    if (event.button === 1) {
      event.preventDefault()
      this.startDrag({ kind: 'pan' }, world, screen, event.pointerId)
      return
    }

    // 0b) 底图解锁(对齐模式) → 左键拖动平移底图，暂停元素编辑
    if (!this.backdropLocked) {
      this.startDrag({ kind: 'backdrop' }, world, screen, event.pointerId)
      return
    }
```

- [ ] **Step 3: handlePointerMove 加 backdrop 分支**

找到 `handlePointerMove` 的 pan 分支：
```ts
    if (this.drag.kind === 'pan') {
      this.view = pan(this.view, screen[0] - this.prevScreen[0], screen[1] - this.prevScreen[1])
      this.prevScreen = screen
      this.render()
      return
    }
```
在其后插入 backdrop 分支：
```ts
    if (this.drag.kind === 'backdrop') {
      const w = this.toWorld(screen[0], screen[1])
      this.backdropAlign = {
        ...this.backdropAlign,
        offsetX: this.backdropAlign.offsetX + (w[0] - this.prevWorld[0]),
        offsetZ: this.backdropAlign.offsetZ + (w[1] - this.prevWorld[1]),
      }
      this.prevWorld = w
      this.prevScreen = screen
      this.onBackdropAlignChange?.(this.backdropAlign)
      this.render()
      return
    }
```

- [ ] **Step 4: handlePointerUp 排除 backdrop 入撤销栈**

找到：
```ts
    if (this.drag.kind !== 'pan' && this.dragMoved && this.dragBefore) {
```
改为：
```ts
    if (this.drag.kind !== 'pan' && this.drag.kind !== 'backdrop' && this.dragMoved && this.dragBefore) {
```

- [ ] **Step 5: 写行为测试**

Create `src/editor/backdrop-pan.test.ts`:
```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Canvas2D } from './canvas2d.ts'
import { EditorStore } from './store.ts'
import { createDefaultCampusData } from '../data/campusData.ts'

function ev(x: number, y: number, button = 0): PointerEvent {
  return { pointerId: 1, clientX: x, clientY: y, button, preventDefault() {} } as unknown as PointerEvent
}

class TestCanvas extends Canvas2D {
  constructor(host: HTMLElement, store: EditorStore) {
    super(host, store)
    const stub = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
    this.svgRoot.getBoundingClientRect = stub
    this.svgRoot.setPointerCapture = () => {}
    this.svgRoot.releasePointerCapture = () => {}
  }
  viewOffset(): [number, number] { return [this.view.offsetX, this.view.offsetY] }
  down(x: number, y: number, button = 0) { this.handlePointerDown(ev(x, y, button)) }
  move(x: number, y: number) { this.handlePointerMove(ev(x, y)) }
  up(x: number, y: number) { this.handlePointerUp(ev(x, y)) }
}

function setup() {
  const host = document.createElement('div')
  Object.defineProperty(host, 'clientWidth', { value: 800 })
  Object.defineProperty(host, 'clientHeight', { value: 600 })
  const store = new EditorStore(createDefaultCampusData())
  const c = new TestCanvas(host, store)
  c.fitToData()
  return { c, store }
}

describe('中键平移画布', () => {
  it('中键(button=1)拖动改变 view 偏移，且不改数据', () => {
    const { c, store } = setup()
    const before = JSON.stringify(store.data)
    const [ox, oy] = c.viewOffset()
    c.down(400, 300, 1)
    c.move(450, 320)
    c.up(450, 320)
    const [nx, ny] = c.viewOffset()
    expect(nx).not.toBe(ox)
    expect(ny).not.toBe(oy)
    expect(JSON.stringify(store.data)).toBe(before) // 数据未变
  })
})

describe('解锁后左键拖动平移底图', () => {
  it('解锁时左键拖动改变 backdropAlign.offset，不改数据/不入撤销', () => {
    const { c, store } = setup()
    c.setBackdropLocked(false)
    const before = JSON.stringify(store.data)
    const a0 = c.getBackdropAlign()
    c.down(400, 300, 0)
    c.move(440, 300)
    c.up(440, 300)
    const a1 = c.getBackdropAlign()
    expect(a1.offsetX).not.toBe(a0.offsetX)
    expect(JSON.stringify(store.data)).toBe(before)
    expect(store.canUndo).toBe(false) // backdrop 拖动不入撤销栈
  })

  it('锁定时左键拖动不动底图(走元素编辑路径)', () => {
    const { c } = setup()
    c.setBackdropLocked(true)
    const a0 = c.getBackdropAlign()
    c.down(400, 300, 0)
    c.move(440, 300)
    c.up(440, 300)
    expect(c.getBackdropAlign().offsetX).toBe(a0.offsetX)
  })
})
```

- [ ] **Step 6: 运行测试 + 构建**

Run: `npx vitest run src/editor/backdrop-pan.test.ts && npm run build`
Expected: 测试 PASS；构建通过。若 `store.canUndo` 在拖动空白处也为 false 属正常（数据未变）。

- [ ] **Step 7: 全量测试（无回归）**

Run: `npx vitest run`
Expected: 全部 PASS（现有编辑器交互测试不受影响——`fakeEvent` 无 button=undefined 走左键、锁定默认 true 走原编辑路径）。

- [ ] **Step 8: Commit**
```bash
git add src/editor/canvas2d.ts src/editor/backdrop-pan.test.ts
git commit -m "feat(editor): middle-button canvas pan + unlocked left-drag backdrop move"
```

---

## Task 4: 工具栏 UI（锁定开关 + 缩放滑块）+ localStorage 持久化

**Files:**
- Modify: `src/editor/main.ts`、`src/editor/editor.css`

- [ ] **Step 1: 工具栏加锁定复选框 + 缩放滑块**

在 `src/editor/main.ts` 工具栏 HTML 中，找到"打开 3D 预览"那个 group：
```ts
        <div class="group">
          <a class="link" href="./index.html" target="_blank" rel="noopener">打开 3D 预览 ↗</a>
        </div>
```
在它之前插入新 group：
```ts
        <div class="group">
          <label class="lock-toggle"><input type="checkbox" id="backdrop-lock" checked /> 底图锁定</label>
          <label class="scale-control">底图缩放 <input type="range" id="backdrop-scale" min="0.5" max="2" step="0.01" value="1" /></label>
        </div>
```

- [ ] **Step 2: 加 localStorage 读写工具 + 启动时载入**

在 `src/editor/main.ts` 顶部（import 之后、`boot` 之前）加：
```ts
import type { BackdropAlign } from './canvas2d.ts'

const ALIGN_KEY = 'campus-editor:backdrop-align'

function loadBackdropAlign(): BackdropAlign | null {
  try {
    const raw = localStorage.getItem(ALIGN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.offsetX === 'number' && typeof v?.offsetZ === 'number' && typeof v?.scale === 'number') {
      return { offsetX: v.offsetX, offsetZ: v.offsetZ, scale: v.scale }
    }
    return null
  } catch {
    return null
  }
}

function saveBackdropAlign(a: BackdropAlign): void {
  try {
    localStorage.setItem(ALIGN_KEY, JSON.stringify(a))
  } catch {
    // ignore (private mode / quota) — 对齐是辅助功能，存不了不致命
  }
}
```

- [ ] **Step 3: 启动时载入对齐 + 接线控件**

在 `canvas.setMapBackdrop(mapBackdrop)` 之后（约 :109），加：
```ts
  const savedAlign = loadBackdropAlign()
  if (savedAlign) canvas.setBackdropAlign(savedAlign)
  canvas.onBackdropAlignChange = (a) => saveBackdropAlign(a)
```
在控件查询区（`const toast = ...` 附近）加：
```ts
  const backdropLock = app.querySelector<HTMLInputElement>('#backdrop-lock')!
  const backdropScale = app.querySelector<HTMLInputElement>('#backdrop-scale')!
```
若有保存的 scale，同步滑块初值（放在 `if (savedAlign)` 块内或其后）：
```ts
  if (savedAlign) backdropScale.value = String(savedAlign.scale)
```
在事件绑定区（如 `btnAdd.addEventListener` 附近）加：
```ts
  backdropLock.addEventListener('change', () => {
    canvas.setBackdropLocked(backdropLock.checked)
  })
  backdropScale.addEventListener('input', () => {
    canvas.setBackdropScale(Number(backdropScale.value))
  })
```

- [ ] **Step 4: 轻量样式**

在 `src/editor/editor.css` 末尾追加：
```css
.lock-toggle,
.scale-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #cbd5e1;
  white-space: nowrap;
}
.scale-control input[type='range'] {
  width: 110px;
}
```

- [ ] **Step 5: 构建 + 全量测试**

Run: `npm run build && npx vitest run`
Expected: 通过。

- [ ] **Step 6: Commit**
```bash
git add src/editor/main.ts src/editor/editor.css
git commit -m "feat(editor): toolbar backdrop lock toggle + scale slider; persist align to localStorage"
```

---

## Task 5: 浏览器验证（用户手动）

**Files:** 无代码改动。

- [ ] **Step 1:** `npm run dev` → 打开 `http://localhost:5173/editor.html`
- [ ] **Step 2:** 中键(滚轮键)按住拖动 → 画布平移；滚轮滑动 → 缩放。确认不再误拖元素。
- [ ] **Step 3:** 取消勾选"底图锁定" → 左键拖动卫星图移动；拉"底图缩放"滑块 → 卫星图缩放；与矢量地图对齐。
- [ ] **Step 4:** 重新勾选"底图锁定" → 正常编辑（左键拖元素）。
- [ ] **Step 5:** 刷新页面 → 对齐(偏移+缩放)应保留（localStorage）。
- [ ] **Step 6:** 反馈结果；若对齐手感/范围需调整（如滑块范围、灵敏度），再迭代。

---

## Self-Review 结论

- **Spec 覆盖**：中键平移(Task3) / 底图平移+缩放(Task1纯函数+Task2应用+Task3拖动+Task4滑块) / 锁定开关(Task3+Task4) / localStorage(Task4) / 浏览器验证(Task5) 均有任务。
- **类型一致**：`BackdropAlign{offsetX,offsetZ,scale}` 全程一致；`applyBackdropAlign`/`setBackdropAlign`/`setBackdropLocked`/`setBackdropScale`/`getBackdropAlign`/`onBackdropAlignChange` 在 Task2 定义、Task3/4 使用，签名一致；DragState 加 `{kind:'backdrop'}` 在 Task3 各处一致处理。
- **无占位符**：每步含完整代码与命令。世界空间对齐保证画布平移/缩放跟随。
- **验证约束**：对齐视觉效果由 Task5 用户浏览器确认（spec 已声明）。
