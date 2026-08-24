// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCampusData, validateCampusData } from './campus-store'
import { createDefaultCampusData } from '../src/data/campusData'

describe('campus-store 保留 footprint 字段', () => {
  it('校验通过含 footprint 的 zone/water/field 数据', () => {
    const data = createDefaultCampusData()
    expect(() => validateCampusData(data)).not.toThrow()
  })

  it('保存后磁盘文件仍包含 zone/water/field 的 footprint', async () => {
    const data = createDefaultCampusData()
    const zoneWithFp = data.zones.find((z) => z.footprint && z.footprint.length >= 3)
    expect(zoneWithFp, '测试数据应至少有一个带 footprint 的 zone').toBeTruthy()

    const dir = await mkdtemp(join(tmpdir(), 'campus-fp-'))
    try {
      const dataPath = join(dir, 'campus.json')
      const backupDir = join(dir, 'backups')
      await saveCampusData(dataPath, backupDir, data, '2026-06-07T00:00:00.000Z')
      const written = JSON.parse(await readFile(dataPath, 'utf8'))
      expect(written.roadNetwork.nodes.length).toBeGreaterThan(0)
      const writtenZone = written.zones.find((z: { id: string }) => z.id === zoneWithFp!.id)
      expect(writtenZone.footprint).toEqual(zoneWithFp!.footprint)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
