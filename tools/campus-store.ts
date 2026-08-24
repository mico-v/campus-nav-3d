import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CampusData } from '../src/data/campusData.ts'
import { assertValidCampusData } from '../src/data/campusValidation.ts'
import { normalizeCampusData } from '../src/data/roadNormalization.ts'

export interface SaveResult {
  ok: true
  backupPath: string | null
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
  const normalized = normalizeCampusData(data)

  let backupPath: string | null = null
  if (await fileExists(dataPath)) {
    await mkdir(backupDir, { recursive: true })
    const stamp = now.replace(/[:.]/g, '-')
    backupPath = join(backupDir, `campusData-${stamp}.json`)
    await copyFile(dataPath, backupPath)
  }

  await mkdir(dirname(dataPath), { recursive: true })
  const tmpPath = `${dataPath}.tmp`
  await writeFile(tmpPath, serializeCampusData(normalized), 'utf8')
  await rename(tmpPath, dataPath)

  return { ok: true, backupPath }
}
