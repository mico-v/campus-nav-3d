# campus-nav-3d

一个适合 GitHub Pages 的 3D 校园导航原型，使用 Vite + TypeScript + Three.js 构建。

当前默认地图以 [`ZDaneel/usts-navigation-graph`](https://github.com/ZDaneel/usts-navigation-graph) 的地点位置和连通关系为基准，并叠加 OpenStreetMap 在 `31.251704,120.572537` 附近可明确匹配名称的建筑 footprint。

## 功能

- 3D 校园浏览视图，支持 OrbitControls
- 数据驱动的建筑、区域、道路网络、水体、操场、POI、路线
- 默认展示从二号门到图书馆的 graph 最短路示例
- 右侧导航面板展示路线步骤与沿途地标
- 地图数据集中在 `src/data/campusData.json`（类型定义在 `src/data/campusData.ts`）
- 内置类 OSM 的 2D 可视化地图编辑器（见下文「可视化地图编辑器」）
- 使用相对 `base`，可直接部署到 GitHub Pages 项目页

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

## 可视化地图编辑器（推荐）

地图数据现在集中在 `src/data/campusData.json`，并提供一个类 OSM 的 2D 可视化编辑器，
用来修正建筑/道路位置、调整高度大小、编辑信息，改动会直接写回该 JSON 文件。

```bash
npm run dev
# 然后打开 http://localhost:5173/editor.html
```

编辑器能力：

- 顶视 2D 画布：滚轮缩放、拖空白平移、点选对象
- 拖动建筑/道路/区域/POI/路线点整体移动；拖建筑 footprint 顶点改形；双击边加点、Delete 删点
- 拖角把手缩放区域/水体/操场，以及无 footprint 建筑的尺寸
- 右侧表单编辑 名称 / 类别 / 高度 / 尺寸 / 颜色 / 所属区域 / 信息 / 精确坐标
- 撤销 / 重做、图层显隐、新增 / 删除对象
- 「保存」写回 `src/data/campusData.json`（保存前自动备份到 `.editor-backups/`）

保存接口由 Vite dev 中间件 `vite-plugin-campus-api.ts` 提供（`GET/PUT /api/campus`），
仅在本地开发时可用；线上 GitHub Pages 为只读展示。

> 后端读写/校验逻辑在 `tools/campus-store.ts`，编辑器代码在 `src/editor/`。
> 运行 `npm run test` 执行 vitest 单元/DOM 测试。

数据类型定义仍在 `src/data/campusData.ts`，必要时也可手工编辑 JSON。

## 当前包含的核心地标

- 二号门
- 二食堂
- 图书馆
- C1/C2/C3/C4/C5/C6 教学楼
- 院士楼
- 2/3/4/5/6/7/8 号教学楼
- 音乐楼 / 音乐学院
- 南体育场及 OSM 运动场地
