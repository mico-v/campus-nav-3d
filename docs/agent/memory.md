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
| M1 | 通用化底座：JSON Schema + `campus-import` / `campus-validate` / `campus-bundle` 三 CLI，数据迁入 `packs/usts-tianping/` | 已完成：S1–S5 全部合入（PR #8/#10/#11/#13/#12），三子命令可用，232 项单测全绿 |
| M2 | 双模与室内：3D/2D 共享 `ViewState`；楼层层多边形拉伸 + 显式竖向连接表 | 未开工，依赖 M1 |
| M3 | 信息与活动：地点级 post/event（必须锚 `placeId`、带 `expiresAt`） | 未开工 |
| M4 | 客户端与开放：原生壳、深链 `/go?...` 与短链、开放数据 | 原生壳骨架已合（PR #9）；N2 搜索与 JS 桥在复核（PR #14） |

## 已定决策（带日期）

- 2026-11-11：主线从「单校三维导航」扩到「AI 情境推荐 + XR 现场发现 + 地点级社区」，落地页 6 锚点、技术栈五层、路线图六阶段。
- 2026-11-17：许可证定为 AGPL-3.0-only；数据 CC BY-SA 4.0；OSM 派生 ODbL 署名。
- 2026-11-18：方案 v2.1 定稿，执行分三层——本机只编辑与单测，重活走 Codespaces 或 CNB 云原生构建，
  GitHub Actions 只做对外可验证的兜底。
- 2026-11-18：CNB 流水线跑通（`.cnb.yml` 分支键用 `main` + `$`，YAML 锚点复用），一次完整 check 约 25s。
- 2026-11-18：项目人格与台账落在 `docs/agent/`（`persona` / `memory` / `pipeline`），NPC 增第四个角色「项目管家」，专职追踪与协同。
- 2026-11-18：原生壳立项为 Android 原生，Kotlin + Jetpack Compose + Material 3（动态取色，低版本回落品牌种子色），不走 Capacitor；构建放 GitHub Actions，web 侧仍走 CNB。
- 2026-11-18：开发通道定为 issue 驱动 —— 需求先落切片 issue，再在 CNB 云原生开发环境或分支里实现，项目管家负责确认与统筹进度；范围放开到全仓，门禁三色与人审保留。
- 2026-11-18：`core/`、数据 schema、寻路算法、渲染主循环、部署与许可仍是红区，改动要写清理由并全量评审。
- 2026-11-18：开发通道改到 **cnb.cool**：切片落 CNB issue，派工时 `work_mode: true` 并 @CodeBuddy（或项目 NPC）直接写代码、开分支与 PR；GitHub 侧只留 PR 评审与 Pages 部署。
- 2026-11-18：M1-S1（PR #8）与 M4-N1（PR #9）由项目管家在「放开干」授权下自查后合并：181 项单测全绿、build 通过、Android CI 2m2s 绿。
- 2026-11-18：M1-S2（PR #10）与 M1-S3（PR #11）由 CNB NPC 实现、项目管家复核合并；单测从 181 升到 211 项，`campus-validate packs/usts-tianping` 零错误。
- 2026-11-18：`campus-validate` 的路网重复边按**有向**判定（同向重复才算错，反向边合法），因为真实路网里存在双向边。
- 2026-11-18：M1 整阶段完成——`campus-validate` 现有 `validate` / `import` / `bundle` 三个子命令，`packs/usts-tianping` 与 `packs/demo-empty` 均零错误，232 项单测全绿。
- 2026-11-18：新增 `tools/project-status.mjs`（`npm run status`）作为唯一追踪入口：里程碑、在飞 PR、派工 issue、停滞提醒四段；WIP 上限 3。

## 已知坑

- 数据涨到 39 节点 / 42 段后，`index.html` 与 `README.md` 仍写「38 节点 / 41 段」——文案未回写。
- `.cnb.yml` 的分支键只认精确名、glob 和 `$` 兜底；写错（例如 `(**)`）不会报语法错，只是流水线永远不触发。
- 本机 1.6G 内存跑不动大构建；vitest 全量在本机约 44s，在 CNB 4 核约 3.5s。
- 本机无完整 chromium，e2e 与 WebGL 截图不可用；需要时在 CNB 节点上跑。
- CNB NPC 的分支常基于旧 `main`：直接看 diff 会把它未包含的后续提交当作「删除」，复核时必须 `git merge` 对齐，不能直接覆盖。
- CNB NPC 会顺手改 `docs/agent/*` 这类非切片文件，复核时一律丢弃；派工时要在 Issue 里写清「不做什么」。
- NPC 常漏「接线」：模块写完但没接进 CLI（S4/S5 都是这样），验收里必须写「能被 CLI 调用 + 一条 CLI 层测试」。
- Android 侧本机无法编译，NPC 的 Kotlin 代码错误只能由 GitHub Actions 暴露；合 Android 片前必须先看该 PR 的 Android check。

## 进行中的人与事

- 角色分工：负责人（本人）、数据建模、前端可视化、测试文档、指导老师。公开文档只写角色，不写姓名。
- 当前动作：M1 前 3 片已合入 main；S4（`campus-import osm`）与 S5（`campus-bundle` + `demo-empty`）已派给 CNB NPC；M4-N2 壳内搜索与 JS 桥也已派工。
- 同批待修项：节点数文案（38/41 → 39/42，随 #3 落地）与 README 的许可证/开发环境两节（已补）。

## 未决问题

- UGC 首发范围：只给社团，还是同时开匿名失物。
- 室内建模先做哪四栋示范楼。
- 通用化止于「数据规范 + CLI」，还是做到「换皮即用」的 UI。
- `plan.html` 的预算与六阶段日期仍是草案，页面已标「初步方案」。

## 更新规则

1. 每个合并的 PR 追加一行到「已定决策」或「进行中的人与事」，格式：`日期：结论（PR #编号）`。
2. 踩过的坑进「已知坑」，写清现象与规避办法，一条一行，不复述代码。
3. 计划中的事只进「未决问题」，不进「已定决策」；决策落地后从「未决」删掉并补一行决策。
4. 不覆盖历史，不做大段改写；超过 120 行时把已完结的段落归档到 `docs/agent/archive/`。
