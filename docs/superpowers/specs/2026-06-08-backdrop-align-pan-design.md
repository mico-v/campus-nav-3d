# 编辑器底图对齐 + 中键平移 设计文档

- 日期：2026-06-08
- 分支：`feat/integrate-map-editor`（接续编辑器整合工作）
- 状态：已确认，待写实现计划

## 背景

地图编辑器已整合、卫星底图已能显示。但卫星影像与矢量地图（建筑/道路）的**位置和比例对不齐**，需要手动对齐工具；同时当前左键拖动会误拖矢量元素，导航体验差。

## 目标

1. **画布导航**：中键（滚轮键）按住拖动 = 平移画布；滚轮滑动 = 缩放画布（保持）。左键不再被迫用于平移。
2. **底图对齐**：解锁后左键拖动平移底图、工具栏滑块缩放底图，对齐矢量地图；工具栏开关锁定/解锁；对齐参数（X/Z 偏移 + 缩放）持久化到 localStorage。

### 明确不做（YAGNI）

- 不做底图旋转对齐（用户选 B = 仅平移+缩放）。
- 对齐参数不写入 `campus.json`（底图是编辑辅助，非地图数据）。
- 不动 3D 渲染（`src/scene/*`、`index.html`）。

## 架构

### 1. 画布导航：中键平移

`handlePointerDown` 当前按"手柄→元素→空白平移"优先级，不区分鼠标键。改为：
- **若 `event.button === 1`（中键）→ 直接启动 `pan` 拖动**（最高优先级，无视光标下内容），并 `event.preventDefault()` 防止浏览器中键滚动/自动滚动。
- 其余（左键）维持原优先级逻辑。
- 滚轮缩放（`wheel` 处理）不变。
- 左键空白处平移保留（无害便利）。

`pan`/`zoomAt` 等 `ViewState` 工具与 `handlePointerMove` 的 `pan` 分支已存在，复用。

### 2. 底图对齐状态

新增对齐状态（**世界坐标系**，保证画布平移/缩放时底图跟随稳定）：
```ts
interface BackdropAlign { offsetX: number; offsetZ: number; scale: number }
// 默认 { offsetX: 0, offsetZ: 0, scale: 1 }
```

**应用对齐（纯函数，可单测）**：把数据 bounds 经"缩放（绕中心）+ 偏移"得到底图实际覆盖的世界矩形：
```ts
applyBackdropAlign(bounds, align) -> { minX, maxX, minZ, maxZ }
// cx=(minX+maxX)/2, halfW=(maxX-minX)/2*scale; minX' = cx+offsetX-halfW; ...（Z 同理）
```
`syncMapBackdrop` 改为先 `applyBackdropAlign`，再 `toScreen` 两角定位 `<img>`。因对齐在世界空间，画布平移/缩放时底图自动跟随矢量图。
（注：geo bbox 的请求仍用原始 `bounds`——卫星图像内容不变，只是把图贴到对齐后的世界矩形上，靠拉伸/平移与矢量对齐。）

### 3. 锁定/解锁交互

工具栏新增 **"底图锁定" 复选框**（默认勾选=锁定）与 **缩放滑块**（范围约 0.5–2.0，步进 0.01，显示当前值）。`canvas2d` 暴露 `setBackdropLocked(locked)` 与 `setBackdropScale(scale)`。

- **锁定（默认）**：`backdropLocked = true`。底图冻结；左键拖动 = 编辑/选中元素（现状）。
- **解锁**：`backdropLocked = false`。`handlePointerDown` 中：若解锁且非中键，左键拖动启动新的 `{ kind: 'backdrop' }` 拖动 → 累加世界位移到 `offsetX/offsetZ`；**暂停元素 hit-test/编辑**（避免误拖矢量图）。滑块改 `scale`。
- 中键平移在两种模式下都生效。

`backdrop` 拖动不进入撤销栈（它是视图辅助，非数据编辑）。

### 4. 持久化

`offsetX/offsetZ/scale` 任一变化时写 `localStorage['campus-editor:backdrop-align']`（JSON）。编辑器启动时读取并初始化；解析失败或缺失则用默认值。锁定状态不持久化（每次打开默认锁定，安全）。

### 数据流

editor/main.ts 启动 → 读 localStorage 对齐参数 → `canvas.setBackdropAlign(align)`。用户解锁 → 拖底图/拉滑块 → canvas 更新 align + 触发持久化回调（main.ts 写 localStorage）→ `render()` 重定位底图。

## 组件与文件

- `src/editor/canvas2d.ts`：中键平移分支；`BackdropAlign` 状态 + `applyBackdropAlign` 纯函数（导出可测）；`syncMapBackdrop` 应用对齐；`backdrop` 拖动；`setBackdropLocked/setBackdropScale/setBackdropAlign` + 对齐变化回调。
- `src/editor/main.ts`：工具栏加"底图锁定"复选框 + 缩放滑块；localStorage 读写；接 canvas 回调。
- `src/editor/editor.css`：滑块/开关样式（轻量）。

## 错误处理 / 边界

- localStorage 不可用或 JSON 损坏 → try/catch 回退默认对齐。
- scale 钳制到合理区间（如 0.2–5），防止滑块外输入导致底图退化。
- 解锁模式下中键仍可平移画布；锁定切换不影响已选中元素。

## 测试策略

- **纯函数 `applyBackdropAlign`**：node 单测——offset 平移正确、scale 绕中心缩放、scale=1/offset=0 时等于原 bounds。
- **中键平移分支**：把"按键→拖动类型"判定抽成可测逻辑或用 happy-dom 派发 `pointerdown{button:1}` 断言进入 pan。
- **localStorage 往返**：happy-dom 测对齐参数存取 + 损坏数据回退默认。
- **构建**：`npm run build` 多页通过。
- **浏览器验证（用户）**：解锁拖动/滑块对齐卫星图与矢量图、锁定后正常编辑、中键平移、刷新后对齐保留。

## 风险

- 对齐的**视觉效果**仍需用户在浏览器确认（无头环境限制）。
- 世界空间对齐在极端缩放下的稳定性需实测。
- 中键事件在不同浏览器/触控板的兼容（`button===1` + `preventDefault`）。
