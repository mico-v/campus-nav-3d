# campus-nav-3d

一个适合 GitHub Pages 的 3D 校园导航原型，使用 Vite + TypeScript + Three.js 构建。

当前默认地图以 [`ZDaneel/usts-navigation-graph`](https://github.com/ZDaneel/usts-navigation-graph) 的地点位置和连通关系为基准，并叠加 OpenStreetMap 在 `31.251704,120.572537` 附近可明确匹配名称的建筑 footprint。

## 功能

- 3D 校园浏览视图，支持 OrbitControls
- 数据驱动的建筑、区域、道路网络、水体、操场、POI、路线
- 默认展示从二号门到图书馆的 graph 最短路示例
- 右侧导航面板展示路线步骤与沿途地标
- 地图几何数据集中在 `src/data/campus.json`
- 使用相对 `base`，可直接部署到 GitHub Pages 项目页

## 代码结构

渲染逻辑按职责拆分为独立模块：

- `src/main.ts` — 薄入口：装配模块、事件绑定、渲染循环
- `src/scene/geo.ts` — 唯一的「数据坐标 → 世界坐标」映射（所有贴地/拉伸几何都经此，避免道路镜像偏移）
- `src/scene/builders.ts` — 各实体（建筑/道路/地块/水体/操场/树/POI/路线）→ Three.js 网格
- `src/scene/CampusScene.ts` — 场景/相机/灯光/控制器/重建与渲染循环
- `src/scene/theme.ts` — 配色与 Y 层级常量
- `src/ui/panel.ts` — 侧栏路线/建筑列表/选中提示的 DOM 渲染
- `src/interaction.ts` — 点击拾取建筑
- `src/data/campusData.ts` — 类型定义 + 从 `campus.json` 加载

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

## GitHub Pages 部署说明

本项目已在 `vite.config.ts` 中设置：

- `base: './'`

这样构建产物会使用相对路径，适合部署到 GitHub Pages 的仓库页面路径下。

一个常见流程：

1. 推送代码到 GitHub 仓库
2. 运行 `npm run build`
3. 将 `dist/` 内容发布到 Pages 分支，或使用 GitHub Actions 上传 `dist/`

## 手工编辑地图数据

几何数据在 `src/data/campus.json`，可直接修改：

- 建筑 `height / position / size / name / category / footprint`
- 分区颜色和范围
- 道路折线
- POI 标记
- 示例路线点位与步骤文案

> 注：交互式地图编辑器（在场景中增删/拖拽路点并导出 JSON）为后续计划，当前版本未包含。

## 当前包含的核心地标

- 二号门
- 二食堂
- 图书馆
- C1/C2/C3/C4/C5/C6 教学楼
- 院士楼
- 2/3/4/5/6/7/8 号教学楼
- 音乐楼 / 音乐学院
- 南体育场及 OSM 运动场地
