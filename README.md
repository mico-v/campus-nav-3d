# campus-nav-3d

一个适合 GitHub Pages 的 3D 校园导航原型，使用 Vite + TypeScript + Three.js 构建。

当前默认地图以 [`ZDaneel/usts-navigation-graph`](https://github.com/ZDaneel/usts-navigation-graph) 的地点位置和连通关系为基准，并叠加 OpenStreetMap 在 `31.251704,120.572537` 附近可明确匹配名称的建筑 footprint。

## 功能

- 3D 校园浏览视图，支持 OrbitControls
- 数据驱动的建筑、区域、道路网络、水体、操场和 POI
- 道路由中心线迁移为带节点、道路段和交叉口的可寻路拓扑
- 主页面左侧展示图层、建筑和地图要素信息；导航路线由运行时算法生成
- 地图几何数据集中在 `src/data/campus.json`
- 使用相对 `base`，可直接部署到 GitHub Pages 项目页

## 代码结构

渲染逻辑按职责拆分为独立模块：

- `src/main.ts` — 薄入口：装配模块、事件绑定和按需渲染
- `src/scene/geo.ts` — 唯一的「数据坐标 → 世界坐标」映射（所有贴地/拉伸几何都经此，避免道路镜像偏移）
- `src/scene/builders.ts` — 各实体（建筑/道路/地块/水体/操场/树/POI）→ Three.js 网格
- `src/scene/CampusScene.ts` — 场景/相机/灯光/控制器/重建与按需渲染
- `src/scene/theme.ts` — 配色与 Y 层级常量
- `src/ui/panel.ts` — 侧栏图层、建筑列表和选中提示的 DOM 渲染
- `src/interaction.ts` — 点击拾取建筑
- `src/data/campusData.ts` — 类型定义 + 从 `campus.json` 加载
- `src/navigation/pathfinding.ts` — 运行时 A*；支持节点请求和任意地图坐标接入道路
- `src/performance/metrics.ts` — 3D/2D 渲染指标与预算判断

坐标纯函数有回归测试，运行 `npm test`（Vitest）。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

## 交互式编辑器（中文使用说明）

启动开发服务后打开 `http://localhost:5173/editor.html`（静态部署也可直接打开构建产物中的 `editor.html`）。编辑器默认读取 `src/data/campus.json`；保存需要 Vite 开发后端，若后端不可用会进入只读预览，改动不能写回。

- **模式**：`选择` 用于点选和拖动对象，`平移` 只移动画布，`加道路/节点` 逐点绘制道路（双击结束，Esc 取消），`重塑` 仅允许拖顶点，`拆分/合并` 配合工具栏按钮处理道路，`区域/建筑` 用于检查区域与建筑。
- **2D / 3D**：2D 是精确编辑视图，可显示网格、底图、路网节点和图层；`3D 检查` 用于观察高度、遮挡和道路结构。可用 `顶视图`、`聚焦选中`；勾选 `3D 地面编辑` 后，只有命中当前对象时才可拖动建筑、道路或未锚定 POI。
- **吸附与精度**：网格间距可调整；绘制道路和拖动道路节点时，优先吸附道路节点、线段交点、建筑/区域锚点，再吸附网格。状态栏和画布读数显示比例与网格设置，关闭吸附即可自由编辑。
- **选择与编辑**：点击对象后右侧表单可改名称、类别、尺寸、位置、道路宽度和颜色；拖顶点改形状，双击边插入节点，选中顶点后按 Delete 删除（多边形/道路至少保留合法节点数）。
- **道路拓扑编辑**：2D 中橙色路口/蓝色路网节点可直接选中；拖动节点会同步修改所有关联源道路，保持交叉口连通。路口节点不能直接删除，普通拓扑节点可删除；道路属性仍在道路本体上编辑。
- **撤销/重做**：工具栏按钮支持撤销和重做；`Ctrl/Cmd+Z` 撤销，`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` 重做。一次拖动或一次表单提交记为一个操作。
- **校验、保存与导出**：点击 `校验` 检查重复 id、无效坐标、道路节点数、尺寸和宽度；校验通过后可点击 `保存` 写回开发后端并生成备份，或点击 `导出 JSON` 下载当前数据。静态预览/只读模式仍可导出，但不能写回服务器。
- **规范**：道路载入时会生成 `RoadNetwork`，将交叉点拆成节点、将中心线拆成道路段；旧道路记录保留为编辑来源，拓扑用于渲染和后续导航。

### 导航接口约定

静态地图只保存道路结构，不保存演示路线。后续导航算法可以直接调用 `findShortestPath`：

- 节点导航：传入 `originNodeId / destinationNodeId`，适合已知路网节点的内部调用。
- 点位导航：传入 `origin.position / destination.position`，算法会把点投影到最近的可通行道路段，并在运行时建立虚拟接入节点。
- 点位请求可分别设置 `maxSnapDistance`；超过距离返回 `null`，不会把临时节点写回 `campus.json`。
- 返回几何从用户实际起点开始、到实际终点结束，同时保留中心线吸附点、吸附距离、道路段路径、单向和交通方式约束。

## 性能验收

- 主页面和编辑器都采用按需渲染；没有无条件持续运行的动画循环。相机变化、数据变化或选择变化才会请求下一帧。
- 3D 编辑拖动期间只移动已生成对象，结束拖动才提交数据并重建；选择建筑只更新材质和高亮，不重建全场景。
- `src/performance/metrics.ts` 提供 FPS、平均/最大帧耗时、draw calls、三角形、geometry 和 texture 统计。开发环境首页可在浏览器控制台调用 `__campusRenderMetrics()`，并用 `__campusRenderBudget({ minFps: 55, maxAverageFrameMs: 20, maxFrameMs: 50 })` 做验收。
- 当前自动化验证覆盖类型检查、数据/拓扑/几何/编辑交互和生产构建；真实 FPS 会随浏览器、GPU、分辨率变化，必须在目标设备上实测，不能由构建结果代替。

### 最近一次全量审计

- 测试：142 项通过；生产构建通过；静态地图不包含 `routes`。
- 路网：14 条逻辑道路、38 个拓扑节点、41 个道路段；道路段包含中心线、宽度、路面、通行方式、单/双向和速度属性，交叉口会拆成共享节点，闭合道路保留闭环边。
- Chromium 无头实测（当前环境为软件 WebGL）：首页 280 draw calls，20 帧平均约 1.14ms、最大约 8.7ms；编辑器 2D 平均约 3.3ms；编辑器 3D 首次初始化包含约 38.5ms 软件 WebGL 峰值，控制台运行时异常为 0。
- 生产资源已拆分为入口、场景、地图数据和 Three.js vendor chunk；入口约 8KB，场景约 42KB，Three.js vendor gzip 约 145KB。Three.js 本身仍是最大资源，需在目标设备上继续观察首屏网络与缓存效果。
- 仍需在目标 GPU 和真实移动设备上验收；软件 WebGL 的帧耗时不能替代目标设备结论。


本项目已在 `vite.config.ts` 中设置：

- `base: './'`

这样构建产物会使用相对路径，适合部署到 GitHub Pages 的仓库页面路径下。

一个常见流程：

1. 推送代码到 GitHub 仓库
2. 运行 `npm run build`
3. 将 `dist/` 内容发布到 Pages 分支，或使用 GitHub Actions 上传 `dist/`

## 手工编辑地图数据

几何数据在 `src/data/campus.json`，可直接修改；交互式编辑器的保存流程和字段说明见上方“交互式编辑器”。

- 建筑 `height / position / size / name / category / footprint`
- 分区颜色和范围
- 道路折线与宽度
- POI 标记
- 道路中心线、宽度和来源属性；运行时导航结果不保存到地图数据

## 当前包含的核心地标

- 二号门
- 二食堂
- 图书馆
- C1/C2/C3/C4/C5/C6 教学楼
- 院士楼
- 2/3/4/5/6/7/8 号教学楼
- 音乐楼 / 音乐学院
- 南体育场及 OSM 运动场地
