import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateCampusData,
  serializeCampusData,
  loadCampusData,
  saveCampusData,
} from './campus-store.ts'

function minimalCampus(): Record<string, unknown> {
  return {
    name: 'test',
    bounds: { width: 100, depth: 100 },
    zones: [],
    buildings: [
      {
        id: 'b1',
        name: 'B1',
        category: 'academic',
        position: [0, 0],
        size: [10, 10],
        height: 12,
        zoneId: 'z1',
      },
    ],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [],
    routes: [],
  }
}

describe('validateCampusData', () => {
  it('accepts a minimal valid object', () => {
    expect(() => validateCampusData(minimalCampus())).not.toThrow()
  })

  it('rejects when an array key is missing', () => {
    const bad = minimalCampus()
    delete bad.buildings
    expect(() => validateCampusData(bad)).toThrow(/buildings/)
  })

  it('rejects when building.height is not a number', () => {
    const bad = minimalCampus() as any
    bad.buildings[0].height = 'tall'
    expect(() => validateCampusData(bad)).toThrow(/height/)
  })

  it('rejects a non-object', () => {
    expect(() => validateCampusData(null)).toThrow()
    expect(() => validateCampusData(42)).toThrow()
  })
})

describe('serializeCampusData', () => {
  it('produces JSON parseable back to an equal object, ending with newline', () => {
    const data = minimalCampus()
    const text = serializeCampusData(data as never)
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(data)
  })
})

describe('loadCampusData / saveCampusData', () => {
  let dir: string
  let dataPath: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'campus-store-'))
    dataPath = join(dir, 'campus.json')
    backupDir = join(dir, '.editor-backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('saves data to disk matching serialize output', async () => {
    const data = minimalCampus()
    const result = await saveCampusData(dataPath, backupDir, data, '2026-06-03T00:00:00.000Z')
    expect(result.ok).toBe(true)
    const onDisk = await readFile(dataPath, 'utf8')
    expect(onDisk).toBe(serializeCampusData(data as never))
  })

  it('backs up the previous file before overwriting', async () => {
    await writeFile(dataPath, '{"old":true}\n', 'utf8')
    await saveCampusData(dataPath, backupDir, minimalCampus(), '2026-06-03T00:00:00.000Z')
    const backups = await readdir(backupDir)
    expect(backups.length).toBe(1)
    const backupContent = await readFile(join(backupDir, backups[0]), 'utf8')
    expect(backupContent).toBe('{"old":true}\n')
  })

  it('does not write when validation fails', async () => {
    const bad = minimalCampus()
    delete bad.routes
    await expect(saveCampusData(dataPath, backupDir, bad, '2026-06-03T00:00:00.000Z')).rejects.toThrow(/routes/)
    await expect(readFile(dataPath, 'utf8')).rejects.toThrow()
  })

  it('round-trips through loadCampusData', async () => {
    const data = minimalCampus()
    await saveCampusData(dataPath, backupDir, data, '2026-06-03T00:00:00.000Z')
    expect(await loadCampusData(dataPath)).toEqual(data)
  })
})
