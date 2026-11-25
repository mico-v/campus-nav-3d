# 外部参考考察：NJUPT-CS-StuDev/studev

- 仓库：https://github.com/NJUPT-CS-StuDev/studev
- 考察时间：2026-11-25（master/main 快照：`4b43b12`）
- 考察人：Kei（负责人）；结论用于室内建模方案（记录本 #j9cp）与 m1 数据扩容（issue #63）
- **可信度说明**：下文代码结论来自实际读到的文件正文；标「未读到」的是抓取失败或未展开，**不作为结论依据**。

## 1. 技术栈（已核）

| 层 | studev 用什么 | 出处 |
| --- | --- | --- |
| 地图渲染 | `maplibre-gl`（WebGL 矢量瓦片渲染） | `src/campus/map/scene.ts` 顶部 import |
| 瓦片分发 | `pmtiles` 协议（`new Protocol().addProtocol`），单体文件、按 range 请求 | 同上 |
| Worker | `maplibre-gl-worker.mjs?worker&url`（Vite 官方写法） | 同上 |
| 三维 | 同一场景里用 WebGL 画建筑体块（`modelLayer`），**不是 three.js** | `scene.ts` + `src/campus/map/models.ts` |
| 设计令牌 | 仓库内 `design/tokens.json`，代码里 import 直接取色 | `scene.ts` import |
| 三维数据 | 由建模项目 `njupt-map` **离线烘焙**成一个 buffer 给 GPU 直接画 | `models.ts` 首行注释 |

## 2. 室内建模方案（这是主人要的重点，已核）

核心结论：**它没有一套独立的「室内引擎」，而是把室内塞进同一份 3D 数据里，用「楼层」这个概念串起来。**

关键代码 `src/campus/map/scene.ts`：

```ts
interface ModelFloor {
  level: number;                          // 楼层号
  plate: Geometry;                        // 该层楼板轮廓
  cores: { kind: string; geometry: Geometry }[];   // 竖向交通：楼梯/电梯/扶梯
  rooms: { id: string; geometry: Geometry }[];      // 该层的房间
}
export interface CampusModel {
  buildings: { id: string; levels: number; height: number; geometry: Geometry }[];
  context: { height: number; geometry: Geometry }[];
  floors: Record<string, ModelFloor>;      // buildingId -> 该楼各层
}
```

四点值得抄：

1. **建筑体块用 `levels`（层数）+ `height`（总高）两个标量**，几何只存外轮廓。立面由渲染器按层数切，不用手工做每一层的墙。
2. **每层单独一个 `ModelFloor`**，只有楼板 + 房间多边形 + 竖向交通（`cores`），**没有墙、没有家具、没有材质**。室内就是「一层一片扁平面 + 房间面」。
3. **楼板 `plate` 是独立几何**，不是从建筑体块切出来的 —— 因为建筑体块是烘焙的、楼层数据是另一份，二者靠 `buildingId` 关联。
4. 注释原话：「A flat map is this scene seen from straight above; **there is no second mode**」。即：平面图和 3D 是**同一个场景换视角**，不是两套 UI。这条直接决定切楼层怎么切 —— 调相机俯仰，不是换页面。

`RoomTier`（`@/world/rooms`）用于给房间分等级上色，`RoomPaint` 里有 `tier | 'picked'`，说明房间是可点选的实体。`src/campus/world/rooms.ts` 的注释是「A room at a moment: free or not, and for how long」，即房间还挂了**占用状态**（自习室有没有空位），这部分超出本项目范围。

## 3. 名字检索（可直接借的一条）

`src/campus/map/model/find.ts` 是一个**与渲染完全解耦的纯函数检索器**，约 80 行：

- `plainName()` 做归一化：去空格括号连字符、转小写、**中文数字转阿拉伯**（「教三楼」→「教3」，「三食堂」→「3食堂」），再处理 `教3楼` → `教3`。
- `score()` 打分：精确 100 / 前缀 80−长度差 / 反向前缀 70−长度差 / 包含 60−长度差，再加「校区内 +5」「层级高 +4」。
- `placeMeant()` 歧义时**抛错并列出候选**（「“X”可能是：A、B，说具体一点」），不猜。
- 注释里明确写了「The same rules are android/.../map/Find.kt」—— 同一套打分规则在安卓端重写了一遍，说明这套口径是稳定的、值得照抄的。

**对我们的价值**：`plainName` + `score` 这套归一化和打分，正好解决 issue #63 里「一食堂 / 二食堂一楼 / 西区菜鸟驿站别名」的检索问题。我们的 `alias` 字段只要能挂上名字，检索层照这套打分就能命中，不用另发明规则。

## 4. 数据契约（已核，部分）

`scripts/data/space-contract.ts` 里有一个 `SPACE_FILES` 常量，列出空间数据文件（`entities.json`、`network.json`…）。刻意把「数据文件清单」抽成一个常量，校验脚本和加载代码共用，避免两边各写一份文件名。

我们已有 `docs/data-source-contract.md`，思路一致，**不需要改成他们的结构**，但可以借鉴「文件名清单收敛成一个常量」这一点。

## 5. 不适合直接搬的部分

- **maplibre-gl + pmtiles**：他们渲染的是**真实矢量瓦片**（有地理投影、有瓦片金字塔）。我们目前是 SVG/自绘 3D，换渲染器等于重写整个地图层，收益不抵成本。**只借鉴「同一个场景换视角」的思路，不换技术栈。**
- **离线烘焙管线**：需要单独的建模项目（`njupt-map`）和一套烘焙脚本，我们目前没有这个投入，也没这个必要（建筑数量级差一个量级）。
- **房间占用状态**：他们的使用场景里这是核心功能，我们不在本期范围。

## 6. 落到我们项目上的三条结论

1. **室内建模采用「楼层平面 + 房间面」的最小方案**：每栋楼加 `levels`、每层一个 `floor` 记录（楼板轮廓 + 房间多边形 + 竖向交通点），**不做墙体和室内家具**。这正好对应 issue #63 里「KFC/咖啡只建 POI 不建几何」，也给出了下一步的明确边界。
2. **平面图与 3D 不要做成两套模式**，用同一个场景换相机角度实现 —— 如果将来上 3D，这条能省掉一整套状态同步。
3. **名字检索照抄 `plainName` + 打分**：中文数字归一、精确/前缀/包含分级、歧义抛候选。这直接服务 #63 的 alias 验收，也顺手解决「一食堂能不能搜到二食堂」。

## 7. 未读到 / 待补
- `src/campus/map/models.ts` 全文（只读到首行注释，确认是「烘焙 buffer 给 GPU」）
- `design/tokens.json`（未展开）
- `scripts/data/` 下的校验脚本实现
- `src/campus/world/rooms.ts` 全文（只读到首行注释）

要深挖哪块，报个文件名，我去读原文补上，不靠猜。
