# M2 室内店面 room 层设计

## 这份文档管什么

给「食堂室内店面（KFC、咖啡、档口等）」定一个可施工的最小数据形状：在既有 `floors` 楼层模型上补一层 `rooms`，让楼层条能显示并点到店面。只做数据与入口，不做室内几何。

## 数据形状

`CampusFloor.rooms` 是**可选字段**，老 pack 不填照旧通过校验。

```ts
interface CampusRoom {
  id: string            // 包内唯一 slug；与 indoor POI 的 id 对齐
  name: string          // 显示名，如 KFC
  aliases?: string[]    // 检索别名，如 肯德基
  polygon?: Point[]     // 拿不准坐标就不填；不画轮廓，只在列表出现
  kind?: 'dining' | 'shop' | 'office' | 'service' | 'other'
  level?: number       // 可选跨层引用；样板数据不用填
}
```

`level: 0` 是一楼。二食堂一楼（alias「一食堂」）的样板数据给 KFC、面点档口、热炒档口；二楼给肯悦咖啡。房间 `id` 直接复用现有 indoor POI 的 `id`，不另造名字，也不删除原 POI。

## 校验口径

- 老 pack 无 `rooms` 回归通过。
- 同一层 `rooms.id` 重复报错，信息带建筑名和楼层。
- `rooms.level` 引用不存在的楼层报错（房间可选字段，用于跨层引用）。
- `polygon` 可以缺省；填了必须是至少 3 个有限坐标点。
- `kind` 只允许枚举值，未知就省略。

## UI 入口

`indoorRoomsOf` 从当前层派生房间列表，楼层条组件在下方渲染房间名按钮，并通过 `onSelectRoom(roomId)` 把点击交给调用方接既有选中逻辑（按房间 id 选中 POI）。没有 `rooms` 的建筑不显示列表，不传回调也不报错，行为与之前一致。

## 明确不做什么

- 不做墙、门、家具，不做 3D 室内几何，不改 `src/scene/`、`src/render/`。
- 室内不接 `planRoute`；本片不做室内导航。
- 不改默认数据，也不重排既有 POI。

## 后续室内导航要补什么

当前 `rooms` 只描述「一层有哪些店面」，没有房间之间的通行关系。要做室内导航，至少需要：

1. 房间图拓扑：把 `rooms` / 门位 / 走廊接成 `indoorNetwork` 节点与边；
2. 竖向连接：用 `connectors` 把同楼不同层的节点串起来；
3. 出入口锚点：房间到楼栋出入口的可达边，才能和室外路网拼成完整路线；
4. 几何精度：需要画轮廓或剖切时，再补 `polygon` 并做共坐标系几何自检。
