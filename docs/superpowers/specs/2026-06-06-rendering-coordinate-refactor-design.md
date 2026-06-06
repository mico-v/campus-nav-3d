# 3D 校园导航：渲染坐标修复与观感重构 设计文档

- 日期：2026-06-06
- 分支：`refactor/rendering-coordinate-fix`
- 状态：已确认，进入实现计划

## 背景与问题

3D 首页"道路有偏移"，多次 AI 修复未果；整体渲染观感"太粗糙"。

### 根因（已用数学推导 + 数据双重验证）

`src/main.ts` 用**两套互相矛盾的坐标写法**把数据 `[x, z]` 映射到世界坐标：

| 实体 | 渲染方式 | 世界 Z |
|------|----------|--------|
| 建筑(盒)、分区、水体、操场、树、POI、路线 | 直接 `.position.set(x,y,z)` | `+z` ✅ |
| **道路** | 原始 `[x,z]` 构造 `Shape` + `mesh.rotation.x=-π/2` | **`-z`** ❌ |
| 建筑(footprint) | 相对中心 `Shape` + `rotateX(-π/2)` | 中心 `+z`，但形状被**镜像** ⚠️ |

`rotateX(-π/2)` 把 Shape 局部 Y 轴映射成世界 **−Z**。道路直接喂入原始坐标，整条路网被沿 X 轴镜像翻转。

**数据证据**：建筑与道路在数据中 Z 范围完全相同（`-219..780`），同处一个坐标系；渲染后道路落到世界 `-780..219`（镜像）。→ 偏移**纯属渲染 bug，非数据问题**。

**架构层根因**：项目无"唯一坐标系 + 唯一 数据→世界 映射"，每类实体各写各的（历史上还混用过 topo 坐标 / scene 坐标 / `topoToScene` 输出 / 死 JSON）。这是"修了又坏"的真正原因。按 systematic-debugging：3 次以上修复失败 = 架构问题，需重构而非补丁。

## 目标与范围

- **A 修复**：统一坐标系、消除 z-fighting、代码模块化。
- **B 观感升级**：Apple 地图 3D 风（柔和扁平配色、白顶彩块、道路分级+描边）。**完整升级**。
- **数据**：保留当前几何数值（已自洽），仅重整为可维护、可被编辑器加载/导出的形式（不改地图样貌）。
- **编辑器**：末期参照 `64dbc2e` 适配回新架构（建筑/道路分页、增删/拖拽路点、导出 JSON）。

### 明确不做（YAGNI）

- 不要雾、不要戏剧化光影、不要后处理（SSAO/Bloom）。
- **关闭投射阴影**，均匀柔和打光（方案甲），靠材质明暗 + 道路描边读出体积。
- 不回退/重算几何数值，不引入除 `vitest` 外的新运行时依赖。

## 架构设计

### 唯一坐标约定（根因修复核心）

数据 `[x, z]` → 世界 `(x, Y_up, z)`，**永不取反、永不镜像**。

`src/scene/geo.ts` 为唯一映射出口：

- `toShapeSpace([x, z]): Vector2(x, -z)` —— 内部唯一约定
- `flatPolygon(points2D): BufferGeometry` —— 贴地多边形（道路、地块等），内部用 `toShapeSpace` + `rotateX(-π/2)`，输出落在 **+z**
- `extrudeFootprint(points2D, height): BufferGeometry` —— 建筑轮廓拉伸，同一约定，顺带修掉形状镜像
- `buildRoadPolygon(points2D, width)` —— 折线→带状多边形（沿用现有 miter 法线逻辑，但在 XZ 正确落位）

所有平面/拉伸几何**必须**经此模块，禁止散落的 `rotation.x = -π/2 + 原始坐标`。

### 模块拆分（替代 807 行 main.ts）

```
src/main.ts             // 极薄启动入口：组装各模块、启动循环
src/scene/geo.ts        // 唯一坐标/形状映射（根因修复所在）
src/scene/builders.ts   // 纯函数：各实体 → 网格（道路/建筑/地块/水体/操场/树/POI/路线）
src/scene/CampusScene.ts// 场景/相机/灯光/控制器/渲染循环 + 按数据重建 group
src/ui/panel.ts         // 侧栏/路线信息/实体列表/DOM 标签/选中提示
src/interaction.ts      // 拾取(raycast) + 建筑聚焦
src/data/campusData.ts  // 类型 + 加载器（瘦身）
src/data/campus.json    // 几何数据（从死 JSON 抽出，数值不变）
```

每个单元职责单一、接口清晰、可独立理解与测试。

### 数据流

`campus.json` → `createDefaultCampusData()` → `CampusScene.setData()` → `builders.*` 经 `geo.ts` 生成网格 → 加入 `campusGroup`。编辑器（末期）在内存中修改 `CampusData` → 重建 → 导出 JSON。

## 观感设计（Apple 地图风 / 方案甲）

- **配色**：低饱和柔和调色板；建筑白/浅顶 + 按类别低饱和体色。
- **道路**：按 `width` 分级；加深色 casing 描边（地图感关键）。
- **Y 层级栈**（防 z-fighting）：地面 0 / 地块 0.05 / 操场 0.10 / 水体 0.15 / 道路描边 0.18 / 道路 0.20；共面处加 `polygonOffset`。
- **灯光**：HemisphereLight 主导 + 一盏弱 DirectionalLight（不投影）。`renderer.shadowMap.enabled = false`。
- **标签**：DOM pill 重做，重叠时择优显示。
- **UI chrome**：左上大 hero → 紧凑顶栏；侧栏极简，整体"地图应用"观感。

## 错误处理 / 边界

- 空数据/缺路线：保持现有降级（"无路线数据"等）。
- 退化几何（道路 <2 点、footprint <3 点）：`geo.ts` 内提前返回，渲染跳过。
- `geo.ts` 对 0 长度法线、重合点做 finite 校验回退（沿用现逻辑）。

## 测试策略

引入 `vitest`。重点是**纯坐标逻辑**（也是把 bug 钉死的回归护栏）：

- `flatPolygon`：数据 `z=100` 的多边形顶点世界 Z 必须 `+100`（当前代码会失败，修复后通过）。
- `extrudeFootprint`：已知**非对称**多边形顶点世界 XZ 与输入一致（不镜像）。
- `buildRoadPolygon`：沿 X 轴、`z=100` 的直路 → 带状中心在世界 `z≈100`。
- 边界：<2 点 / <3 点 / 重合点不抛错。

渲染观感用 `verify` / `run` 技能启动应用、截图人工核对。

## 实施顺序（用户指定）

1. **数据重整**：抽 `campus.json`，瘦身 `campusData.ts`（数值不变）。
2. **坐标修复**：`geo.ts` + vitest 单测（先红后绿，根因）。
3. **模块化 + 重建渲染**：拆分 main.ts，所有几何走 geo.ts。
4. **观感升级**：Apple 地图风（配色/道路描边/层级/灯光/标签/UI）。
5. **适配编辑器**：参照 `64dbc2e` 接回新架构（可能另起子计划细化）。

## 风险

- 编辑器适配工作量较大，第 5 阶段可能需要单独的实现子计划。
- 观感为主观目标，靠截图迭代收敛。
- 数据重整须确保抽出的 `campus.json` 与原死 JSON **逐字节等价**（先快照对比再删除原内联数据）。
