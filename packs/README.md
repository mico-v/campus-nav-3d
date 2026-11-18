# packs/ — 多校数据包

一个子目录一个校园，目录名即包 `id`。整份数据是纯静态 JSON，不含代码，
fork 的人换目录就能换学校。

```text
packs/<campus-id>/
  pack.json      # 包的元数据：schema 版本、边界、坐标系、许可与署名
  campus.json    # L0 底图 + L1 建筑 + 路网（campus-pack/2，M1-S3 落地后迁入）
  indoor/        # L2 室内层（M2 起使用）
  assets/        # 模型、贴图与 registry.json 台账
```

约定：

- `pack.json` 与 `campus.json` 的顶层结构都由 `packages/campus-schema/schema/campus-pack-2.json` 描述，
  类型在 `packages/campus-schema/src/index.ts`。
- `id` 只用小写连字符 slug，与目录名一致；数据内所有 id 在全包内唯一。
- 校名与 logo 不进数据层（可选 `branding` 块），视觉由站点决定。
- 许可：数据 CC BY-SA 4.0；OSM 派生的必须带 `attribution`（ODbL 1.0）；模型单独标 `license`。
