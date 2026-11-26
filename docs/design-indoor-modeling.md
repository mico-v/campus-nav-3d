# 室内建模方案（食堂内 KFC / 咖啡等店面）

状态：**方案定稿，代码未开工**。本片只出方案，不写几何、不改渲染。
上游依据：`docs/design-indoor-rooms.md`（room 数据形状已落地）、`docs/design-overview-v2.md` §4.2 室内模型、
`docs/external/studev-review.md`（studev 原文口径）、`docs/audit/campus-plan-crosscheck.md` §五 §六。

## 0. 结论先说

1. **不建墙体家具，不追求 BIM。** 一栋楼 = 一套「楼层平面 + 房间多边形 + 竖向交通点」，
   楼板轮廓拉伸成体，楼层之间靠 `connectors` 串。全量数据体量小到能进 pack（单楼 < 200KB）。
2. **室内不是第二套场景。** 复用 `CampusScene` 单个场景，室内 = 相机推进 + 楼层剖切 + 其余楼层半透明，
   与 studev「there is no second mode」同口径。
3. **先补数据、再接 UI、最后接寻路**。顺序不能反：几何没坐标就画不出剖切，路网没节点就排不了线。
4. **一期只做 4 栋示范楼**：二食堂（已有 rooms 样板）、图书馆、教学 1 楼、体育馆。
   其余楼显式给「未建模 · 帮我补」入口，把维护成本转成数据来源。

## 1. 范围与不做的事

| 做 | 不做 |
|---|---|
| `CampusFloor` 补 `outline` / `height` / `rooms[].polygon` | 墙、门、家具、材质 |
| 楼层剖切：选中层 + 上层半透明 | BIM / IFC 导入 |
| 竖向连接（楼梯电梯）在剖面上画竖井 | 室内定位（ibeacon / UWB） |
| `indoorNetwork` 楼层内拓扑 + 竖向边 | 实时人流、室内导航语音（二期） |
| 未建模楼层的显式缺口入口 | 编辑器全量功能（先只做单房间打点） |

## 2. 数据形状（在现网 schema 上增量，不破坏老 pack）

```ts
interface CampusFloor {
  level: number                  // 已有，0 = 一楼
  outline?: Point[]              // 新增：楼板外轮廓，闭合多边形，≥3 点
  height?: number                // 新增：层高（米），缺省 3.6
  rooms?: CampusRoom[]           // 已有（docs/design-indoor-rooms.md）
  connectors?: CampusConnector[] // 已有：楼梯/电梯/扶梯
}

interface CampusRoom {
  // 已有字段全部保留
  polygon?: Point[]              // 从「可选」升级为「示范楼必填」，坐标系与楼栋同一 local 坐标
  door?: Point                   // 新增：房间到走廊的出入口锚点
}

interface CampusConnector {
  type: 'stair' | 'elevator' | 'escalator'
  at: Point                      // 已有
  fromLevel: number              // 新增
  toLevel: number                // 新增
}

interface IndoorNetwork {
  nodes: Array<{ id: string; at: Point; level: number; buildingId: string; roomId?: string }>
  edges: Array<{ a: string; b: string; kind: 'floor' | 'vertical'; cost?: number }>
}
```

约束：

- `polygon` 与 `outline` 一律用**楼栋 local 坐标**（与建筑 footprint 同原点），渲染时只加一次建筑位移，
  避免两套坐标互相偏移。
- 校验规则（写进 `campus-validate` 口径）：
  1. `outline` 闭合、无自交、面积 > 0；
  2. `rooms[].polygon` 必须落在所属层 `outline` 内（容差 0.5m）；
  3. 同层房间多边形两两不重叠（容差 0.1m，重叠即报错并指出两个 id）；
  4. `connectors.fromLevel/toLevel` 必须指向存在的楼层；
  5. `indoorNetwork.edges` 的 `a`/`b` 必须存在，`vertical` 边两端 level 不同且同一 buildingId。
- 老 pack 无 `outline` / 无 `indoorNetwork` 时**照旧通过**，室内入口自动隐藏。

## 3. 渲染：剖切怎么做

- **一个场景，三种相机位姿**：室外（现有 overview）、进楼（相机飞到楼体正面、distance 按楼高算）、剖切（正交或小 FOV 俯视锁死在选中层）。
- **剖切规则**：选中层完整显示（楼板 + 房间多边形挤出 0.15m 薄片，房间用 `kind` 上色），
  `level+1` 半透明外壳（opacity 0.15），其余层隐藏；`level=0` 时下方无楼层，只显示地面锚。
- **房间可见性**：房间不单独建 mesh，用楼板平面上的多边形薄片 + 描边，选中时描边加粗并抬 2cm 防 z-fighting。
- **竖向连接**：楼梯电梯在剖面上画为竖井（半透明圆柱/方柱贯穿），点击直接跳目标层并高亮出口。
- **性能**：单楼房间数按 ≤ 60 估，每房间 ≤ 24 顶点，单楼三角面 < 5000，远低于 LOD1 的 3000 面/栋预算之外的门槛；
  剖切态关阴影、关后期。100ms 内完成切换（切换只改 visible 与 material，不重建几何）。

## 4. 交互与状态

扩展现有 `ViewState`：`{ ..., level: number | null, indoor: { buildingId, roomId? } | null }`。

- 进楼：点室内 POI 或双击楼体 → `indoor` 赋值 → 楼层条出现（已有 UI）。
- 楼层切换：楼层条点击 / 键鼠 `[` `]` / 双指上下滑；`level` 变化只影响可见性与相机高度。
- 退出：返回按钮或点室外地图空白 → `indoor = null`，相机回到室外 overview 位姿。
- 深链：沿用 `?building=&level=`（M4-A 契约），补 `&room=`，解析失败降级到楼层级不报错。
- 2D 与 3D 同源：切 2D 时室内视图展开为「该楼该层平面图」，房间多边形直接复用，不另画一套。

## 5. 寻路：室内怎么接进 `planRoute`

一期只做**路线规划**，不做定位。

1. 建图：每层房间 → 节点（`roomId`），门位 → 节点，走廊按 outline 内缩 0.8m 生成中轴候选点，
   房间门到走廊最近点连 `floor` 边，楼梯电梯两端连 `vertical` 边。
2. 查询：起点「房间 A / 3F」→ 终点「房间 B / 1F」：室内段 → 出入口锚点 → `roadNetwork` → 目标楼出入口 → 室内段。
3. 代价：距离 + 楼梯惩罚（每层 +8m 等效）+ 无障碍模式台阶惩罚 + 施工封路（动态层）。
4. 地板：跨楼跨层 200ms 内响应（图规模 < 2000 节点，A* 足够，无需预计算）。
5. 边界：楼下没有出入口锚点的，直接返回「该楼未接入路网」，不静默排一条穿墙线。

## 6. 落地顺序（切片，一片一个 PR）

| 片 | 内容 | 依赖 | 验收 |
|---|---|---|---|
| S1 | schema 增量 + 校验规则 + 老 pack 回归 | 无 | `npx vitest run` 全绿；老 pack 校验通过；坏 polygon 用例报错带 id |
| S2 | 二食堂 S1 数据补全（outline + 3 房间 polygon + connectors） | S1 | 数据自检脚本过；页面剖切可见且房间可点 |
| S3 | 剖切渲染 + 楼层相机 | S2 | 进楼/切层/退出三种位姿截图；切层 < 100ms |
| S4 | `indoorNetwork` 生成 + 接入 `planRoute` 室内段 | S2 | 跨楼跨层用例：图书馆 3F → 二食堂 1F 路径连通 |
| S5 | 未建模楼层缺口入口 + 单房间打点编辑器 | S3 | 未建模楼显示入口，打点后刷新可见 |

S1/S2 可并行；S3 等 S2；S4 只依赖 S2 数据、可与 S3 并行；S5 最后。

## 7. 风险

| 风险 | 影响 | 处置 |
|---|---|---|
| 房间多边形要靠人手拉，进度不可控 | 示范楼做不完 | 只锁 4 栋；其余楼给缺口入口；编辑器先做单房间打点 |
| 坐标系不统一导致剖切错位 | 渲染漂移 | polygon 一律 local 坐标 + 校验落在 outline 内 |
| NPC 交 PR base 旧会回退已合内容 | main 被抹 | 每次复核先看 diff 有无删除项（记录本 #ui4q / #ixuh） |
| 剖切态与 2D 模式状态不同步 | 切换丢选中/丢楼层 | `ViewState` 单一来源，2D 只订阅不另存 |
| pack 体积膨胀 | 首屏变慢 | 室内数据按楼分片（`indoor/<buildingId>.json`），进楼才拉 |
| 现有 `rooms` 只有名字无坐标 | S2 无法直接进场 | S2 先补二食堂，坐标来源：平面图人工标定 + 抽检两处尺寸 |

## 8. 仍欠 / 交接

- 三食堂 / 东区食堂 / 西区菜鸟驿站店面仍未进 `rooms`（crosscheck §六 第 2 条）。
- `alias` / `aliases` 统一、搜索层吃 alias（§六 第 3、4 条）已在 M3 收官里处理，本方案不重复。
- 平面图来源与人工标定工作量估算，需要主人给一张二食堂平面图；**没有图就卡在 S2 数据**。
