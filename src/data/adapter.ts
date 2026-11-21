/**
 * M6-A：数据源适配层。
 *
 * 前端（含 main.ts）只通过这里取校园数据；本片只做静态实现，远程实现留给 s6。
 * 数据形状统一为 campus-pack/2 的 `CampusPack`（meta + 静态数据合并），
 * 由现有 `createDefaultCampusData()` 生成，行为与今天直接调用它一致。
 */
import packMetaJson from '../../packs/usts-tianping/pack.json'
import type { CampusPack, CampusPackMeta, RoadEdge } from '../../packages/campus-schema/src/index'
import { validateCampusPack } from '../../packages/campus-schema/src/index'
import { createDefaultCampusData } from './campusData'
import type { CanonicalCampusData, Building } from './campusData'

export interface CampusDataSource {
  readonly kind: 'static' | 'remote'
  /** 一次性全量；失败 reject 带可读 message。 */
  load(): Promise<CampusPack>
  /** 轻量元信息，先于 load 调用。 */
  getMeta(): Promise<CampusPackMeta>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 把现有默认数据包装成 campus-pack/2 结构；不改动 campusData.ts 的内容与导出。 */
function buildStaticPack(): CampusPack {
  const data: CanonicalCampusData = createDefaultCampusData()
  return {
    ...(packMetaJson as CampusPackMeta),
    zones: data.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      category: zone.category,
      polygon: zone.footprint ?? [],
      center: zone.center,
      size: zone.size,
      color: zone.color,
    })),
    buildings: data.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      category: building.category,
      footprint: building.footprint ?? [],
      height: building.height,
      position: building.position,
      size: building.size,
      color: building.color,
      zoneId: building.zoneId,
      // 保留渲染层需要的 legacy 可选字段；schema 校验只检查已知字段，忽略这些。
      ...(building.info !== undefined ? { info: building.info } : {}),
      ...(building.floors !== undefined ? { floors: building.floors } : {}),
      ...(building.facilities !== undefined ? { facilities: building.facilities } : {}),
      ...(building.entrance !== undefined ? { entrance: building.entrance } : {}),
    })),
    roads: data.roads.map((road) => ({
      id: road.id,
      name: road.name,
      points: road.points,
      width: road.width,
      kind: road.kind,
      sourceIds: road.sourceIds,
      ...(road.roadClass !== undefined ? { roadClass: road.roadClass } : {}),
      ...(road.surface !== undefined ? { surface: road.surface } : {}),
      ...(road.access !== undefined ? { access: road.access } : {}),
      ...(road.oneWay !== undefined ? { oneWay: road.oneWay } : {}),
      ...(road.speed !== undefined ? { speed: road.speed } : {}),
      ...(road.sidewalk !== undefined ? { sidewalk: road.sidewalk } : {}),
    })),
    waters: data.waters.map((water) => ({
      id: water.id,
      name: water.name,
      center: water.center,
      size: water.size,
      color: water.color,
      footprint: water.footprint,
    })),
    fields: data.fields.map((field) => ({
      id: field.id,
      name: field.name,
      footprint: field.footprint ?? [],
      center: field.center,
      size: field.size,
      color: field.color,
      stripeColor: field.stripeColor,
    })),
    trees: data.trees.map((at, index) => ({ id: `tree-${index}`, at })),
    roadNetwork: {
      nodes: data.roadNetwork!.nodes.map((node) => ({ id: node.id, at: node.position, kind: node.kind, sourceIds: node.sourceIds })),
      edges: data.roadNetwork!.segments as unknown as RoadEdge[],
    },
    pois: data.pois.map((poi) => ({
      id: poi.id,
      name: poi.name,
      at: [poi.position[0], poi.position[1]],
      elevation: poi.position[2],
      building: poi.sourceBuildingId,
      tags: poi.info ? [poi.info] : undefined,
      ...(poi.kind !== undefined ? { kind: poi.kind } : {}),
      ...(poi.color !== undefined ? { color: poi.color } : {}),
      ...(poi.info !== undefined ? { info: poi.info } : {}),
    })),
  }
}

/** 把 CampusPack 转到渲染/导航用的 CanonicalCampusData，供 main.ts 数据装配处使用。 */
export function toCampusData(pack: CampusPack): CanonicalCampusData {
  return {
    name: pack.name,
    bounds: {
      width: pack.bounds.max[0] - pack.bounds.min[0],
      depth: pack.bounds.max[1] - pack.bounds.min[1],
    },
    zones: (pack.zones ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      category: (z.category ?? 'service') as CanonicalCampusData['zones'][number]['category'],
      center: z.center ?? [0, 0],
      size: z.size ?? [0, 0],
      color: z.color ?? '#ffffff',
      footprint: z.polygon,
    })),
    buildings: (pack.buildings ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      category: (b.category ?? 'poi') as CanonicalCampusData['buildings'][number]['category'],
      position: b.position ?? [0, 0],
      size: b.size ?? [0, 0],
      height: b.height,
      color: b.color,
      zoneId: b.zoneId,
      footprint: b.footprint,
      info: (b as unknown as Building).info,
      floors: (b as unknown as Building).floors,
      facilities: (b as unknown as Building).facilities,
      entrance: (b as unknown as Building).entrance,
    })),
    roads: (pack.roads ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      points: r.points,
      width: r.width ?? 1,
      kind: r.kind as CanonicalCampusData['roads'][number]['kind'],
      sourceIds: r.sourceIds,
      roadClass: (r as unknown as CanonicalCampusData['roads'][number]).roadClass,
      surface: (r as unknown as CanonicalCampusData['roads'][number]).surface,
      access: (r as unknown as CanonicalCampusData['roads'][number]).access,
      oneWay: (r as unknown as CanonicalCampusData['roads'][number]).oneWay,
      speed: (r as unknown as CanonicalCampusData['roads'][number]).speed,
      sidewalk: (r as unknown as CanonicalCampusData['roads'][number]).sidewalk,
    })),
    waters: (pack.waters ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      center: w.center ?? [0, 0],
      size: w.size ?? [0, 0],
      color: w.color,
      footprint: w.footprint,
    })),
    fields: (pack.fields ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      center: f.center ?? [0, 0],
      size: f.size ?? [0, 0],
      color: f.color,
      stripeColor: f.stripeColor,
      footprint: f.footprint,
    })),
    trees: (pack.trees ?? []).map((t) => t.at),
    pois: (pack.pois ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      kind: ((p as unknown as CanonicalCampusData['pois'][number]).kind ?? 'landmark') as CanonicalCampusData['pois'][number]['kind'],
      position: [p.at[0], p.at[1], (p as unknown as { elevation?: number }).elevation ?? 0],
      color: (p as unknown as CanonicalCampusData['pois'][number]).color,
      sourceBuildingId: p.building ?? undefined,
      info: (p as unknown as CanonicalCampusData['pois'][number]).info ?? p.tags?.[0],
    })),
    roadNetwork: {
      nodes: (pack.roadNetwork?.nodes ?? []).map((n) => ({
        id: n.id,
        position: n.at,
        kind: n.kind as CanonicalCampusData['roadNetwork']['nodes'][number]['kind'],
        sourceIds: n.sourceIds,
      })),
      segments: (pack.roadNetwork?.edges ?? []) as unknown as CanonicalCampusData['roadNetwork']['segments'],
    },
  }
}

/** 仅供契约测试注入失败场景；不属于 CampusDataSource 公开接口。 */
export const __adapterTestHooks = {
  buildPack: buildStaticPack,
}

export function createStaticDataSource(): CampusDataSource {
  return {
    kind: 'static',

    async getMeta(): Promise<CampusPackMeta> {
      // meta 是静态常量，不触发 load()，也不读取全量数据。
      return clone(packMetaJson as CampusPackMeta)
    },

    async load(): Promise<CampusPack> {
      const pack = __adapterTestHooks.buildPack()
      const result = validateCampusPack(pack)
      if (!result.ok) {
        const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
        throw new Error(`静态数据源 pack 校验失败：${detail}`)
      }
      // 深拷贝隔离内部缓存，连续两次 load 深比较相等（幂等）。
      return clone(pack)
    },
  }
}

/** 数据源选择参数：静态包（默认）或远程端点。 */
export type DataSourceConfig =
  | { kind: 'static' }
  | { kind: 'remote'; baseUrl: string }

/**
 * 按 kind 选数据源。前端入口只调这个工厂，不直接 new 具体实现。
 * M6-A 阶段只有 'static' 可用；'remote' 在 s6 落地，此处先明确拒绝，
 * 保证「按 kind 切换」这条路存在且行为可验（不会静默回退成静态）。
 */
export function createDataSource(config: DataSourceConfig = { kind: 'static' }): CampusDataSource {
  if (config.kind === 'static') return createStaticDataSource()
  throw new Error(`远程数据源尚未实现（baseUrl=${config.baseUrl}），M6-B 交付`)
}
