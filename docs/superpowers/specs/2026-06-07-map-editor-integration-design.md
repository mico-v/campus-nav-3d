# 整合地图编辑器 + 修复卫星底图 设计文档

- 日期：2026-06-07
- 目标分支：基于当前 `main`（已含 3D 重构 + OSM 数据整合）
- 状态：已确认，待写实现计划

## 背景

`feat/map-editor` 分支（从 `10cc9f3` 平行分叉）已实现一个成熟、自包含的 **2D 俯视 SVG 地图编辑器**，住在 `src/editor/`，带 8 个测试、撤销/重做、属性表单、拖拽/顶点编辑、dev-server 后端 API（`/api/campus` 读写磁盘数据并备份）。它与 3D 渲染器**仅通过 `CampusData` 类型耦合**，不依赖我们重构时删除的 `applyWorldAlign`/`roadAlignment` 坐标 hack（已核实 0 命中）。

两条线殊途同归：对方也独立把数据抽成了 JSON（`a87522c`）。整合的本质是**调和两条平行线的数据源/配置差异**，不是重写编辑器。

用户额外要求：**尽量修复卫星底图**（当前不显示）。

## 目标与范围

- 把编辑器文件 cherry-pick 进当前 main（不引入对方旧数据/旧 3D main.ts）。
- 数据源统一到我们的 `src/data/campus.json`。
- 保留 dev API 后端，"保存"直接写回 `campus.json`（带备份）；线上静态部署只读不受影响。
- 编辑范围最小整合：建筑可编 footprint 顶点（编辑器已支持），zone/water/field 编 center/size 矩形。它们新增的 `footprint?` 字段在编辑器中原样保留（深拷贝透明），暂不支持顶点编辑。
- 修复卫星底图显示。

### 明确不做（YAGNI）

- 不引入对方分支的旧 `campusData.json`（无 footprint、旧楼数）。
- 不扩展 zone/water/field 的多边形顶点编辑（后续增强）。
- 不重写编辑器的任何已有功能。

## 架构

### 整合方式（Q1=A：cherry-pick 文件）

**复制进 main 的文件**（从 `feat/map-editor`）：
- `src/editor/`：`canvas2d.ts`、`store.ts`、`form.ts`、`geometry.ts`、`projection.ts`、`api.ts`、`types.ts`、`main.ts`、`editor.css`，及全部 `*.test.ts`
- `editor.html`（编辑器入口页）
- `vite-plugin-campus-api.ts`（dev API 中间件）
- `tools/campus-store.ts`（+ `campus-store.test.ts`，后端读写/校验逻辑）

**手工调和**：
- `vite.config.ts`：加 `plugins: [campusApiPlugin()]` + `build.rollupOptions.input` 多页（main=index.html, editor=editor.html）；保留 `base: './'`
- `package.json`：devDeps 加 `happy-dom`（编辑器 DOM 测试需要）
- 数据源：编辑器 `api.ts` 后端与 `tools/campus-store.ts` 读写路径统一指向 `src/data/campus.json`（替换对方的 `campusData.json` 文件名）
- `.gitignore`：`.editor-backups/`（已忽略）

### 数据契约（Q3=A）

编辑器 `import type { CampusData } from '../data/campusData'` —— 复用我们的类型，天然兼容：
- 新增 `footprint?`（zone/water/field）：store JSON 深拷贝全程透明保留；编辑器暂不画其顶点。
- 97 楼/135 路：纯数据驱动，直接加载。
- `tools/campus-store.ts` 的保存校验须**放行 `footprint` 字段**（若它做严格字段白名单）——整合时核验点。

### 数据流

`editor.html` → `src/editor/main.ts` → `api.loadCampus()` GET `/api/campus`（dev 后端读 `campus.json`）→ `EditorStore` 持有可变副本 → 用户编辑（canvas 拖拽 / form 表单，两向绑定，撤销/重做）→ `api.saveCampus()` POST → 后端写回 `campus.json`（备份到 `.editor-backups/`）。3D 页面（`index.html`）下次加载即见更新。后端不可用时编辑器进只读模式（`createDefaultCampusData()` 回退）。

## 卫星底图修复

### 诊断（静态分析；端点与数据已实测正常）

实测确认：ArcGIS `World_Imagery/MapServer/export` 端点 HTTP 200、返回真实 287KB PNG；用真实数据 + `metersPerWorldUnit=1` 算出的 bbox 经纬跨度 ~1.23km（量级合理）。**问题在显示层，不在端点/数据。**

根因候选（按可能性）：
1. **被不透明 SVG 地面遮挡（最可能）**：底图 `<img>` 为 `z-index:0`，加在 `canvas-host`；SVG 画布的 `ground` 层是铺满的不透明浅绿矩形（`#c8ddb0`），盖在底图之上。**修法**：底图开启时让 SVG ground 背景透明/省略，并确保 `<img>` 在 SVG 之下正确分层。
2. **投影变形**：`imageSR=4326` + CSS `object-fit: fill` 按经纬度拉伸（非方形像素）。**修法**：改用 Web Mercator（`imageSR=3857` / `bboxSR=3857`），bbox 转米制，避免变形。
3. **CORS/时序**：`probeMapImage` 用 `new Image()` 跨域探测；ArcGIS 实测带 CORS、可加载。保留多 provider 回退 + 失败 `console.warn`。

### 验证约束（重要）

执行环境无浏览器，**无法在交付前闭环确认底图显示**。可做：修复上述根因、保证请求 URL/坐标换算正确、失败有清晰 console 提示、给坐标换算加 node 单测。**最终显示效果需用户本地 `npm run dev` 打开 `editor.html` 验证并反馈**，再迭代。这是本项与其他工作的根本区别——依赖浏览器运行时。

## 测试策略

- 编辑器自带 8 测试随文件带入，须在本仓库跑通（happy-dom）。
- 底图坐标换算 `buildWorldToGeo` / `buildMapImageSize` 加 node 单测，钉住 bbox 计算（不依赖浏览器）。
- 数据完整性：编辑器加载→导出 与 `campus.json` 等价。
- `npm run build` 多页（index + editor）均通过。
- 浏览器验证（用户）：底图显示 + 编辑→保存→3D 查看闭环。

## 风险

- 卫星底图显示无法由我闭环验证（已声明），依赖用户反馈迭代。
- `tools/campus-store.ts` 后端校验可能需放行 `footprint` 字段。
- 编辑器 DOM 测试用 happy-dom，可能与现 vitest 版本有兼容点要调。
- 多页构建需确保 `base: './'` 下 editor.html 资源路径正确（GitHub Pages 子路径）。
