# USTS 天屏校区路网覆盖审计

生成时间：2026-11-22T05:01:03.593Z

> 只读审计：不改 `src/**`、`packs/**` 或任何阈值。`distance_m` 取建筑 `position` 到最近路网节点的直线距离，`footprint_min_distance_m` 取轮廓顶点到同一节点的最短直线距离（无轮廓时回退到 position）；单位沿用 pack 的 local-meters（1 单位 = 1m）。

## 汇总

- 建筑 75 / 路网节点 39 / 路段 42 / 无向连通分量 1（孤立节点 0）
- `distance_m <= 30m`：1 栋；`30m < distance_m <= 100m`：13 栋；`distance_m > 100m`：61 栋
- 最小 1.72m；中位数 228.19m；最大 607.05m（东区宿舍与服务区单体楼11，`osm-building-1496902334`）
- 与 issue 基线对照：建筑 75 / 节点 39 / 段 42 / 连通分量 1；≤30m 1 栋（二号门）、30~100m 13 栋、>100m 61 栋；最大 ~607m（东区宿舍与服务区单体楼11）；中位 ~228m。本次独立复算全部吻合，无偏差。

## 逐栋表格

| building_id | building_name | nearest_node_id | nearest_node_kind | distance_m | footprint_min_distance_m | verdict |
| --- | --- | --- | --- | ---: | ---: | --- |
| place-02 | 二号门 | node-0038 | waypoint | 1.72 | 11.71 | connected(<=30m) |
| place-03 | C4教学楼 | node-0026 | waypoint | 98.19 | 13.98 | weak(30-100m) |
| place-04 | 教学2楼 | node-0018 | junction | 247.41 | 181.01 | missing(>100m) |
| place-05 | 图书馆 | node-0012 | junction | 224.58 | 116.98 | missing(>100m) |
| place-07 | 院士楼 | node-0018 | junction | 313.22 | 260.46 | missing(>100m) |
| place-13 | 塔影阁 | node-0013 | waypoint | 78.03 | 65.00 | weak(30-100m) |
| place-14 | 二食堂 | node-0006 | junction | 59.93 | 43.16 | weak(30-100m) |
| place-32 | C5教学楼 | node-0019 | junction | 136.88 | 65.99 | missing(>100m) |
| place-33 | C6教学楼 | node-0019 | junction | 121.37 | 34.80 | missing(>100m) |
| place-40 | 音乐厅 | node-0018 | junction | 130.75 | 71.86 | missing(>100m) |
| place-42 | 教学4楼 | node-0018 | junction | 405.08 | 363.29 | missing(>100m) |
| place-43 | 教学5楼 | node-0018 | junction | 451.62 | 402.11 | missing(>100m) |
| place-44 | 教学3楼 | node-0018 | junction | 405.56 | 354.61 | missing(>100m) |
| place-45 | 教学6楼 | node-0013 | waypoint | 442.96 | 368.80 | missing(>100m) |
| place-46 | 教学7楼 | node-0013 | waypoint | 344.52 | 291.52 | missing(>100m) |
| osm-named-356627225 | C1教学楼 | node-0020 | junction | 164.59 | 127.64 | missing(>100m) |
| osm-named-356627222 | C2教学楼 | node-0020 | junction | 221.69 | 200.99 | missing(>100m) |
| osm-named-920093708 | C3教学楼 | node-0020 | junction | 298.49 | 278.90 | missing(>100m) |
| osm-named-920093733 | 8号教学楼 | node-0013 | waypoint | 320.97 | 264.96 | missing(>100m) |
| osm-named-356627226 | 职工之家 | node-0020 | junction | 127.73 | 70.32 | missing(>100m) |
| osm-named-920093694 | 2号楼 | node-0020 | junction | 320.57 | 302.88 | missing(>100m) |
| osm-named-920093693 | 3号楼 | node-0020 | junction | 277.42 | 257.67 | missing(>100m) |
| osm-named-356627231 | 5号楼 | node-0020 | junction | 226.68 | 166.21 | missing(>100m) |
| osm-building-356387818 | 西区宿舍2组团单体楼04 | node-0005 | junction | 134.52 | 105.69 | missing(>100m) |
| osm-building-356627207 | 体育馆2单体楼01 | node-0018 | junction | 286.06 | 159.54 | missing(>100m) |
| osm-building-356627227 | 新政楼 | node-0020 | junction | 297.26 | 226.52 | missing(>100m) |
| osm-building-920093710 | 西区快递点单体楼01 | node-0006 | junction | 266.24 | 222.49 | missing(>100m) |
| osm-building-920093711 | 西区宿舍1组团单体楼01 | node-0005 | junction | 261.18 | 216.04 | missing(>100m) |
| osm-building-920093712 | 西区宿舍1组团单体楼02 | node-0028 | waypoint | 236.02 | 228.99 | missing(>100m) |
| osm-building-920093713 | 西区宿舍1组团单体楼03 | node-0028 | waypoint | 180.17 | 171.33 | missing(>100m) |
| osm-building-920093714 | 西区宿舍2组团单体楼01 | node-0005 | junction | 98.73 | 63.62 | weak(30-100m) |
| osm-building-920093715 | 西区宿舍2组团单体楼02 | node-0005 | junction | 74.81 | 29.79 | weak(30-100m) |
| osm-building-920093716 | 西区宿舍2组团单体楼03 | node-0005 | junction | 67.16 | 28.36 | weak(30-100m) |
| osm-building-920093717 | 西区宿舍3组团单体楼01 | node-0005 | junction | 60.86 | 12.33 | weak(30-100m) |
| osm-building-920093718 | 西区宿舍3组团单体楼02 | node-0005 | junction | 111.22 | 66.71 | missing(>100m) |
| osm-building-920093721 | 员工宿舍单体楼01 | node-0008 | junction | 114.11 | 47.05 | missing(>100m) |
| osm-building-920093722 | 西区宿舍5组团单体楼01 | node-0009 | junction | 87.47 | 34.73 | weak(30-100m) |
| osm-building-920093723 | 西区宿舍5组团单体楼02 | node-0009 | junction | 127.97 | 86.95 | missing(>100m) |
| osm-building-920093724 | 西区宿舍5组团单体楼03 | node-0010 | waypoint | 117.95 | 73.10 | missing(>100m) |
| osm-building-920093725 | 西区宿舍5组团单体楼04 | node-0010 | waypoint | 78.72 | 23.19 | weak(30-100m) |
| osm-building-920093726 | 西区宿舍4组团单体楼01 | node-0009 | junction | 79.45 | 32.73 | weak(30-100m) |
| osm-building-920093727 | 西区宿舍4组团单体楼02 | node-0009 | junction | 126.67 | 88.29 | missing(>100m) |
| osm-building-920093728 | 西区宿舍4组团单体楼03 | node-0010 | waypoint | 113.89 | 68.05 | missing(>100m) |
| osm-building-920093729 | 西区宿舍4组团单体楼04 | node-0010 | waypoint | 58.52 | 20.15 | weak(30-100m) |
| osm-building-1017326418 | 东区宿舍与服务区单体楼01 | node-0017 | waypoint | 305.54 | 260.48 | missing(>100m) |
| osm-building-1017326419 | 东区宿舍与服务区单体楼02 | node-0017 | waypoint | 320.44 | 276.00 | missing(>100m) |
| osm-building-1017326420 | 东区宿舍与服务区单体楼03 | node-0017 | waypoint | 324.28 | 282.31 | missing(>100m) |
| osm-building-1017326421 | 东区宿舍与服务区单体楼04 | node-0021 | waypoint | 351.27 | 305.91 | missing(>100m) |
| osm-named-1493791195 | 教学楼 | node-0036 | junction | 128.65 | 54.40 | missing(>100m) |
| osm-building-1496902324 | 电子与信息工程学院单体楼01 | node-0030 | junction | 75.89 | 30.87 | weak(30-100m) |
| osm-building-1496902325 | 环境生物技术研究所单体楼01 | node-0029 | junction | 72.69 | 19.04 | weak(30-100m) |
| osm-building-1496902326 | 电子与信息工程学院单体楼02 | node-0039 | waypoint | 107.46 | 33.03 | missing(>100m) |
| osm-building-1496902327 | 逸夫楼单体楼01 | node-0034 | waypoint | 129.29 | 26.82 | missing(>100m) |
| osm-building-1496902328 | 东区宿舍与服务区单体楼05 | node-0017 | waypoint | 508.86 | 475.22 | missing(>100m) |
| osm-building-1496902329 | 东区宿舍与服务区单体楼06 | node-0017 | waypoint | 496.62 | 459.33 | missing(>100m) |
| osm-building-1496902330 | 东区宿舍与服务区单体楼07 | node-0017 | waypoint | 472.21 | 444.85 | missing(>100m) |
| osm-building-1496902331 | 东区宿舍与服务区单体楼08 | node-0017 | waypoint | 473.98 | 422.25 | missing(>100m) |
| osm-building-1496902332 | 东区宿舍与服务区单体楼09 | node-0017 | waypoint | 553.17 | 527.28 | missing(>100m) |
| osm-building-1496902333 | 东区宿舍与服务区单体楼10 | node-0017 | waypoint | 583.22 | 556.67 | missing(>100m) |
| osm-building-1496902334 | 东区宿舍与服务区单体楼11 | node-0017 | waypoint | 607.05 | 579.45 | missing(>100m) |
| osm-building-1496902335 | 东区宿舍与服务区单体楼12 | node-0017 | waypoint | 141.88 | 60.86 | missing(>100m) |
| osm-building-1496902336 | 东区宿舍与服务区单体楼13 | node-0017 | waypoint | 192.03 | 89.19 | missing(>100m) |
| osm-building-1496902337 | 东区宿舍与服务区单体楼14 | node-0017 | waypoint | 382.83 | 304.97 | missing(>100m) |
| building-66 | 三食堂 | node-0020 | junction | 223.20 | 162.89 | missing(>100m) |
| building-67 | 新建筑 | node-0011 | waypoint | 228.19 | 190.73 | missing(>100m) |
| building-68 | 公共艺术教育中心 | node-0018 | junction | 289.59 | 260.87 | missing(>100m) |
| building-69 | 社会发展与公共管理学院 | node-0018 | junction | 220.51 | 160.60 | missing(>100m) |
| building-70 | 南区六组团A幢 | node-0018 | junction | 370.29 | 326.07 | missing(>100m) |
| building-71 | 南区六组团C幢 | node-0018 | junction | 492.11 | 449.46 | missing(>100m) |
| building-72 | 南区六组团B幢 | node-0018 | junction | 388.76 | 346.73 | missing(>100m) |
| building-73 | 南区六组团D幢 | node-0018 | junction | 504.21 | 460.32 | missing(>100m) |
| building-74 | 南区7组团A幢 | node-0023 | waypoint | 386.36 | 344.79 | missing(>100m) |
| building-75 | 南区7组团C幢 | node-0023 | waypoint | 503.67 | 462.55 | missing(>100m) |
| building-76 | 南区7组团B幢 | node-0023 | waypoint | 375.00 | 335.24 | missing(>100m) |
| building-77 | 南区7组团D幢 | node-0023 | waypoint | 496.92 | 450.19 | missing(>100m) |

## 建议补的支路

> 以下均为审计建议，**未写入任何数据文件**。宽度/等级统一按步行支路 `walkway` 3.0m 估算，实际定线需结合地形与现状路权。

直连建议 25 条，其中穿过建筑 9 条（占 36.0%）

| 起点节点 id | 起点坐标 (x, z) | 终点建筑 id | 终点坐标 (x, z) | 覆盖分区 | 建议宽度 | 等级 | 状态 | crosses_buildings | 绕行拆法 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `node-0017` | 1700.6, -82.2 | `osm-building-1496902334` | 2275.8, -276.3 | east-campus | 3.0m | walkway | needs_detour | osm-building-1017326419, osm-building-1496902329, osm-building-1496902335 | 被 东区宿舍与服务区单体楼02（osm-building-1017326419）挡住：拆两段 node-0017→东区宿舍与服务区单体楼02外侧临路点→osm-building-1496902334（楼A=东区宿舍与服务区单体楼02，楼B=osm-building-1496902334）；被 东区宿舍与服务区单体楼06（osm-building-1496902329）挡住：拆两段 node-0017→东区宿舍与服务区单体楼06外侧临路点→osm-building-1496902334（楼A=东区宿舍与服务区单体楼06，楼B=osm-building-1496902334）；被 东区宿舍与服务区单体楼12（osm-building-1496902335）挡住：拆两段 node-0017→东区宿舍与服务区单体楼12外侧临路点→osm-building-1496902334（楼A=东区宿舍与服务区单体楼12，楼B=osm-building-1496902334） | 锚点：最大偏离 东区宿舍与服务区单体楼11 607m；先补可达性，后续再按簇补完整支路网。 |
| `node-0017` | 1700.6, -82.2 | `osm-building-1496902332` | 2247.6, -164.7 | east-campus | 3.0m | walkway | needs_detour | osm-building-1017326418, osm-building-1496902331, osm-building-1496902335 | 被 东区宿舍与服务区单体楼01（osm-building-1017326418）挡住：拆两段 node-0017→东区宿舍与服务区单体楼01外侧临路点→osm-building-1496902332（楼A=东区宿舍与服务区单体楼01，楼B=osm-building-1496902332）；被 东区宿舍与服务区单体楼08（osm-building-1496902331）挡住：拆两段 node-0017→东区宿舍与服务区单体楼08外侧临路点→osm-building-1496902332（楼A=东区宿舍与服务区单体楼08，楼B=osm-building-1496902332）；被 东区宿舍与服务区单体楼12（osm-building-1496902335）挡住：拆两段 node-0017→东区宿舍与服务区单体楼12外侧临路点→osm-building-1496902332（楼A=东区宿舍与服务区单体楼12，楼B=osm-building-1496902332） | east-campus 有 13 栋建筑距路网 >100m（最远 东区宿舍与服务区单体楼11 607m，涉及 service）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0018` | 470.0, 797.8 | `building-72` | 839.8, 917.7 | osm-campus-boundary | 3.0m | walkway | direct | - | - | osm-campus-boundary 有 6 栋建筑距路网 >100m（最远 南区六组团D幢 504m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0023` | 470.0, 1090.0 | `building-74` | 840.0, 978.7 | osm-campus-boundary | 3.0m | walkway | direct | - | - | osm-campus-boundary 有 4 栋建筑距路网 >100m（最远 南区7组团C幢 504m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0018` | 470.0, 797.8 | `place-07` | 701.6, 586.9 | central-core | 3.0m | walkway | needs_detour | place-40 | 被 音乐厅（place-40）挡住：拆两段 node-0018→音乐厅外侧临路点→place-07（楼A=音乐厅，楼B=place-07） | central-core 有 2 栋建筑距路网 >100m（最远 教学5楼 452m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0013` | 1325.1, 422.7 | `place-46` | 1022.2, 587.0 | south-campus | 3.0m | walkway | direct | - | - | south-campus 有 2 栋建筑距路网 >100m（最远 教学6楼 443m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0018` | 470.0, 797.8 | `place-04` | 714.7, 761.3 | south-campus | 3.0m | walkway | direct | - | - | south-campus 有 4 栋建筑距路网 >100m（最远 教学3楼 406m，涉及 academic、service）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0021` | 1690.0, -100.0 | `osm-building-1017326421` | 1985.8, -289.5 | east-campus | 3.0m | walkway | needs_detour | osm-building-1496902335 | 被 东区宿舍与服务区单体楼12（osm-building-1496902335）挡住：改接 东区宿舍与服务区单体楼12 另一节点 node-0017，再从该侧不穿楼接 osm-building-1017326421 | east-campus 有 1 栋建筑距路网 >100m（最远 东区宿舍与服务区单体楼04 351m，涉及 service）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0013` | 1325.1, 422.7 | `osm-named-920093733` | 1015.9, 509.0 | central-core | 3.0m | walkway | direct | - | - | central-core 有 1 栋建筑距路网 >100m（最远 8号教学楼 321m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0020` | 470.0, 88.4 | `osm-named-920093693` | 555.2, 352.5 | central-core | 3.0m | walkway | direct | - | - | central-core 有 5 栋建筑距路网 >100m（最远 2号楼 321m，涉及 academic、service）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0020` | 470.0, 88.4 | `osm-named-356627225` | 364.1, 214.4 | west-academic | 3.0m | walkway | direct | - | - | west-academic 有 3 栋建筑距路网 >100m（最远 C3教学楼 298m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0018` | 470.0, 797.8 | `osm-building-356627207` | 208.5, 913.9 | sports-belt | 3.0m | walkway | direct | - | - | sports-belt 有 1 栋建筑距路网 >100m（最远 体育馆2单体楼01 286m，涉及 sports）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0006` | -290.2, 797.1 | `osm-building-920093710` | -51.8, 678.5 | west-campus | 3.0m | walkway | needs_detour | place-14 | 被 二食堂（place-14）挡住：拆两段 node-0006→二食堂外侧临路点→osm-building-920093710（楼A=二食堂，楼B=osm-building-920093710） | west-campus 有 1 栋建筑距路网 >100m（最远 西区快递点单体楼01 266m，涉及 service）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0005` | -290.5, 536.1 | `osm-building-920093718` | -373.8, 609.7 | west-campus | 3.0m | walkway | needs_detour | osm-building-920093715 | 被 西区宿舍2组团单体楼02（osm-building-920093715）挡住：拆两段 node-0005→西区宿舍2组团单体楼02外侧临路点→osm-building-920093718（楼A=西区宿舍2组团单体楼02，楼B=osm-building-920093718） | west-campus 有 3 栋建筑距路网 >100m（最远 西区宿舍1组团单体楼01 261m，涉及 dorm）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0028` | -50.0, 340.0 | `osm-building-920093713` | -47.9, 520.2 | west-campus | 3.0m | walkway | direct | - | - | west-campus 有 2 栋建筑距路网 >100m（最远 西区宿舍1组团单体楼02 236m，涉及 dorm）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0011` | 970.0, -100.0 | `building-67` | 811.5, 64.1 | osm-campus-boundary | 3.0m | walkway | direct | - | - | osm-campus-boundary 有 1 栋建筑距路网 >100m（最远 新建筑 228m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0012` | 1088.7, 74.7 | `place-05` | 1108.5, 298.5 | central-core | 3.0m | walkway | direct | - | - | central-core 有 1 栋建筑距路网 >100m（最远 图书馆 225m，涉及 library）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0020` | 470.0, 88.4 | `building-66` | 608.4, 263.6 | osm-campus-boundary | 3.0m | walkway | needs_detour | osm-named-356627226 | 被 职工之家（osm-named-356627226）挡住：拆两段 node-0020→职工之家外侧临路点→building-66（楼A=职工之家，楼B=building-66） | osm-campus-boundary 有 1 栋建筑距路网 >100m（最远 三食堂 223m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0019` | 46.0, 353.8 | `place-33` | 164.5, 379.9 | west-academic | 3.0m | walkway | direct | - | - | west-academic 有 2 栋建筑距路网 >100m（最远 C5教学楼 137m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0034` | 112.0, -139.3 | `osm-building-1496902327` | 190.5, -36.6 | west-academic | 3.0m | walkway | direct | - | - | west-academic 有 1 栋建筑距路网 >100m（最远 逸夫楼单体楼01 129m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0036` | -244.2, 168.2 | `osm-named-1493791195` | -153.2, 259.1 | west-academic | 3.0m | walkway | direct | - | - | west-academic 有 1 栋建筑距路网 >100m（最远 教学楼 129m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0009` | -450.0, 798.8 | `osm-building-920093727` | -521.9, 903.1 | west-campus | 3.0m | walkway | needs_detour | osm-building-920093726 | 被 西区宿舍4组团单体楼01（osm-building-920093726）挡住：拆两段 node-0009→西区宿舍4组团单体楼01外侧临路点→osm-building-920093727（楼A=西区宿舍4组团单体楼01，楼B=osm-building-920093727） | west-campus 有 2 栋建筑距路网 >100m（最远 西区宿舍5组团单体楼02 128m，涉及 dorm）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0010` | -450.0, 1040.0 | `osm-building-920093728` | -524.7, 954.0 | west-campus | 3.0m | walkway | needs_detour | osm-building-920093729 | 被 西区宿舍4组团单体楼04（osm-building-920093729）挡住：拆两段 node-0010→西区宿舍4组团单体楼04外侧临路点→osm-building-920093728（楼A=西区宿舍4组团单体楼04，楼B=osm-building-920093728） | west-campus 有 2 栋建筑距路网 >100m（最远 西区宿舍5组团单体楼03 118m，涉及 dorm）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0008` | -497.0, 676.7 | `osm-building-920093721` | -383.9, 661.6 | west-campus | 3.0m | walkway | direct | - | - | west-campus 有 1 栋建筑距路网 >100m（最远 员工宿舍单体楼01 114m，涉及 dorm）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |
| `node-0039` | 73.0, 32.9 | `osm-building-1496902326` | -17.3, -25.4 | west-academic | 3.0m | walkway | direct | - | - | west-academic 有 1 栋建筑距路网 >100m（最远 电子与信息工程学院单体楼02 107m，涉及 academic）；建议从该最近节点接一条 3m 步行支路，作为通达/寻路端点，不替代主路。 |

## 数据质量问题

1. **`campus.json` 没有 `bounds` 字段**：实测 `campusJsonHasBounds=false`。`bounds` 只存在于 `packs/usts-tianping/pack.json` 的 `bounds.min/max`，`src/navigation/route.ts` 的 `validPosition` 使用 `data.bounds?.width` 可选链；若运行时只喂 `campus.json` 而未合并 pack 元数据，`limit` 计算为 0，越界坐标检查被跳过。本报告只读，不补字段。
2. **路段车辆通行全关**：`segments` 共 42 段，`access.vehicle=true` 的有 0 段（即全部为 false）；`class` 取值为 `main` / `secondary` / `walkway`，没有机动车等级。
3. **没有 entrance/door 类节点**：节点 `kind` 取值为 `junction` / `waypoint`，不存在 entrance/door/gate 类节点；导航终点只能落到 waypoint/junction，不能落到建筑入口。

## 算法与复核

- 最近节点：对每栋建筑遍历全部 39 个节点，取欧氏距离最小者；并列时保留先出现的节点。
- 分档：固定阈值 `<=30m` / `(30,100]m` / `>100m`，由 `verdictForDistance` 单点定义，CSV 与报告共用。
- 连通分量：把 segments 当无向边做 DFS，39 个节点全部落在同一个分量，无孤岛。
- 中位数：75 个距离排序后取第 38 个（1-based）；最大值为东区宿舍与服务区单体楼11 到 node-0017 的距离。
- 穿楼检查：每条建议支路按起点节点到终点建筑 position 的线段，与全部建筑 footprint 多边形相交检测（跨任一边或端点落在多边形内即穿过；footprint 为空跳过；终点建筑自身不计为穿过），不引依赖、不改阈值与数据。
