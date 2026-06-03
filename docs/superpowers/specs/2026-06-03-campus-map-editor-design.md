# 校园地图可视化编辑后端 — 设计文档

日期：2026-06-03
状态：已批准，进入实现

## 背景与目标

`campus-nav-3d` 是部署到 GitHub Pages 的纯静态 3D 校园导航原型。全部地图数据内联在
`src/data/campusData.ts`（约 3900 行）。当前痛点：建筑与道路的位置/尺寸不准确，手工编辑
3900 行数据文件极其低效。

目标：提供一个**本地编辑后端 + 可视化编辑器**，能够编辑建筑、道路、区域/水体/操场、POI、
路线的**位置、高度、大小、信息**，并把改动持久化回磁盘（可提交 git）。线上 Pages 仍是只读展示。

## 决策记录（已与用户确认）

1. 后端形态：**本地 Node 服务直写文件**，用 Vite dev 插件中间件实现（非独立 Express 进程）。
2. 编辑范围：**全部对象类型**（建筑、道路、区域/水体/操场、POI、路线）。
3. 存储格式：**迁移到 JSON 文件** `src/data/campusData.json`，类型定义留在 `campusData.ts`。
4. 交互方式：**类 OSM iD 的 2D 顶视编辑**（拖拽建筑/道路点），高度与信息用**表单**。
5. 编辑器做成**独立页面 `editor.html`**；3D 展示页保持只读。
6. 引入 **vitest** 测试纯逻辑。

## 总体架构

```
editor.html ──> src/editor/*  (OSM 风格 2D 编辑器 + 属性表单)
                      │  HTTP (GET/PUT /api/campus)
                      ▼
        vite-plugin-campus-api.ts  (本地 Node 服务 = Vite dev 中间件)
                      │  读写
                      ▼
        src/data/campusData.json   (唯一数据源)
                      ▲ import
        src/data/campusData.ts (类型 + 加载器) ──> main.ts (只读 3D 展示)
```

## 数据迁移

- 将 `campusData.ts` 内联数据抽到 `src/data/campusData.json`。
- `campusData.ts` 瘦身为：类型定义 + `import data from './campusData.json'` + `createDefaultCampusData()` / `cloneCampusData()`。类型签名不变，`main.ts` 渲染逻辑不改。
- `Building` 与 `PoiMarker` 增加可选字段 `info?: string`（用户要编辑的「信息」）。
- `tsconfig` 开启 `resolveJsonModule`（若未开启）。

## 后端接口（vite-plugin-campus-api.ts）

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/campus` | 返回 `campusData.json` 内容 |
| PUT | `/api/campus` | 轻量结构校验 → 备份旧文件到 `.editor-backups/<时间戳>.json` → 原子写入（写 temp 再 rename）→ 稳定缩进与键序 |

- 写入前做运行时校验：顶层 key 齐全，各数组元素关键字段类型正确。校验失败返回 400，不写盘。
- `.editor-backups/` 加入 `.gitignore`。

## 编辑器交互（类 OSM iD）

布局：左侧 2D 顶视画布（SVG，可平移/缩放）+ 右侧属性表单 + 顶部工具栏。

2D 画布坐标映射：世界 X → 屏幕 X，世界 Z → 屏幕 Y（顶视）。渲染图层：地块边界、区域、
道路、水体/操场、建筑轮廓、POI、路线。交互：

- 建筑：点选；拖整体移动；拖单个 footprint 顶点；双击边插入顶点；删顶点；无 footprint 的
  建筑用「位置点 + 尺寸把手」。
- 道路：拖节点、插入/删除节点、整体拖动。
- 区域/水体/操场：拖中心 + 角把手改大小（轴对齐矩形）。
- POI / 路线点：拖动圆点。
- 可选：吸附到邻近顶点以便对齐。

右侧表单（随选中对象变化）：名称、类别（下拉）、高度、尺寸 w/d、颜色、所属区域 zoneId
（下拉）、info 文本域、精确 X/Z 数值框。改动实时反映到画布。

工具栏：图层显隐、新增/删除对象、撤销/重做、保存（PUT）、未保存提示、打开 3D 预览链接。

## 数据流与安全

- 编辑器启动调用 `GET /api/campus` 载入工作副本；后端不可用时回退到打包 JSON，进入只读模式并提示。
- 所有编辑修改内存工作副本 + 撤销栈；仅保存时落盘。
- 后端原子写 + 自动备份；删除前确认；有未保存改动时 `beforeunload` 警告。
- 3D 展示读同一 JSON，保存后刷新即可看到更新。

## 模块划分（单一职责）

- `vite-plugin-campus-api.ts` — dev 中间件：load / save / backup / 校验。
- `src/data/campusData.ts` — 类型 + JSON 加载器（瘦）。
- `src/data/campusData.json` — 数据源。
- `editor.html` — 编辑器入口（Vite 第二页）。
- `src/editor/store.ts` — 工作副本、选择状态、撤销/重做、dirty 标记。
- `src/editor/api.ts` — load / save 客户端。
- `src/editor/projection.ts` — 世界↔屏幕坐标变换与视图（pan/zoom）状态。
- `src/editor/geometry.ts` — 纯几何辅助（质心、bounds、顶点插入/移动/删除、命中测试）。
- `src/editor/canvas2d.ts` — 2D 渲染 + 指针交互（用 projection / geometry）。
- `src/editor/form.ts` — 属性表单（按对象类型渲染与回写）。
- `src/editor/main.ts` — 装配 store / canvas / form / toolbar。

## 测试（vitest）

只测纯逻辑：
- `campusData.ts` JSON 往返：load → 序列化 → 结构稳定。
- `geometry.ts`：质心、bounds、顶点插入/移动/删除、命中测试。
- 后端 `validateCampusData`：合法通过、缺字段/错类型被拒。

画布拖拽等交互靠 `npm run dev` 手动可视验证。

## 验收标准

1. `npm run dev` 同时提供 3D 展示页、`editor.html`、`/api/campus` 读写接口。
2. 编辑器能选中并拖动建筑/道路/区域/POI/路线点，能改建筑 footprint 顶点。
3. 表单能改名称/类别/高度/尺寸/颜色/zoneId/info 并实时预览。
4. 保存后 `campusData.json` 落盘且结构合法，旧文件已备份；刷新 3D 展示页能看到改动。
5. `npm run build` 通过（tsc 无类型错误）；vitest 纯逻辑测试通过。

## 非目标（YAGNI）

- 不做用户认证/多用户协作。
- 不做线上（Pages）持久化保存——线上只读。
- 不做地图底图瓦片/卫星图叠加。
- 不做道路自动生成/重新分割（沿用现有数据）。
