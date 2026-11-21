# M6-A 数据源适配层契约

## 目标

Web 端不再直接调用 `createDefaultCampusData()` 取数据，统一经 `CampusDataSource` 取；
本片只做接口 + 静态实现（`kind: 'static'`） + 契约用例 + 本文档，不做远程请求。
远程实现 + 降级留给 s6，接口签名本片定死，改动另开 issue。

## 接口

```ts
export interface CampusDataSource {
  readonly kind: 'static' | 'remote'
  load(): Promise<CampusPack>          // 一次性全量；失败 reject 带可读 message
  getMeta(): Promise<CampusPackMeta>   // 轻量元信息，先于 load 调用
}
```

`CampusPack` / `CampusPackMeta` 来自 `packages/campus-schema/src/index.ts`（campus-pack/2）。

## 四条契约

1. **getMeta 不依赖 load**：`getMeta()` 独立返回轻量元信息；未调用 `load()` 也能拿到完整 meta，且 `getMeta()` 不触发 `load()`。
2. **load 幂等**：同一数据源连续两次 `load()` 返回的 pack 深比较相等；返回值与内部状态隔离，调用方修改不会污染下一次调用。
3. **结果合法**：`load()` 返回的 pack 过 `validateCampusPack()` 必须 `ok === true`，否则 `load()` 以可读错误拒绝。
4. **失败 message 非空**：任何失败路径 `reject` 的 `Error.message` 都是非空字符串（含实际原因，不是空泛占位）。

## 静态实现

- `createStaticDataSource()` 返回 `kind: 'static'` 的数据源。
- 内部仍用现有 `createDefaultCampusData()` 造 pack，包成 campus-pack/2 结构；行为与今天直接调用它一致，不改 `campusData.ts` 的内容与导出。
- `getMeta()` 来自静态 `pack.json`，不读全量数据；`load()` 每次深拷贝返回，保证幂等。
- `src/main.ts` 的数据装配改为走 adapter 的 `load()` + `toCampusData()`（pack → 渲染数据）；其它装配/渲染/导航/UI 文件零改动，结果与直接调用 `createDefaultCampusData()` 等价。

## 用例映射

`src/data/adapter.test.ts`（7 例）覆盖：接口签名、`getMeta` 独立、`load` 幂等、`validateCampusPack` 合法、meta 一致性、装配等价性、失败 message 非空。

## 范围与回滚

白名单：`src/data/adapter.ts`、`src/data/adapter.test.ts`、`src/main.ts`（仅数据装配处）、本文档、`packages/campus-schema/src/index.ts`（仅追加可选导出）。
回滚：本片纯新增文件 + `main.ts` 一处装配改动，revert 单个 commit 即可回到现状，不影响 `campusData.ts`。

## M6-B 远程实现与降级

`createDataSource({ kind: 'remote', baseUrl, fallback: 'static' })` 创建远程数据源（工厂仍是同步的）。`kind` 恒为 `'remote'`。

- **拉取**：`GET baseUrl/campus-pack.json`；若 `baseUrl` 以 `.json`（可带 query）结尾则直接请求该 URL。只用内置 `fetch`，不新增运行时依赖。
- **校验**：响应 `ok` 为 true 且 `response.json()` 解析出的对象过 `validateCampusPack()`，结果才交给渲染层。
- **显式降级策略**：`fallback: 'static'` 必须显式写出，工厂才启用远程实现；缺省的 `{ kind: 'remote', baseUrl }` 仍同步抛错（保留 M6-A「不静默回退」的既有断言）。
- **降级触发**：校验失败、网络失败、非 2xx、超时（默认 `8000ms`，可用 `timeoutMs` 覆盖）任一情况，均降级到 `createStaticDataSource()` 的静态包，**不向调用方 reject**。
- **可读提示**：每次降级会调用一次 `console.warn`（可注入 `warn` 覆盖），消息含具体原因（HTTP 状态 / 校验 issue / 超时 / 网络错误）与 `baseUrl`；不会静默回退。`load()` 幂等，整个数据源生命周期内最多 warn 一次。
- **`getMeta()` 在远程模式下的语义**：**不触发网络请求**，直接返回静态 pack 的 meta（`createStaticDataSource().getMeta()`）。理由：远程失败时渲染用的是静态包，meta 必须与降级后的数据一致，避免首屏标题/边界与实际数据错配。若远程成功，`CampusPack` 自身的 meta 字段仍来自远端响应并通过校验；但 `getMeta()` 的返回值不保证等于远程 pack 的 meta（契约只要求 `getMeta()` 不依赖 `load()`）。
- **装配**：`src/main.ts` 仍用 `createDataSource({ kind: 'static' })`；远程模式由调用方显式配置，不改动默认首屏行为。

`src/data/remote-source.test.ts` 新增 3 例锁定三条路径：远程成功（校验通过 + `load()` 幂等 + `getMeta()` 不请求）、非法 pack（降级 + warn 非空）、网络失败 / 非 2xx / 超时（降级不抛）。
