# 自托管部署 + 建模页室内建模 方案

> 版本：v1 草案（待拍版）
> 触发：主人 11-26 提出「项目本来是有建模功能的，但只能在 dev 时启动；后面不用 GitHub Pages 了，在服务器上部署服务启动」。
> 定稿后本文作为 S1~S5 切片的范围依据。

## 0. 一句话结论

把现在只在 dev 里活着的 `vite-plugin-campus-api`（内存 store）搬成一个独立的 Node HTTP 服务
（`apps/server`，零新依赖：`node:http` + `node:fs`），由它同时托管构建产物 `/`、建模页，并暴露 `/api/*`。
前端通过 `VITE_API_BASE` 区分「同源（Pages 静态只读）」和「独立后端（可写）」，静态包继续能跑、只是不可写。
建模页把「楼层 / 房间」从只读列表升级成可视化编辑：平面底图 + 多边形绘制 + 右侧表单，保存走同一套 pack → store。

## 1. 现状（仓库里查得到的事实）

| 项 | 现状 | 出处 |
| --- | --- | --- |
| API 位置 | `vite-plugin-campus-api.ts`，Vite 插件内 `configureServer` 挂 Connect 中间件 | 仓库根 |
| 存储 | 进程内存（Map），dev 重启即丢 | 同上 |
| 接口 | `GET /api/campus`、`GET /api/campus/:id`、`POST/PUT/DELETE /api/campus`（id 白名单 `[a-z0-9-]`） | 同上 |
| 前端取数 | `fetch('/api/campus')`，失败回落 `packs/<id>/campus.json` | `src/data/*` |
| 建模页 | `editor.html` + `src/editor/main.ts`，已有楼层/房间列表、3D 预览 | `src/editor/` |
| 室内数据形状 | `CampusFloor`、`CampusRoom`（polygon + level）、`CampusEntrance`、`building.interior` | `packages/campus-schema/src/index.ts` |
| 校验 | `validateCampusPack` 已含层闭合、落在 outline 内、同层不重叠、层引用、边端点 | 同上 |
| 构建入口 | `index / demo / plan / editor` 四个 html，`base: './'` | `vite.config.ts` |
| 部署 | GitHub Actions → Pages（静态） | `.github/workflows` |

也就是说：**数据形状和校验已经有，缺的是「谁来跑这个服务」和「建模页怎么改数据」**。这轮不碰渲染和寻路。

## 2. 后端：`apps/server`（Node 原生，不引框架）

### 2.1 分层

```
apps/server/src/
  main.ts        # 启动 + 安全闸 + 信号优雅退出
  http.ts        # 路由：/api/* → api，其余 → 静态托管
  api.ts         # 复用当前 plugin 的 handler 逻辑（GET/POST/PUT/DELETE）
  store.ts       # 文件存储：data/packs/<id>.json + 原子写
  static.ts      # dist 静态托管（mime + 缓存头 + SPA 回落）
```

handler 从 `vite-plugin-campus-api.ts` 抽到 `packages/campus-pack-store`（或 `apps/server/src/api.ts`），
插件改成 `import` 同一份实现 —— 保证 dev 与部署行为一致，不再两份逻辑。

### 2.2 存储

- 现状是内存，`dev` 重启丢包；改成**文件存储**：`data/packs/<id>.json`，写用 `writeFile` 到 `.tmp` 再 `rename`（原子）。
- 启动时把 `packs/*/campus.json` 作为种子导入一次（文件不存在才写），不覆盖已有。
- 校验：写入前跑 `validateCampusPack`，失败返 400 + 第一条错误路径。
- 并发：单进程内存锁（Promise 队列），不做分布式。

### 2.3 接口

保持现有 4 个接口不变（前端零改动），新增两个只读接口供建模页用：

- `GET /api/packs` → `[{ id, name, updatedAt }]`
- `GET /api/health` → `{ ok: true, version, uptime }`

### 2.4 部署形态

```
node dist-server/main.js          # 单进程
  ├─ /            → dist/index.html + assets（静态）
  ├─ /editor      → dist/editor.html
  ├─ /api/campus  → 可写（需 token）
  └─ :8080        ← 反代 / 直连
```

- 环境变量：`PORT`（默认 8080）、`API_TOKEN`（写操作必填，未设置则写接口 503）、`DATA_DIR`（默认 `./data`）。
- 前端用 `VITE_API_BASE`：空 = 同源（Pages / 同机部署）；有值 = 指向独立后端（如 `http://host:8080`）。
- 跨域：`API_TOKEN` 存在时按 `CORS_ORIGIN` 白名单放行，别开 `*`。

### 2.5 构建

- 前端：`vite build` 不变。
- 后端：`tsc -p apps/server/tsconfig.json` 输出 `dist-server/`；或在 `node --experimental-strip-types` 下直接跑 TS（与 `packages/campus-cli` 一致）。
- 新增脚本：`npm run start`（dev 服务）、`npm run build:all`（前端 + 后端）。
- **零新依赖**是硬约束：本机 1.6G 内存，也不该为一个静态托管引 express/fastify。

## 3. 前端：API 抽象与模式切换

- 新增 `src/data/apiClient.ts`：`resolveApiBase()`（`import.meta.env.VITE_API_BASE` 优先）、`getCampus`、`saveCampus`、`probeHealth`。
- `getCampus` 失败回落静态包（保留现有行为），并在 UI 上标「静态模式 · 只读」。
- 写操作在静态模式下隐藏/置灰（建模页只读预览）。
- Pages 部署保留一条：静态站点仍可访问，只是不能保存。**不要删 Pages workflow**，README 写清两种模式的差别。

## 4. 建模页：室内建模的最小可用闭环

### 4.1 布局（沿用 room-tba 风格：左树 / 中平面 / 右表单）

- **左**：建筑列表 → 楼层列表（`interior.floors`）→ 选中层。
- **中**：SVG 平面视图（正交俯视，`viewBox` 自动贴合 outline），画布上叠：
  - 楼板 outline（只读描边）
  - 房间 polygon（可选中、可拖点、可新增/删除）
  - 双击画布加点，Esc 结束当前多边形
- **右**：选中对象表单（房间 id / 名称 / 类型 / level / polygon 顶点数 / 删除）。
- 底部：**校验结果面板**，直接展示 `validateCampusPack` 的 5 条错误（闭合 / 在 outline 内 / 同层不重叠 / 层引用 / 端点），点错误跳到对应对象。

### 4.2 交互与数据

- 所有编辑只改内存中的 `CampusPackData`，点「保存」才 `PUT /api/campus/:id`。
- 渲染走现有 `CampusScene`（S3 的剖切复用同一相机位姿），不在本片做剖切，只保证平面 ↔ 3D 视图同一份数据。
- undo 用简单快照栈（每次操作前 `structuredClone`，上限 20 步），不引库。
- 保存前强制校验；校验不过不允许保存，错误面板高亮。

### 4.3 与教学/演示的关系

- 建模页不参与首屏加载，独立入口 `editor.html`，构建时拆包（已有 codeSplitting）。
- 未建模的楼在建模页里显示「未建模 · 帮我补」占位，点开就是空 outline + 新建楼层。

## 5. 切片（一片一个 PR）

| # | 内容 | 依赖 | 验收 |
| --- | --- | --- | --- |
| S0 | **本方案定稿** | — | 主人拍版本文 §2~§4 |
| S1 | `apps/server`：抽 handler + 文件存储 + `/api/health`，vite 插件复用同一份；`npm run start` 起得来 | S0 | `curl :8080/api/campus` 返回 pack；重启后数据仍在；`validate:pack` 照旧过 |
| S2 | 静态托管 + `/editor` 路由 + `VITE_API_BASE` 与 apiClient 抽象；Pages 仍可用 | S1 | `npm run build:all` 后 `node dist-server/main.js`，`/` 与 `/editor` 打开 200；无后端时页面回落静态包 |
| S3 | 建模页平面视图：outline + polygon 渲染 + 选中 | S2 | 打开二食堂已建楼层，房间数与 `campus.json` 一致 |
| S4 | 编辑闭环：加点/拖点/新建/删除 + 表单 + 校验面板 + 保存 | S3 | 改一个房间名保存 → 重新 GET 拿到新值；故意造不闭合 polygon → 保存被拒并高亮 |
| S5 | 部署文档 + 安全闸（token / CORS / DATA_DIR）+ 备份说明 | S1 | 无 token 写接口 503；`docs/deploy-selfhost.md` 按步骤能起 |

S1/S2 与 S3/S4/S5 的目录基本不重叠（`apps/` vs `src/editor/`），可并行派 2 片。

## 6. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 服务器上写盘权限/目录不存在 | 保存全失败 | `DATA_DIR` 启动时 `mkdir -p`，不可写就退出并打日志 |
| 没有鉴权就暴露在公网 | 任何人可改地图 | 写接口必须 `API_TOKEN`，没配则禁用写；只读接口不加锁 |
| 抽 handler 时行为漂移 | dev 与部署不一致 | S1 用同一份 handler，dev 也走文件存储，加一条回归用例 |
| 建模页拖点交互在触屏/小屏难用 | 建模体验差 | 提供数值表单兜底（直接输入坐标），不只靠拖拽 |
| 与室内方案 S1~S5（schema / 二食堂数据 / 剖切 / 室内路网）重叠 | 两套切片撞车 | 本方案只做「服务化 + 编辑体验」，schema 与室内数据仍归 `design-indoor-modeling.md` 的切片 |
| 单进程文件存储无锁 | 并发写坏文件 | 原子 rename + 单进程写队列；不上多副本 |

## 7. 明确不做

- 不引 express / fastify / koa 等框架。
- 不做用户系统、账号、权限分级（只有一个共享 token）。
- 不做几何自动识别（平面图 → 自动提取房间），仍是人工描。
- 不删 Pages workflow，静态只读模式保留。
