/**
 * campus-pack-store —— 自托管部署用的 pack 存储层。
 *
 * 背景：dev 时的写接口是 `vite-plugin-campus-api.ts` 里的 Vite 插件，数据在**进程内存**里，
 * dev 一重启就丢，生产构建里根本没有 server。这里把它抽成一份与运行环境无关的实现：
 *  - `FilePackStore`：落盘到 `<dataDir>/<packId>/`（pack.json + campus.json），写用 .tmp + rename 原子替换；
 *  - `MemoryPackStore`：测试与 dev 加速用，接口与前者完全一致。
 *
 * 硬约束：零新依赖（node:fs/promises + node:path），dev 与部署共用同一份代码，不再两份逻辑。
 *
 * 坐标口径（和 tools/campus-store.ts 的 loadPackCampusData / savePackCampusData 完全一致，
 * 否则存出去的 pack 页面读不回来）：
 *  - pack.json 存 `name` + `bounds { min:[x,z], max:[x,z] }`；
 *  - campus.json 存几何，坐标是 **pack 局部坐标**（去掉 bounds.min 的偏移），
 *    编辑器用的是世界坐标 → 读时 `+ min`，写时 `- min`；
 *  - trees 在 pack 里是 `{ id, at }` 对象，编辑器里是 `[x, z]` 点。
 */
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CampusData } from '../../../src/data/campusData.ts'
import { assertValidCampusData } from '../../../src/data/campusValidation.ts'
import { normalizeCampusData } from '../../../src/data/roadNormalization.ts'
import { validateRooms } from '../../../src/editor/roomOps.ts'

export interface PackSummary {
  id: string
  name: string
  updatedAt: string | null
}

export interface PackStore {
  /** 列出所有 pack（只读） */
  list(): Promise<PackSummary[]>
  /** 读 pack 元信息（pack.json，原样） */
  readMeta(id: string): Promise<Record<string, unknown>>
  /** 读合并后的几何数据（世界坐标，编辑器直接用） */
  readCampus(id: string): Promise<CampusData>
  /** 整体写入几何数据（世界坐标），返回落盘后的数据 */
  writeCampus(id: string, data: unknown, now?: string): Promise<CampusData>
  /** 写入元信息（pack.json） */
  writeMeta(id: string, meta: Record<string, unknown>): Promise<void>
}

export class PackNotFoundError extends Error {
  constructor(id: string) {
    super(`pack 不存在：${id}`)
    this.name = 'PackNotFoundError'
  }
}

export class PackValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackValidationError'
  }
}

/** pack id 白名单，与 vite 插件里的口径一致：只允许小写字母、数字、连字符 */
export const PACK_ID_PATTERN = /^[a-z0-9-]+$/

export function assertPackId(id: string): void {
  if (!PACK_ID_PATTERN.test(id)) {
    throw new PackValidationError(`非法 pack id：${id}`)
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPointPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

/** pack.json 里的元信息字段 */
const META_KEYS = ['name', 'crs', 'origin', 'bounds', 'units', 'license', 'attribution'] as const
/** campus.json 里的几何字段 */
const GEOMETRY_KEYS = ['zones', 'buildings', 'roadNetwork', 'roads', 'pois', 'trees', 'waters', 'fields'] as const

function pickKeys(source: UnknownRecord, keys: readonly string[]): UnknownRecord {
  const picked: UnknownRecord = {}
  for (const key of keys) {
    if (key in source) picked[key] = source[key]
  }
  return picked
}

/** pack bounds（世界坐标）→ 编辑器需要的 width / depth，同时给出偏移 */
function boundsToSize(bounds: unknown): { width: number; depth: number } {
  if (
    !isRecord(bounds) ||
    !Array.isArray(bounds.min) ||
    !Array.isArray(bounds.max) ||
    bounds.min.length !== 2 ||
    bounds.max.length !== 2
  ) {
    throw new PackValidationError('pack.json bounds 必须是 { min: [x,z], max: [x,z] }')
  }
  const width = Number(bounds.max[0]) - Number(bounds.min[0])
  const depth = Number(bounds.max[1]) - Number(bounds.min[1])
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
    throw new PackValidationError('pack.json bounds 无法得到有效 width/depth')
  }
  return { width, depth }
}

function boundsOrigin(bounds: unknown): [number, number] {
  boundsToSize(bounds)
  const min = (bounds as { min: [number, number] }).min
  return [Number(min[0]), Number(min[1])]
}

/** pack 的 trees（`{id, at}` 或裸点）→ 编辑器点 */
function packTreesToPoints(trees: unknown): [number, number][] {
  if (!Array.isArray(trees)) throw new PackValidationError('campus.json trees 必须是数组')
  return trees.map((tree, index) => {
    if (isPointPair(tree)) return [tree[0], tree[1]]
    if (isRecord(tree) && isPointPair(tree.at)) return [tree.at[0], tree.at[1]]
    throw new PackValidationError(`campus.json trees[${index}] 缺少可用坐标`)
  })
}

/** 编辑器点 → pack 的 trees，坐标没动的保留原对象（id / radius / color 不丢） */
function pointsToPackTrees(points: unknown, previous: unknown): unknown[] {
  const previousTrees = Array.isArray(previous) ? previous : []
  const next = packTreesToPoints(points)
  const unchanged =
    previousTrees.length === next.length &&
    previousTrees.every((tree, index) => {
      const at = isRecord(tree) ? tree.at : tree
      return isPointPair(at) && at[0] === next[index][0] && at[1] === next[index][1]
    })
  if (unchanged) return previousTrees

  const spare = new Map<string, UnknownRecord[]>()
  let maxIndex = 0
  for (const tree of previousTrees) {
    if (!isRecord(tree)) continue
    const match = /^tree-(\d+)$/.exec(String(tree.id ?? ''))
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]))
    if (!isPointPair(tree.at)) continue
    const key = `${tree.at[0]},${tree.at[1]}`
    const bucket = spare.get(key) ?? []
    bucket.push(tree)
    spare.set(key, bucket)
  }

  return next.map(([x, z]) => {
    const kept = spare.get(`${x},${z}`)?.shift()
    if (kept) return kept
    maxIndex += 1
    return { id: `tree-${maxIndex}`, at: [x, z] }
  })
}

/** pack 的 zone 用 polygon，编辑器用 footprint */
function packZonesToEditorZones(zones: unknown): unknown {
  if (!Array.isArray(zones)) return zones
  return zones.map((zone) => {
    if (!isRecord(zone)) return zone
    const { polygon, ...rest } = zone
    return { ...rest, footprint: Array.isArray(zone.footprint) ? zone.footprint : polygon }
  })
}

/** 编辑器 zone 的 footprint → pack 的 polygon */
function editorZonesToPackZones(zones: unknown): unknown {
  if (!Array.isArray(zones)) return zones
  return zones.map((zone) => {
    if (!isRecord(zone)) return zone
    const { footprint, ...rest } = zone
    return { ...rest, polygon: Array.isArray(zone.polygon) ? zone.polygon : footprint }
  })
}

/** 平移一组点（世界 ↔ pack 局部） */
function shiftPoint(point: unknown, dx: number, dz: number): unknown {
  if (!isPointPair(point)) return point
  return [point[0] + dx, point[1] + dz]
}

function shiftRing(ring: unknown, dx: number, dz: number): unknown {
  if (!Array.isArray(ring)) return ring
  return ring.map((point) => shiftPoint(point, dx, dz))
}

/**
 * 几何里的坐标平移。
 * `zones` 用 footprint / polygon，`buildings` 用 footprint，`pois` 用 at，`trees` 用 at 或裸点，
 * `roads` 用 points，`roadNetwork` 用 nodes[].at 与 edges 的端点引用（端点引用是下标，不用动）。
 */
function shiftGeometry(geometry: UnknownRecord, dx: number, dz: number): UnknownRecord {
  const next: UnknownRecord = { ...geometry }

  if (Array.isArray(next.zones)) {
    next.zones = next.zones.map((zone) => {
      if (!isRecord(zone)) return zone
      const copy: UnknownRecord = { ...zone }
      if (Array.isArray(zone.footprint)) copy.footprint = shiftRing(zone.footprint, dx, dz)
      if (Array.isArray(zone.polygon)) copy.polygon = shiftRing(zone.polygon, dx, dz)
      return copy
    })
  }

  if (Array.isArray(next.buildings)) {
    next.buildings = next.buildings.map((building) => {
      if (!isRecord(building)) return building
      const copy: UnknownRecord = { ...building }
      if (Array.isArray(building.footprint)) copy.footprint = shiftRing(building.footprint, dx, dz)
      if (Array.isArray(building.polygon)) copy.polygon = shiftRing(building.polygon, dx, dz)
      if (isPointPair(building.at)) copy.at = shiftPoint(building.at, dx, dz)
      if (isRecord(building.interior)) {
        const interior: UnknownRecord = { ...building.interior }
        if (Array.isArray(interior.floors)) {
          interior.floors = interior.floors.map((floor) => {
            if (!isRecord(floor)) return floor
            const floorCopy: UnknownRecord = { ...floor }
            if (Array.isArray(floor.rooms)) {
              floorCopy.rooms = floor.rooms.map((room) => {
                if (!isRecord(room)) return room
                const roomCopy: UnknownRecord = { ...room }
                if (Array.isArray(room.polygon)) roomCopy.polygon = shiftRing(room.polygon, dx, dz)
                return roomCopy
              })
            }
            if (Array.isArray(floor.outline)) floorCopy.outline = shiftRing(floor.outline, dx, dz)
            return floorCopy
          })
        }
        if (Array.isArray(interior.entrances)) {
          interior.entrances = interior.entrances.map((entrance) => {
            if (!isRecord(entrance)) return entrance
            const copy: UnknownRecord = { ...entrance }
            if (isPointPair(entrance.at)) copy.at = shiftPoint(entrance.at, dx, dz)
            return copy
          })
        }
        copy.interior = interior
      }
      return copy
    })
  }

  if (Array.isArray(next.pois)) {
    next.pois = next.pois.map((poi) => {
      if (!isRecord(poi)) return poi
      const copy: UnknownRecord = { ...poi }
      if (isPointPair(poi.at)) copy.at = shiftPoint(poi.at, dx, dz)
      return copy
    })
  }

  if (Array.isArray(next.trees)) {
    next.trees = next.trees.map((tree) => {
      if (isPointPair(tree)) return shiftPoint(tree, dx, dz)
      if (isRecord(tree) && isPointPair(tree.at)) return { ...tree, at: shiftPoint(tree.at, dx, dz) }
      return tree
    })
  }

  if (Array.isArray(next.roads)) {
    next.roads = next.roads.map((road) => {
      if (!isRecord(road)) return road
      const copy: UnknownRecord = { ...road }
      if (Array.isArray(road.points)) copy.points = shiftRing(road.points, dx, dz)
      if (Array.isArray(road.path)) copy.path = shiftRing(road.path, dx, dz)
      return copy
    })
  }

  for (const key of ['waters', 'fields'] as const) {
    const collection = next[key]
    if (!Array.isArray(collection)) continue
    next[key] = collection.map((item) => {
      if (!isRecord(item)) return item
      const copy: UnknownRecord = { ...item }
      if (isPointPair(item.center)) copy.center = shiftPoint(item.center, dx, dz)
      if (Array.isArray(item.footprint)) copy.footprint = shiftRing(item.footprint, dx, dz)
      if (Array.isArray(item.polygon)) copy.polygon = shiftRing(item.polygon, dx, dz)
      return copy
    })
  }

  if (isRecord(next.roadNetwork)) {
    const network: UnknownRecord = { ...next.roadNetwork }
    if (Array.isArray(network.nodes)) {
      network.nodes = network.nodes.map((node) => {
        if (!isRecord(node)) return node
        const copy: UnknownRecord = { ...node }
        if (isPointPair(node.at)) copy.at = shiftPoint(node.at, dx, dz)
        return copy
      })
    }
    next.roadNetwork = network
  }

  return next
}

/** pack.json + campus.json（局部坐标）→ 编辑器用的 CampusData（世界坐标） */
export function mergePack(meta: unknown, geometry: unknown): CampusData {
  if (!isRecord(meta)) throw new PackValidationError('pack.json 必须是 JSON 对象')
  if (typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new PackValidationError('pack.json name 必须是非空字符串')
  }
  const local = isRecord(geometry) ? geometry : {}
  const [minX, minZ] = boundsOrigin(meta.bounds)

  const merged: UnknownRecord = {
    ...shiftGeometry(pickKeys(local, GEOMETRY_KEYS), minX, minZ),
    zones: packZonesToEditorZones(shiftGeometry(pickKeys(local, ['zones']), minX, minZ).zones),
    trees: packTreesToPoints(
      Array.isArray(local.trees) ? shiftGeometry({ trees: local.trees }, minX, minZ).trees : [],
    ),
    ...(typeof meta.id === 'string' ? { id: meta.id } : {}),
    name: meta.name,
    bounds: boundsToSize(meta.bounds),
  }
  return merged as unknown as CampusData
}

/** 编辑器数据 → { meta, geometry }（pack 形状、局部坐标） */
export function splitPack(
  data: CampusData,
  currentMeta: UnknownRecord,
  currentGeometry: unknown,
): { meta: UnknownRecord; geometry: UnknownRecord } {
  const [minX, minZ] = boundsOrigin(currentMeta.bounds)
  const normalized = data as unknown as UnknownRecord

  const meta = pickKeys(currentMeta, META_KEYS)
  meta.name = normalized.name
  const size = boundsToSize(currentMeta.bounds)
  const currentBounds = currentMeta.bounds as { min: [number, number] }
  meta.bounds = {
    min: [currentBounds.min[0], currentBounds.min[1]],
    max: [currentBounds.min[0] + size.width, currentBounds.min[1] + size.depth],
  }

  const geometry = shiftGeometry(pickKeys(normalized, GEOMETRY_KEYS), -minX, -minZ)
  if (Array.isArray(geometry.zones)) geometry.zones = editorZonesToPackZones(geometry.zones)
  geometry.trees = pointsToPackTrees(
    shiftGeometry({ trees: normalized.trees ?? [] }, -minX, -minZ).trees,
    isRecord(currentGeometry) ? currentGeometry.trees : undefined,
  )
  return { meta, geometry }
}

/**
 * 保存前校验。`assertValidCampusData` 只查 zone/道路那套，**完全不看 rooms**
 * （campusValidation.ts 里 `rooms` 出现 0 次），所以室内几何要在这里单独把关，
 * 否则 2 个点的「多边形」能被原样写进 pack，页面读回来才发现是坏数据。
 */
function validateAndNormalize(data: unknown): CampusData {
  try {
    assertValidCampusData(data)
  } catch (error) {
    throw new PackValidationError((error as Error).message)
  }
  for (const issue of validateRooms(data as CampusData)) {
    if (issue.level === 'error') throw new PackValidationError(`室内数据不合法：${issue.message}`)
  }
  return normalizeCampusData(data as CampusData)
}

/**
 * 单进程写队列：避免并发写同一 pack 时半截文件被读到。
 * 按 pack id 串行，不做跨进程锁（部署按单进程设计）。
 */
class WriteQueue {
  private chains = new Map<string, Promise<unknown>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.chains.set(
      key,
      next.catch(() => undefined),
    )
    return next
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export interface FilePackStoreOptions {
  dataDir: string
  /** 种子包来源目录列表，启动时若 dataDir 里没有该 pack 就复制一份进来（不覆盖已有数据） */
  seedDirs?: string[]
}

/** 文件存储：`<dataDir>/<packId>/pack.json` + `<dataDir>/<packId>/campus.json` */
export class FilePackStore implements PackStore {
  private readonly dataDir: string
  private readonly seedDirs: string[]
  private readonly queue = new WriteQueue()

  constructor(options: FilePackStoreOptions) {
    this.dataDir = options.dataDir
    this.seedDirs = options.seedDirs ?? []
  }

  async ensureDataDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
  }

  /** 启动时把种子包导入 dataDir（已存在的 pack 不覆盖） */
  async seed(): Promise<string[]> {
    await this.ensureDataDir()
    const imported: string[] = []
    for (const seedDir of this.seedDirs) {
      let ids: string[]
      try {
        const entries = await readdir(seedDir, { withFileTypes: true })
        ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      } catch {
        continue
      }
      for (const id of ids) {
        if (!PACK_ID_PATTERN.test(id)) continue
        const target = join(this.dataDir, id)
        try {
          await stat(join(target, 'pack.json'))
          continue // 已有，不动
        } catch {
          // 不存在，导入
        }
        let meta: unknown
        try {
          meta = await readJson(join(seedDir, id, 'pack.json'))
        } catch {
          continue
        }
        let geometry: unknown = null
        try {
          geometry = await readJson(join(seedDir, id, 'campus.json'))
        } catch {
          geometry = null
        }
        await mkdir(target, { recursive: true })
        await atomicWriteJson(join(target, 'pack.json'), meta)
        if (geometry !== null) await atomicWriteJson(join(target, 'campus.json'), geometry)
        imported.push(id)
      }
    }
    return imported
  }

  packDir(id: string): string {
    assertPackId(id)
    return join(this.dataDir, id)
  }

  async list(): Promise<PackSummary[]> {
    await this.ensureDataDir()
    const entries = await readdir(this.dataDir, { withFileTypes: true })
    const result: PackSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !PACK_ID_PATTERN.test(entry.name)) continue
      try {
        const meta = await this.readMeta(entry.name)
        const info = await stat(join(this.dataDir, entry.name, 'campus.json')).catch(() => null)
        result.push({
          id: entry.name,
          name: typeof meta.name === 'string' ? meta.name : entry.name,
          updatedAt: info ? info.mtime.toISOString() : null,
        })
      } catch {
        continue
      }
    }
    return result.sort((a, b) => a.id.localeCompare(b.id))
  }

  async readMeta(id: string): Promise<UnknownRecord> {
    const dir = this.packDir(id)
    let meta: unknown
    try {
      meta = await readJson(join(dir, 'pack.json'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new PackNotFoundError(id)
      throw error
    }
    if (!isRecord(meta)) throw new PackValidationError('pack.json 必须是 JSON 对象')
    return meta
  }

  async readCampus(id: string): Promise<CampusData> {
    const meta = await this.readMeta(id)
    let geometry: unknown = null
    try {
      geometry = await readJson(join(this.packDir(id), 'campus.json'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return mergePack(meta, geometry)
  }

  async writeCampus(id: string, data: unknown, now = new Date().toISOString()): Promise<CampusData> {
    assertPackId(id)
    return this.queue.run(id, async () => {
      const validated = validateAndNormalize(data)
      const dir = this.packDir(id)
      const currentMeta = await this.readMeta(id)
      let currentGeometry: unknown = null
      try {
        currentGeometry = await readJson(join(dir, 'campus.json'))
      } catch {
        currentGeometry = null
      }
      const { meta, geometry } = splitPack(validated, currentMeta, currentGeometry)
      meta.id = id
      meta.updatedAt = now
      const merged = mergePack(meta, geometry)
      await atomicWriteJson(join(dir, 'campus.json'), geometry)
      await atomicWriteJson(join(dir, 'pack.json'), meta)
      return merged
    })
  }

  async writeMeta(id: string, meta: UnknownRecord): Promise<void> {
    assertPackId(id)
    await this.queue.run(id, async () => {
      if (!isRecord(meta)) throw new PackValidationError('pack.json 必须是 JSON 对象')
      const dir = this.packDir(id)
      await mkdir(dir, { recursive: true })
      await atomicWriteJson(join(dir, 'pack.json'), meta)
    })
  }
}

/** 内存存储：测试与 dev 加速用，与 FilePackStore 行为对齐 */
export class MemoryPackStore implements PackStore {
  private packs = new Map<string, { meta: UnknownRecord; geometry: unknown }>()
  private updated = new Map<string, string>()
  private queue = new WriteQueue()

  /** `initial` 用编辑器形状（世界坐标）给种子，内部转换成 pack 形状存着，保证与 FilePackStore 同口径 */
  constructor(initial: Record<string, CampusData> = {}) {
    for (const [id, data] of Object.entries(initial)) {
      const currentMeta = {
        name: data.name ?? id,
        bounds: { min: [0, 0], max: [data.bounds?.width ?? 1, data.bounds?.depth ?? 1] },
      }
      const { meta, geometry } = splitPack(data, currentMeta, null)
      this.packs.set(id, { meta: { ...meta, id }, geometry })
    }
  }

  async list(): Promise<PackSummary[]> {
    return [...this.packs.keys()].sort().map((id) => {
      const entry = this.packs.get(id)!
      return {
        id,
        name: typeof entry.meta.name === 'string' ? (entry.meta.name as string) : id,
        updatedAt: this.updated.get(id) ?? null,
      }
    })
  }

  async readMeta(id: string): Promise<UnknownRecord> {
    const entry = this.packs.get(id)
    if (!entry) throw new PackNotFoundError(id)
    return { ...entry.meta }
  }

  async readCampus(id: string): Promise<CampusData> {
    const entry = this.packs.get(id)
    if (!entry) throw new PackNotFoundError(id)
    return mergePack(entry.meta, entry.geometry)
  }

  async writeCampus(id: string, data: unknown, now = new Date().toISOString()): Promise<CampusData> {
    assertPackId(id)
    return this.queue.run(id, async () => {
      const validated = validateAndNormalize(data)
      const current = this.packs.get(id)
      const currentMeta: UnknownRecord = current?.meta ?? {
        name: validated.name ?? id,
        bounds: { min: [0, 0], max: [validated.bounds?.width ?? 1, validated.bounds?.depth ?? 1] },
      }
      const { meta, geometry } = splitPack(validated, currentMeta, current?.geometry)
      meta.id = id
      meta.updatedAt = now
      this.packs.set(id, { meta, geometry })
      this.updated.set(id, now)
      return mergePack(meta, geometry)
    })
  }

  async writeMeta(id: string, meta: UnknownRecord): Promise<void> {
    assertPackId(id)
    await this.queue.run(id, async () => {
      if (!isRecord(meta)) throw new PackValidationError('pack.json 必须是 JSON 对象')
      const current = this.packs.get(id)
      this.packs.set(id, { meta, geometry: current?.geometry ?? null })
    })
  }
}
