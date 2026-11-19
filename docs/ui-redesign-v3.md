# UI v3 · 按 room-tba 式地图优先 + StuDev 式站点导航重做

状态：进行中（2026-11-19 立）
上游：`docs/design-overview-v2.md` §6 已完成四片（PR #23 / #24 / #26 / #27），本文件是下一轮的依据。

## 0. 为什么还要再来一轮

v2 §6 只把「地图全屏 + 面板浮在图上」的骨架搭起来了。主人手机里的实际反馈是三条：

1. **地图还是不够大** —— 抽屉默认 half 档、相机留白对称，进页面地图只占中间一条。
2. **导航逻辑不清晰** —— 站点页（index / plan / editor / demo）之间没有统一导航，地图页还有一个「← 项目首页」孤立出口。
3. **计划书不该出现在应用里** —— `plan.html` 只作为 Pages 上的独立页存在，应用内不再导流。

参照两个开源项目的结论（都已拉下来读过）：

## 1. 参照结论：room-tba（`uplbtools/room-tba`）

UI 设计基准。读的是 `README.md`、`docs/map-ui-mode-matrix.md`。

| 它的做法 | 我们要落的 |
| --- | --- |
| 地图永久满视区，所有 chrome 浮在图上（`.app-layout` 的 `--z-map: 0` … `--z-toast: 1000`） | 沿用 v2 s1 的分层，但**补一张 z-index 令牌表**，把现有散落的 z-index 收口 |
| 顶栏 = 大搜索框（搜索/建议下拉）+ 术语选择器 + 事件横幅；**分面 chip 行**做建筑/宿舍/部门/地标/服务筛选 | 顶栏保留 48px，搜索框加大到能点；新增**分类 chip 行**（教学楼 / 宿舍 / 食堂 / 体育 / 行政 / 全部） |
| 底部**一条**统一状态条：署名 + 状态 + 地图工具 + 图例 chip（`.bottom-chrome`） | 把现有「左下浮层比例尺 + 图例」和「右下地图工具」合并成一条底部状态条，窄屏通栏 |
| 地点详情三档 sheet：**peek（只有头部）/ half（约 62% 可用高度）/ full**，相机按 sheet 静止上沿留白，图钉标签被 sheet 遮住时自动隐藏 | 我们的详情卡改成三档 sheet，peek 只露标题 + 关闭 + 一行事实 |
| 布局用令牌 `--map-ui-padding` / `--search-block-height` / `--status-bar-block-height` / `--side-panel-bottom-inset`，禁止写死 `top/bottom` | 引入同名令牌，窄屏/桌面共用一套 |
| 动效只做功能性过渡（150/200/280ms），`prefers-reduced-motion` 归零 | 加 `--motion-*` 令牌，抽屉 / sheet / 搜索下拉统一 |

不照搬：它的 Astro + Svelte + MapLibre + 后端（Supabase/D1/编辑器）、事件横幅、班级课表。

## 2. 参照结论：StuDev（`NJUPT-CS-StuDev/studev`）

功能与架构基准。读的是 `README.md`（核心功能全景 + 架构 + 目录）。

- **站点导航同构**：`/`（课表）、`/map/`、`/search/`、`/club/`、`/about/` 是一个导航条里的并列入口，地图页进去就是满屏地图，站点页脚不挤在地图页里。→ 我们：`index`（介绍）、`demo`（地图）、`editor`（编辑器）三个入口在站点导航里并列，**地图页不挂站点页脚**，`plan` 只在 Pages 单独可达。
- **地图显示大小**：`/map/` 首屏没有侧栏挤压，时间标尺、楼层卡、空教室面板都浮在图上，手机端是抽屉。→ 我们：默认 peek 抽屉，首屏地图可见高度 ≥ 视口 70%。
- **三支柱**（时空联动 / 聚合搜索 / 数字孪生）→ 我们对应：3D 校园 + 路网寻路、聚合搜索（建筑/地标/POI 统一搜）、数字孪生化的建筑信息卡。
- 架构上值得抄的只有一条：**双端逻辑同源 + 黄金向量**（`src/campus/world/parity/golden.json`）。我们已经用 `tests/data-source-guard.test.ts` 把「编辑器 / 主应用同一份 pack」钉住了，继续沿这条线加断言即可。

不照搬：Astro/React、WASM 检索、账号体系、后端。

## 3. 本轮范围

- **改**：`demo.html`、`index.html`、`editor.html` 的导航与布局，`src/main.ts` / `src/style.css` / `src/ui/*`，`tests/ui-*.test.ts`，新增 `scripts/verify-ui.mjs`。
- **不动**：`packs/**` 数据、`src/data/**` 数据层、`src/scene/**` 渲染内核、`plan.html` 的内容（只从应用里摘掉入口）。
- **不做**：后端、账号、把编辑器并进地图应用、把 `plan.html` 挂进应用导航。

## 4. 验收

1. `npx tsc --noEmit` 干净；`npm test` 全绿（含新增导航 / 布局 / 令牌断言）；`npm run build` 通过。
2. **真浏览器**（NPC 环境跑 `scripts/verify-ui.mjs`）：320 / 768 / 1280 三档截图；断言首屏地图画布高度 ≥ 视口 70%、无横向溢出、抽屉三档可拖、详情 sheet peek 高度 ≤ 30vh、`plan.html` 链接在地图/编辑器页为 0 条。
3. Pages 部署 success，线上 `demo.html` 资源 hash 与本机 dist 一致。

## 5. 切片

| 片 | 内容 | 谁 |
| --- | --- | --- |
| s1 ✅ | 站点导航收口：三入口并列、地图页不挂站点页脚、应用内 0 条 `plan.html` 链接 + 导航守卫测试；真浏览器三档已在 Kei 本机 Playwright 跑通（320/768/1280 地图均 100% 视口、0 溢出、0 plan 链接） | Kei（NPC 复核可复用同一脚本） |
| s2 | 地图默认视野：首屏地图 ≥ 70% 视口、抽屉默认 peek、相机非对称留白令牌化 | Kei |
| s3 | room-tba 式顶栏 + 底部统一状态条（署名 / 定位 / 工具 / 图例）+ z-index 与动效令牌表 | Kei |
| s4 | 详情三档 sheet（peek/half/full）+ 分类 chip 筛选 + 列表浏览 | Kei |
| s5 | 验证流水线固化：`scripts/verify-ui.mjs` 三档截图 + 断言接进 CI（Pages 前跑） | NPC 跑、Kei 收 |
