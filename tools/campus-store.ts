import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CampusData } from '../src/data/campusData.ts'

export interface SaveResult {
  ok: true
  backupPath: string | null
}

const ARRAY_KEYS = [
  'zones',
  'buildings',
  'roads',
  'waters',
  'fields',
  'trees',
  'pois',
  'routes',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberPair(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every((n) => typeof n === 'number')
}

/** Throws Error with a descriptive message when `value` is not a structurally valid CampusData. */
export function validateCampusData(value: unknown): asserts value is CampusData {
  if (!isRecord(value)) {
    throw new Error('campus data must be an object')
  }
  if (typeof value.name !== 'string') {
    throw new Error('campus data "name" must be a string')
  }
  if (!isRecord(value.bounds) || typeof value.bounds.width !== 'number' || typeof value.bounds.depth !== 'number') {
    throw new Error('campus data "bounds" must have numeric width and depth')
  }
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(value[key])) {
      throw new Error(`campus data "${key}" must be an array`)
    }
  }

  const buildings = value.buildings as unknown[]
  buildings.forEach((b, i) => {
    if (!isRecord(b)) throw new Error(`buildings[${i}] must be an object`)
    if (typeof b.id !== 'string') throw new Error(`buildings[${i}].id must be a string`)
    if (typeof b.name !== 'string') throw new Error(`buildings[${i}].name must be a string`)
    if (typeof b.category !== 'string') throw new Error(`buildings[${i}].category must be a string`)
    if (!isNumberPair(b.position)) throw new Error(`buildings[${i}].position must be [number, number]`)
    if (!isNumberPair(b.size)) throw new Error(`buildings[${i}].size must be [number, number]`)
    if (typeof b.height !== 'number') throw new Error(`buildings[${i}].height must be a number`)
  })

  const roads = value.roads as unknown[]
  roads.forEach((r, i) => {
    if (!isRecord(r)) throw new Error(`roads[${i}] must be an object`)
    if (!Array.isArray(r.points)) throw new Error(`roads[${i}].points must be an array`)
  })
}

/** Stable, pretty-printed serialization with trailing newline. */
export function serializeCampusData(data: CampusData): string {
  return JSON.stringify(data, null, 2) + '\n'
}

export async function loadCampusData(dataPath: string): Promise<unknown> {
  const text = await readFile(dataPath, 'utf8')
  return JSON.parse(text)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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

  let backupPath: string | null = null
  if (await fileExists(dataPath)) {
    await mkdir(backupDir, { recursive: true })
    const stamp = now.replace(/[:.]/g, '-')
    backupPath = join(backupDir, `campusData-${stamp}.json`)
    await copyFile(dataPath, backupPath)
  }

  await mkdir(dirname(dataPath), { recursive: true })
  const tmpPath = `${dataPath}.tmp`
  await writeFile(tmpPath, serializeCampusData(data), 'utf8')
  await rename(tmpPath, dataPath)

  return { ok: true, backupPath }
}
