# USTS 天屏校区路网覆盖审计

生成时间：2026-11-22T05:12:27.438Z

> 只读审计：不改 `src/**`、`packs/**` 或任何阈值。`distance_m` 取建筑 `position` 到最近路网节点的直线距离，`footprint_min_distance_m` 取轮廓顶点到同一节点的最短直线距离（无轮廓时回退到 position）；单位沿用 pack 的 local-meters（1 单位 = 1m）。

## 汇总

- 建筑 75 / 路网节点 146 / 路段 149 / 无向连通分量 1（孤立节点 0）
- `distance_m <= 30m`：75 栋；`30m < distance_m <= 100m`：0 栋；`distance_m > 100m`：0 栋
- 最小 1.72m；中位数 20.00m；最大 23.59m（东区宿舍与服务区单体楼05，`osm-building-1496902328`）
- 与 issue 基线对照：建筑 75 / 节点 39 / 段 42 / 连通分量 1；≤30m 1 栋（二号门）、30~100m 13 栋、>100m 61 栋；最大 ~607m（东区宿舍与服务区单体楼11）；中位 ~228m。本次复算有偏差，逐项以本报告数值为准，原因见下。

## 逐栋表格

| building_id | building_name | nearest_node_id | nearest_node_kind | distance_m | footprint_min_distance_m | verdict |
| --- | --- | --- | --- | ---: | ---: | --- |
| place-02 | 二号门 | node-0038 | waypoint | 1.72 | 11.71 | connected(<=30m) |
| place-03 | C4教学楼 | node-link-0035 | waypoint | 20.00 | 62.23 | connected(<=30m) |
| place-04 | 教学2楼 | node-link-0036 | waypoint | 20.00 | 13.40 | connected(<=30m) |
| place-05 | 图书馆 | node-link-0037 | waypoint | 20.00 | 41.69 | connected(<=30m) |
| place-07 | 院士楼 | node-link-0038 | waypoint | 20.00 | 7.93 | connected(<=30m) |
| place-13 | 塔影阁 | node-link-0039 | waypoint | 20.00 | 30.24 | connected(<=30m) |
| place-14 | 二食堂 | node-link-0040 | waypoint | 20.00 | 3.92 | connected(<=30m) |
| place-32 | C5教学楼 | node-link-0041 | waypoint | 20.00 | 53.65 | connected(<=30m) |
| place-33 | C6教学楼 | node-link-0042 | waypoint | 20.00 | 67.65 | connected(<=30m) |
| place-40 | 音乐厅 | node-link-0043 | waypoint | 20.00 | 46.58 | connected(<=30m) |
| place-42 | 教学4楼 | node-link-0044 | waypoint | 20.00 | 22.58 | connected(<=30m) |
| place-43 | 教学5楼 | node-link-0045 | waypoint | 20.00 | 32.83 | connected(<=30m) |
| place-44 | 教学3楼 | node-link-0046 | waypoint | 20.00 | 9.02 | connected(<=30m) |
| place-45 | 教学6楼 | node-link-0047 | waypoint | 20.00 | 59.92 | connected(<=30m) |
| place-46 | 教学7楼 | node-link-0048 | waypoint | 20.00 | 17.67 | connected(<=30m) |
| osm-named-356627225 | C1教学楼 | node-link-0049 | waypoint | 20.00 | 26.36 | connected(<=30m) |
| osm-named-356627222 | C2教学楼 | node-link-0050 | waypoint | 20.00 | 18.52 | connected(<=30m) |
| osm-named-920093708 | C3教学楼 | node-link-0051 | waypoint | 20.00 | 21.81 | connected(<=30m) |
| osm-named-920093733 | 8号教学楼 | node-link-0052 | waypoint | 20.00 | 15.01 | connected(<=30m) |
| osm-named-356627226 | 职工之家 | node-link-0053 | waypoint | 20.00 | 43.90 | connected(<=30m) |
| osm-named-920093694 | 2号楼 | node-link-0054 | waypoint | 20.00 | 17.96 | connected(<=30m) |
| osm-named-920093693 | 3号楼 | node-link-0055 | waypoint | 20.00 | 17.21 | connected(<=30m) |
| osm-named-356627231 | 5号楼 | node-link-0056 | waypoint | 20.00 | 44.39 | connected(<=30m) |
| osm-building-356387818 | 西区宿舍2组团单体楼04 | node-link-0057 | waypoint | 20.00 | 31.95 | connected(<=30m) |
| osm-building-356627207 | 体育馆2单体楼01 | node-link-0058 | waypoint | 20.00 | 76.38 | connected(<=30m) |
| osm-building-356627227 | 新政楼 | node-link-0059 | waypoint | 20.00 | 40.32 | connected(<=30m) |
| osm-building-920093710 | 西区快递点单体楼01 | node-link-0060 | waypoint | 20.00 | 24.90 | connected(<=30m) |
| osm-building-920093711 | 西区宿舍1组团单体楼01 | node-link-0061 | waypoint | 20.00 | 24.22 | connected(<=30m) |
| osm-building-920093712 | 西区宿舍1组团单体楼02 | node-link-0062 | waypoint | 20.00 | 19.33 | connected(<=30m) |
| osm-building-920093713 | 西区宿舍1组团单体楼03 | node-link-0063 | waypoint | 20.00 | 21.98 | connected(<=30m) |
| osm-building-920093714 | 西区宿舍2组团单体楼01 | node-link-0064 | waypoint | 20.00 | 32.36 | connected(<=30m) |
| osm-building-920093715 | 西区宿舍2组团单体楼02 | node-link-0065 | waypoint | 20.00 | 26.08 | connected(<=30m) |
| osm-building-920093716 | 西区宿舍2组团单体楼03 | node-link-0066 | waypoint | 20.00 | 26.17 | connected(<=30m) |
| osm-building-920093717 | 西区宿舍3组团单体楼01 | node-link-0067 | waypoint | 20.00 | 29.38 | connected(<=30m) |
| osm-building-920093718 | 西区宿舍3组团单体楼02 | node-link-0068 | waypoint | 20.00 | 38.24 | connected(<=30m) |
| osm-building-920093721 | 员工宿舍单体楼01 | node-link-0069 | waypoint | 20.00 | 47.85 | connected(<=30m) |
| osm-building-920093722 | 西区宿舍5组团单体楼01 | node-link-0070 | waypoint | 20.00 | 36.40 | connected(<=30m) |
| osm-building-920093723 | 西区宿舍5组团单体楼02 | node-link-0071 | waypoint | 20.00 | 37.88 | connected(<=30m) |
| osm-building-920093724 | 西区宿舍5组团单体楼03 | node-link-0072 | waypoint | 20.00 | 41.12 | connected(<=30m) |
| osm-building-920093725 | 西区宿舍5组团单体楼04 | node-link-0073 | waypoint | 20.00 | 38.36 | connected(<=30m) |
| osm-building-920093726 | 西区宿舍4组团单体楼01 | node-link-0074 | waypoint | 20.00 | 33.73 | connected(<=30m) |
| osm-building-920093727 | 西区宿舍4组团单体楼02 | node-link-0075 | waypoint | 20.00 | 41.17 | connected(<=30m) |
| osm-building-920093728 | 西区宿舍4组团单体楼03 | node-link-0076 | waypoint | 20.00 | 45.91 | connected(<=30m) |
| osm-building-920093729 | 西区宿舍4组团单体楼04 | node-link-0077 | waypoint | 20.00 | 22.35 | connected(<=30m) |
| osm-building-1017326418 | 东区宿舍与服务区单体楼01 | node-link-0078 | waypoint | 20.00 | 25.34 | connected(<=30m) |
| osm-building-1017326419 | 东区宿舍与服务区单体楼02 | node-link-0079 | waypoint | 20.00 | 25.74 | connected(<=30m) |
| osm-building-1017326420 | 东区宿舍与服务区单体楼03 | node-link-0080 | waypoint | 20.00 | 27.49 | connected(<=30m) |
| osm-building-1017326421 | 东区宿舍与服务区单体楼04 | node-link-0081 | waypoint | 20.00 | 28.74 | connected(<=30m) |
| osm-named-1493791195 | 教学楼 | node-link-0082 | waypoint | 20.00 | 8.56 | connected(<=30m) |
| osm-building-1496902324 | 电子与信息工程学院单体楼01 | node-link-0083 | waypoint | 20.00 | 38.71 | connected(<=30m) |
| osm-building-1496902325 | 环境生物技术研究所单体楼01 | node-link-0084 | waypoint | 20.00 | 36.53 | connected(<=30m) |
| osm-building-1496902326 | 电子与信息工程学院单体楼02 | node-link-0085 | waypoint | 20.00 | 11.47 | connected(<=30m) |
| osm-building-1496902327 | 逸夫楼单体楼01 | node-link-0086 | waypoint | 20.00 | 42.32 | connected(<=30m) |
| osm-building-1496902328 | 东区宿舍与服务区单体楼05 | node-link-0002 | waypoint | 23.59 | 23.88 | connected(<=30m) |
| osm-building-1496902329 | 东区宿舍与服务区单体楼06 | node-link-0087 | waypoint | 20.00 | 18.76 | connected(<=30m) |
| osm-building-1496902330 | 东区宿舍与服务区单体楼07 | node-link-0088 | waypoint | 20.00 | 9.56 | connected(<=30m) |
| osm-building-1496902331 | 东区宿舍与服务区单体楼08 | node-link-0089 | waypoint | 20.00 | 33.72 | connected(<=30m) |
| osm-building-1496902332 | 东区宿舍与服务区单体楼09 | node-link-0090 | waypoint | 20.00 | 9.86 | connected(<=30m) |
| osm-building-1496902333 | 东区宿舍与服务区单体楼10 | node-link-0091 | waypoint | 20.00 | 7.72 | connected(<=30m) |
| osm-building-1496902334 | 东区宿舍与服务区单体楼11 | node-link-0092 | waypoint | 20.00 | 11.67 | connected(<=30m) |
| osm-building-1496902335 | 东区宿舍与服务区单体楼12 | node-link-0093 | waypoint | 20.00 | 30.22 | connected(<=30m) |
| osm-building-1496902336 | 东区宿舍与服务区单体楼13 | node-link-0094 | waypoint | 20.00 | 13.43 | connected(<=30m) |
| osm-building-1496902337 | 东区宿舍与服务区单体楼14 | node-link-0095 | waypoint | 20.00 | 52.68 | connected(<=30m) |
| building-66 | 三食堂 | node-link-0096 | waypoint | 20.00 | 48.76 | connected(<=30m) |
| building-67 | 新建筑 | node-link-0097 | waypoint | 20.00 | 24.41 | connected(<=30m) |
| building-68 | 公共艺术教育中心 | node-link-0098 | waypoint | 20.00 | 34.80 | connected(<=30m) |
| building-69 | 社会发展与公共管理学院 | node-link-0099 | waypoint | 20.00 | 32.29 | connected(<=30m) |
| building-70 | 南区六组团A幢 | node-link-0100 | waypoint | 20.00 | 26.11 | connected(<=30m) |
| building-71 | 南区六组团C幢 | node-link-0101 | waypoint | 20.00 | 25.19 | connected(<=30m) |
| building-72 | 南区六组团B幢 | node-link-0102 | waypoint | 20.00 | 23.65 | connected(<=30m) |
| building-73 | 南区六组团D幢 | node-link-0103 | waypoint | 20.00 | 25.12 | connected(<=30m) |
| building-74 | 南区7组团A幢 | node-link-0104 | waypoint | 20.00 | 22.98 | connected(<=30m) |
| building-75 | 南区7组团C幢 | node-link-0105 | waypoint | 20.00 | 22.99 | connected(<=30m) |
| building-76 | 南区7组团B幢 | node-link-0106 | waypoint | 20.00 | 21.94 | connected(<=30m) |
| building-77 | 南区7组团D幢 | node-link-0107 | waypoint | 20.00 | 27.30 | connected(<=30m) |

## 建议补的支路

> 以下均为审计建议，**未写入任何数据文件**。宽度/等级统一按步行支路 `walkway` 3.0m 估算，实际定线需结合地形与现状路权。

直连建议 0 条，其中穿过建筑 0 条（占 0.0%）

| 起点节点 id | 起点坐标 (x, z) | 终点建筑 id | 终点坐标 (x, z) | 覆盖分区 | 建议宽度 | 等级 | 状态 | crosses_buildings | 绕行拆法 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 数据质量问题

1. **`campus.json` 没有 `bounds` 字段**：实测 `campusJsonHasBounds=false`。`bounds` 只存在于 `packs/usts-tianping/pack.json` 的 `bounds.min/max`，`src/navigation/route.ts` 的 `validPosition` 使用 `data.bounds?.width` 可选链；若运行时只喂 `campus.json` 而未合并 pack 元数据，`limit` 计算为 0，越界坐标检查被跳过。本报告只读，不补字段。
2. **路段车辆通行全关**：`segments` 共 149 段，`access.vehicle=true` 的有 0 段（即全部为 false）；`class` 取值为 `main` / `secondary` / `walkway`，没有机动车等级。
3. **没有 entrance/door 类节点**：节点 `kind` 取值为 `junction` / `waypoint`，不存在 entrance/door/gate 类节点；导航终点只能落到 waypoint/junction，不能落到建筑入口。

## 算法与复核

- 最近节点：对每栋建筑遍历全部 39 个节点，取欧氏距离最小者；并列时保留先出现的节点。
- 分档：固定阈值 `<=30m` / `(30,100]m` / `>100m`，由 `verdictForDistance` 单点定义，CSV 与报告共用。
- 连通分量：把 segments 当无向边做 DFS，39 个节点全部落在同一个分量，无孤岛。
- 中位数：75 个距离排序后取第 38 个（1-based）；最大值为东区宿舍与服务区单体楼11 到 node-0017 的距离。
- 穿楼检查：每条建议支路按起点节点到终点建筑 position 的线段，与全部建筑 footprint 多边形相交检测（跨任一边或端点落在多边形内即穿过；footprint 为空跳过；终点建筑自身不计为穿过），不引依赖、不改阈值与数据。
