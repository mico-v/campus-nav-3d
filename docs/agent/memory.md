# 项目记忆台账

最后校准：2026-11-18。改这一份就是改项目的「记忆」，写法见文末规则。

## 一句话定位

把单校三维导航原型改造成「多校可复用 campus pack」体系：数据规范与三件 CLI 做通用层，
UI 各校自持；差异化压在室内精度、地点级 UGC、深链三件事上。

## 技术基线（可直接引用的数字）

- 技术栈：Vite + TypeScript + Three.js；四个 HTML 入口 `index.html`（落地页）、`plan.html`（计划报告）、
  `demo.html`（3D 原型）、`editor.html`（地图编辑器）；`vite.config.ts` 的 `rolldownOptions.input` 必须四个都列。
- 数据：`src/data/campusData.ts` 与 `src/data/campus.json` —— 75 建筑 / 7 分区 / 2 水体 / 5 场地 /
  14 条道路（roadNetwork 39 节点、42 段）。
- 测试：`npm test`（vitest）28 文件 168 项全绿；`npm run build`（tsc + vite build）通过。
- 线上：GitHub Pages 绑 `https://map.mioc.cc/`；`mico-v.github.io/campus-nav-3d/` 会 301 过去。
- CI：GitHub Actions（`.github/workflows/deploy.yml`，部署）；CNB 云原生构建（`.cnb.yml`，push/PR 跑
  install + build + test，4 核约 25s）。
- 许可：代码 AGPL-3.0-only（`LICENSE` + `NOTICE.md` 四条硬要求）；数据 CC BY-SA 4.0；OSM 派生数据 ODbL 署名；
  模型在 `packs/<campus>/assets/registry.json` 里标 `license` / `attribution`。

## 里程碑

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 通用化底座：JSON Schema + `campus-import` / `campus-validate` / `campus-bundle` 三 CLI，数据迁入 `packs/usts-tianping/` | 未开工，等切片 |
| M2 | 双模与室内：3D/2D 共享 `ViewState`；楼层层多边形拉伸 + 显式竖向连接表 | 未开工，依赖 M1 |
| M3 | 信息与活动：地点级 post/event（必须锚 `placeId`、带 `expiresAt`） | 未开工 |
| M4 | 客户端与开放：原生壳、深链 `/go?...` 与短链、开放数据 | 未开工 |

## 已定决策（带日期）

- 2026-11-11：主线从「单校三维导航」扩到「AI 情境推荐 + XR 现场发现 + 地点级社区」，落地页 6 锚点、技术栈五层、路线图六阶段。
- 2026-11-17：许可证定为 AGPL-3.0-only；数据 CC BY-SA 4.0；OSM 派生 ODbL 署名。
- 2026-11-18：方案 v2.1 定稿，执行分三层——本机只编辑与单测，重活走 Codespaces 或 CNB 云原生构建，
  GitHub Actions 只做对外可验证的兜底。
- 2026-11-18：CNB 流水线跑通（`.cnb.yml` 分支键用 `main` + `$`，YAML 锚点复用），一次完整 check 约 25s。

## 已知坑

- 数据涨到 39 节点 / 42 段后，`index.html` 与 `README.md` 仍写「38 节点 / 41 段」——文案未回写。
- `.cnb.yml` 的分支键只认精确名、glob 和 `$` 兜底；写错（例如 `(**)`）不会报语法错，只是流水线永远不触发。
- 本机 1.6G 内存跑不动大构建；vitest 全量在本机约 44s，在 CNB 4 核约 3.5s。
- 本机无完整 chromium，e2e 与 WebGL 截图不可用；需要时在 CNB 节点上跑。

## 进行中的人与事

- 角色分工：负责人（本人）、数据建模、前端可视化、测试文档、指导老师。公开文档只写角色，不写姓名。
- 当前动作：M1 待拆切片；同批待修项为节点数文案与 README 的许可证/开发环境两节（已补）。

## 未决问题

- 原生壳现在立项还是等 M3 之后：Android Kotlin 自研 vs Capacitor 包一层。
- UGC 首发范围：只给社团，还是同时开匿名失物。
- 室内建模先做哪四栋示范楼。
- 通用化止于「数据规范 + CLI」，还是做到「换皮即用」的 UI。
- `plan.html` 的预算与六阶段日期仍是草案，页面已标「初步方案」。

## 更新规则

1. 每个合并的 PR 追加一行到「已定决策」或「进行中的人与事」，格式：`日期：结论（PR #编号）`。
2. 踩过的坑进「已知坑」，写清现象与规避办法，一条一行，不复述代码。
3. 计划中的事只进「未决问题」，不进「已定决策」；决策落地后从「未决」删掉并补一行决策。
4. 不覆盖历史，不做大段改写；超过 120 行时把已完结的段落归档到 `docs/agent/archive/`。
