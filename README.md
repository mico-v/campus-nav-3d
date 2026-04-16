# campus-nav-3d

一个适合 GitHub Pages 的最小 3D 校园导航原型，使用 Vite + TypeScript + Three.js 构建。

## 功能

- 3D 校园浏览视图，支持 OrbitControls
- 数据驱动的建筑、区域、道路、水体、操场、POI、路线
- 默认展示从二号门（西门）到图书馆的示例导航路线
- 右侧导航面板展示路线步骤与沿途地标
- 所有可编辑地图数据集中在 `src/data/campusData.ts`
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

## 后续手工编辑入口

主要编辑文件：

- `src/data/campusData.ts`

你可以直接修改：

- 建筑 `height / position / size / name / category`
- 分区颜色和范围
- 道路折线
- POI 标记
- 示例路线点位与步骤文案

## 当前包含的核心地标

- 二号门（西门）
- 图书馆
- 主景观湖
- 西区操场
- 体育馆
- 西区宿舍组团
- 中央教学楼群 / 行政楼 / 三食堂
- 东区宿舍服务区
- 南区 6/7 组团
- KFC / 瑞幸 / 全家 / 菜鸟驿站
