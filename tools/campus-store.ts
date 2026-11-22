import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CampusData } from '../src/data/campusData.ts'
import { assertValidCampusData } from '../src/data/campusValidation.ts'
import { normalizeCampusData } from '../src/data/roadNormalization.ts'

export interface SaveResult {
  ok: true
  backupPath: string | null
}

export interface PackSaveResult {
  ok: true
  backupPath: string | null
  packBackupPath: string | null
}

const META_KEYS = [
  'schema',
  'id',
  'name',
  'crs',
  'origin',
  'bounds',
  'units',
  'license',
  'attribution',
] as const

const GEOMETRY_KEYS = [
  'zones',
  'buildings',
  'roads',
  'waters',
  'fields',
  'trees',
  'pois',
  'roadNetwork',
] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPointPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number')
}

function parseJsonFile(path: string): Promise<unknown> {
  return readFile(path, 'utf8').then((text) => JSON.parse(text) as unknown)
}

function pickKeys(source: UnknownRecord, keys: readonly string[]): UnknownRecord {
  const picked: UnknownRecord = {}
  for (const key of keys) if (key in source) picked[key] = source[key]
  return picked
}

/** Throw when meta bounds cannot produce the positive width/depth required by CampusData. */
function boundsToSize(bounds: unknown): { width: number; depth: number } {
  if (!isRecord(bounds) || !Array.isArray(bounds.min) || !Array.isArray(bounds.max) ||
      bounds.min.length !== 2 || bounds.max.length !== 2) {
    throw new Error('pack.json bounds 必须是 { min: [x,z], max: [x,z] }')
  }
  const width = Number(bounds.max[0]) - Number(bounds.min[0])
  const depth = Number(bounds.max[1]) - Number(bounds.min[1])
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
    throw new Error('pack.json bounds 无法得到有效 width/depth')
  }
  return { width, depth }
}

/**
 * The pack stores trees as `CampusTree` objects (`{ id, at: [x, z] }`), while the
 * editor works with bare points. Accept both so fixtures and hand-written packs load.
 */
function packTreesToPoints(trees: unknown): [number, number][] {
  if (!Array.isArray(trees)) throw new Error('campus.json trees 必须是数组')
  return trees.map((tree, index) => {
    if (isPointPair(tree)) return [tree[0], tree[1]]
    if (isRecord(tree) && isPointPair(tree.at)) return [tree.at[0], tree.at[1]]
    throw new Error(`campus.json trees[${index}] 缺少可用坐标`)
  })
}

/**
 * Map editor points back to `CampusTree` objects.
 * When the coordinate sequence is untouched the original objects are returned as-is,
 * so pack-only fields (id / radius / color) survive a save that only edited geometry.
 */
function pointsToPackTrees(points: unknown, previous: unknown): unknown[] {
  const previousTrees = Array.isArray(previous) ? previous : []
  const next = packTreesToPoints(points)
  const unchanged = previousTrees.length === next.length && previousTrees.every((tree, index) => {
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

/**
 * Pack zones carry `polygon`; the editor's `CampusData` shape carries `footprint`.
 * Both sides must agree on the same geometry or the map and the editor render
 * different campuses (and tree generation diverges on top of that).
 */
function packZonesToEditorZones(zones: unknown): unknown {
  if (!Array.isArray(zones)) return zones
  return zones.map((zone) => {
    if (!isRecord(zone)) return zone
    const { polygon, ...rest } = zone
    return { ...rest, footprint: Array.isArray(zone.footprint) ? zone.footprint : polygon }
  })
}

function rectFromCenterSize(center: unknown, size: unknown): [number, number][] | null {
  if (!isPointPair(center) || !isPointPair(size) || size[0] <= 0 || size[1] <= 0) return null
  const [x, z] = center
  const [width, depth] = size
  return [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ]
}

/** Editor `footprint` -> pack `polygon`, so a save stays a schema-valid pack. */
function editorZonesToPackZones(zones: unknown): unknown {
  if (!Array.isArray(zones)) return zones
  return zones.map((zone, index) => {
    if (!isRecord(zone)) return zone
    const { footprint, ...rest } = zone
    const polygon = Array.isArray(footprint) && footprint.length >= 3
      ? footprint
      : rectFromCenterSize(zone.center, zone.size)
    if (!polygon) throw new Error(`zones[${index}] 缺少 footprint，且 center/size 无法生成多边形`)
    return { ...rest, polygon }
  })
}

/** Throws an actionable error when `value` is not a valid static map dataset. */
export function validateCampusData(value: unknown): asserts value is CampusData {
  assertValidCampusData(value)
}

/** Stable, pretty-printed serialization with trailing newline. */
export function serializeCampusData(data: CampusData): string {
  return JSON.stringify(data, null, 2) + '\n'
}

export async function loadCampusData(dataPath: string): Promise<unknown> {
  return parseJsonFile(dataPath)
}

/**
 * Merge a campus pack into the legacy CampusData shape used by the editor:
 * geometry from `campusPath`, meta/name/bounds from `packPath`.
 */
export async function loadPackCampusData(packPath: string, campusPath: string): Promise<CampusData> {
  const [rawMeta, rawGeometry] = await Promise.all([
    parseJsonFile(packPath),
    parseJsonFile(campusPath),
  ])
  if (!isRecord(rawMeta)) throw new Error('pack.json 必须是 JSON 对象')
  if (!isRecord(rawGeometry)) throw new Error('campus.json 必须是 JSON 对象')
  if (typeof rawMeta.name !== 'string' || !rawMeta.name.trim()) {
    throw new Error('pack.json name 必须是非空字符串')
  }

  const merged: UnknownRecord = {
    ...pickKeys(rawGeometry, GEOMETRY_KEYS),
    zones: packZonesToEditorZones(rawGeometry.zones),
    trees: packTreesToPoints(rawGeometry.trees),
    name: rawMeta.name,
    bounds: boundsToSize(rawMeta.bounds),
  }
  validateCampusData(merged)
  return merged
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function parseOptionalJsonFile(path: string): Promise<unknown> {
  return (await fileExists(path)) ? parseJsonFile(path) : undefined
}

async function backupFile(path: string, backupDir: string, now: string, prefix: string): Promise<string | null> {
  if (!(await fileExists(path))) return null
  await mkdir(backupDir, { recursive: true })
  const stamp = now.replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `${prefix}-${stamp}.json`)
  await copyFile(path, backupPath)
  return backupPath
}

async function atomicWrite(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  await writeFile(tmpPath, text, 'utf8')
  await rename(tmpPath, path)
}

/**
 * Validate, back up the existing file (if any), then atomically write the new data.
 * `now` is an ISO timestamp string supplied by the caller (kept out of pure logic for testability).
 */
export async function saveCampusData(
  dataPath: string,
  backupDir: string,
  data: unknown,
  now: string,
): Promise<SaveResult> {
  validateCampusData(data)
  const normalized = normalizeCampusData(data)
  const backupPath = await backupFile(dataPath, backupDir, now, 'campusData')
  await atomicWrite(dataPath, serializeCampusData(normalized))
  return { ok: true, backupPath }
}

/**
 * Split an edited CampusData back into pack meta and geometry files.
 * Both files are validated + backed up before either is replaced.
 */
export async function savePackCampusData(
  packPath: string,
  campusPath: string,
  backupDir: string,
  data: unknown,
  now: string,
): Promise<PackSaveResult> {
  validateCampusData(data)
  const normalized = normalizeCampusData(data)
  // 编辑器在几何变更时已用 syncRoadNetwork 重建拓扑；save 不再从 roads 重建，
  // 否则只存在于 roadNetwork 的接驳段（无对应 roads 记录）会在往返中丢失。
  if (data.roadNetwork !== undefined) {
    normalized.roadNetwork = data.roadNetwork
  }
  const currentMeta = await parseJsonFile(packPath)
  if (!isRecord(currentMeta)) throw new Error('pack.json 必须是 JSON 对象')
  const currentGeometry = await parseOptionalJsonFile(campusPath)

  const nextMeta = pickKeys(currentMeta, META_KEYS)
  nextMeta.name = normalized.name
  boundsToSize(currentMeta.bounds)
  const currentBounds = currentMeta.bounds as { min: number[]; max: number[] }
  nextMeta.bounds = {
    min: [...currentBounds.min],
    max: [currentBounds.min[0] + normalized.bounds.width, currentBounds.min[1] + normalized.bounds.depth],
  }

  const nextGeometry = pickKeys(normalized as UnknownRecord, GEOMETRY_KEYS)
  if ('zones' in nextGeometry) nextGeometry.zones = editorZonesToPackZones(nextGeometry.zones)
  nextGeometry.trees = pointsToPackTrees(
    normalized.trees,
    isRecord(currentGeometry) ? currentGeometry.trees : undefined,
  )

  const campusBackupPath = await backupFile(campusPath, backupDir, now, 'campus')
  const packBackupPath = await backupFile(packPath, backupDir, now, 'pack')
  await atomicWrite(packPath, JSON.stringify(nextMeta, null, 2) + '\n')
  await atomicWrite(campusPath, JSON.stringify(nextGeometry, null, 2) + '\n')

  return { ok: true, backupPath: campusBackupPath, packBackupPath }
}
