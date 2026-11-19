// @vitest-environment node
/**
 * 数据源守卫：这三条只有在「仓库里真的只有一份校园数据」时才成立。
 * 谁再把数据源拆回去、或者让编辑器与主应用读不同的文件，这里会先红。
 */
import { describe, it, expect } from 'vitest'
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadPackCampusData, savePackCampusData } from '../tools/campus-store'
import { PACK_DIR, PACK_PATH, CAMPUS_PATH } from '../vite-plugin-campus-api'
import { createDefaultCampusData, validateCampusData, type CampusData } from '../src/data/campusData'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const guardFile = join(repoRoot, 'tests/data-source-guard.test.ts')

/** 只扫源码与文档，跳过依赖、构建产物、历史文档和 pack 数据本身。 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'docs', 'packs', 'coverage', '.vite', 'tests', '.editor-backups'])
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.md', '.yml', '.yaml'])

async function collectSources(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await collectSources(join(dir, entry.name), out)
      continue
    }
    if (!SOURCE_EXTS.has(extname(entry.name))) continue
    if (entry.name === 'package-lock.json') continue
    const path = join(dir, entry.name)
    if (resolve(path) === resolve(guardFile)) continue
    out.push(path)
  }
  return out
}

/** 真实 pack 的副本，测完即删；返回目录与两个文件的路径。 */
async function copyRealPack(prefix: string): Promise<{ dir: string; packPath: string; campusPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  const packPath = join(dir, 'pack.json')
  const campusPath = join(dir, 'campus.json')
  await copyFile(PACK_PATH, packPath)
  await copyFile(CAMPUS_PATH, campusPath)
  return { dir, packPath, campusPath }
}

describe('数据源守卫：旧路径已下线', () => {
  it('源码与 README 里不再引用已删除的 src/data/campus.json', async () => {
    const files = await collectSources(repoRoot)

    // 防止「什么都没扫到」导致假绿：主应用与 README 必须在扫描范围内
    const scanned = files.map((file) => relative(repoRoot, file))
    expect(scanned).toContain('src/data/campusData.ts')
    expect(scanned).toContain('README.md')
    expect(files.length).toBeGreaterThan(30)

    const offenders: string[] = []
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      if (text.includes('data/campus.json')) offenders.push(relative(repoRoot, file))
    }
    expect(offenders).toEqual([])
  })
})

describe('数据源守卫：编辑器 API 与主应用读同一份文件', () => {
  it('dev API 的数据源解析到 packs/usts-tianping', () => {
    expect(relative(PACK_DIR, resolve(repoRoot, 'packs/usts-tianping'))).toBe('')
    expect(PACK_PATH).toBe(join(PACK_DIR, 'pack.json'))
    expect(CAMPUS_PATH).toBe(join(PACK_DIR, 'campus.json'))
  })

  it('主应用的静态 import 指向的正是 dev API 那两个文件', async () => {
    const source = await readFile(join(repoRoot, 'src/data/campusData.ts'), 'utf8')
    const specifiers = [...source.matchAll(/from '([^']*packs\/[^']+)'/g)].map((match) => match[1])
    const resolved = specifiers.map((specifier) => resolve(join(repoRoot, 'src/data'), specifier))

    expect(resolved).toHaveLength(2)
    expect(resolved).toContain(PACK_PATH)
    expect(resolved).toContain(CAMPUS_PATH)
  })

  it('两边解析同一份几何：zone footprint 与建筑一一对齐', async () => {
    const editor = await loadPackCampusData(PACK_PATH, CAMPUS_PATH)
    const main = createDefaultCampusData()

    // 先防「空对空」的假绿：真实 pack 的几何集合必须非空，否则下面的逐项比较毫无意义
    expect(editor.zones.length).toBeGreaterThan(0)
    expect(editor.buildings.length).toBeGreaterThan(0)
    expect(editor.roads.length).toBeGreaterThan(0)

    expect(validateCampusData(editor)).toEqual([])
    expect(editor.zones.map((zone) => zone.id)).toEqual(main.zones.map((zone) => zone.id))
    expect(editor.zones.map((zone) => zone.footprint)).toEqual(main.zones.map((zone) => zone.footprint))
    expect(editor.buildings.map((building) => [building.id, building.footprint])).toEqual(
      main.buildings.map((building) => [building.id, building.footprint]),
    )

    // 主应用在 pack 树木之外还会补景观树，但 pack 里原有的每一棵都得留住
    // （当前真实 pack 的 trees 为空，所以这条本身是空转；树的往返由下面的用例显式种树守住）
    const mainTrees = new Set(main.trees.map((tree) => `${tree[0]},${tree[1]}`))
    for (const tree of editor.trees) expect(mainTrees.has(`${tree[0]},${tree[1]}`)).toBe(true)
  })
})

describe('数据源守卫：编辑器保存不丢几何', () => {
  it('真实 pack 走一遍 PUT 保存再读回，几何与原数据逐项一致', async () => {
    const { dir, packPath, campusPath } = await copyRealPack('campus-save-guard-')
    try {
      const before = await loadPackCampusData(packPath, campusPath)
      await savePackCampusData(packPath, campusPath, join(dir, 'backups'), before, new Date().toISOString())
      const after = await loadPackCampusData(packPath, campusPath)

      for (const key of ['zones', 'buildings', 'roads', 'waters', 'fields', 'trees', 'pois'] as const) {
        expect(after[key], `保存后 ${key} 变了`).toEqual(before[key])
      }
      expect(after.roadNetwork).toBeDefined()
      expect(before.roadNetwork).toBeDefined()
      expect(after.roadNetwork?.segments).toEqual(before.roadNetwork?.segments)
      expect(after.bounds).toEqual(before.bounds)
      expect(validateCampusData(after)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('pack 里有树时往返不丢树（真实 pack trees 为空，这里显式种树）', async () => {
    const { dir, packPath, campusPath } = await copyRealPack('campus-tree-guard-')
    try {
      const base = await loadPackCampusData(packPath, campusPath)
      expect(base.trees).toEqual([])

      const seeded: CampusData = { ...base, trees: [[120.5, 340.25], [-88, 512]] }
      await savePackCampusData(packPath, campusPath, join(dir, 'backups'), seeded, new Date().toISOString())

      const raw = JSON.parse(await readFile(campusPath, 'utf8'))
      expect(raw.trees).toHaveLength(2)
      // zone 的 polygon 是权威几何，保存后不能被 center/size 重算的矩形顶掉
      expect(raw.zones[0].polygon).toEqual(base.zones[0].footprint)

      const after = await loadPackCampusData(packPath, campusPath)
      expect(after.trees).toEqual(seeded.trees)
      expect(after.zones.map((zone) => zone.footprint)).toEqual(base.zones.map((zone) => zone.footprint))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
