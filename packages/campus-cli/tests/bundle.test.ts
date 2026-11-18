import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bundlePack, MANIFEST_NAME, writeBundle } from '../src/bundle.ts'
import { validatePackDir } from '../src/validate.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'campus-bundle-'))
  tempDirs.push(dir)
  return dir
}

function makePack(files: Record<string, string>): string {
  const dir = tempDir()
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('campus-bundle', () => {
  it('manifest 字段齐全，files 按路径排序', () => {
    const pack = makePack({
      'pack.json': JSON.stringify({ id: 'demo-pack', schema: 'campus-pack/2' }),
      'campus.json': '{"zones":[]}',
      'assets/a.txt': 'a',
    })
    const { manifest, chunks } = bundlePack(pack)
    expect(manifest.id).toBe('demo-pack')
    expect(manifest.schema).toBe('campus-pack/2')
    expect(manifest.version).toBe(1)
    expect(manifest.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.files.map((file) => file.path)).toEqual(['assets/a.txt', 'campus.json', 'pack.json'])
    expect(manifest.files.every((file) => file.sha256.length === 64 && file.chunk.endsWith('.bin'))).toBe(true)
    expect([...chunks.keys()]).toEqual(['chunk-000.bin'])
  })

  it('同输入同 checksum 与分片内容', () => {
    const pack = makePack({
      'pack.json': '{"id":"demo-pack","schema":"campus-pack/2"}',
      'campus.json': '{"zones":[]}',
    })
    const a = bundlePack(pack)
    const b = bundlePack(pack)
    expect(b.manifest).toEqual(a.manifest)
    expect([...b.chunks.values()].map((v) => Buffer.from(v).toString('hex')))
      .toEqual([...a.chunks.values()].map((v) => Buffer.from(v).toString('hex')))
  })

  it('内容相同但写入顺序不同仍得到同 checksum', () => {
    const a = makePack({ 'pack.json': '{"id":"p","schema":"campus-pack/2"}', 'z.txt': 'z', 'a.txt': 'a' })
    const b = makePack({ 'z.txt': 'z', 'a.txt': 'a', 'pack.json': '{"id":"p","schema":"campus-pack/2"}' })
    expect(bundlePack(b).manifest.checksum).toBe(bundlePack(a).manifest.checksum)
  })

  it('分片大小受 chunkSize 上限约束', () => {
    const pack = makePack({
      'pack.json': '{"id":"demo-pack","schema":"campus-pack/2"}',
      'a.bin': 'a'.repeat(40),
      'b.bin': 'b'.repeat(40),
      'c.bin': 'c'.repeat(40),
    })
    const { manifest, chunks } = bundlePack(pack, { chunkSize: 64 })
    expect(new Set(manifest.files.map((file) => file.chunk)).size).toBeGreaterThan(1)
    expect(manifest.files.every((file) => chunks.has(file.chunk))).toBe(true)
    for (const chunk of chunks.values()) expect(chunk.length).toBeLessThanOrEqual(64)
  })

  it('单文件超过上限时报可读错误', () => {
    const pack = makePack({
      'pack.json': '{"id":"demo-pack","schema":"campus-pack/2"}',
      'big.bin': 'x'.repeat(32),
    })
    expect(() => bundlePack(pack, { chunkSize: 8 })).toThrow(/big\.bin.*超过分片上限/)
  })

  it('缺文件时报错信息可读', () => {
    const missing = join(tempDir(), 'does-not-exist')
    expect(() => bundlePack(missing)).toThrow(/不是目录|ENOENT|no such file/i)
    const noMeta = makePack({ 'campus.json': '{}' })
    expect(() => bundlePack(noMeta)).toThrow(/缺少 pack\.json/)
    const brokenMeta = makePack({ 'pack.json': '{oops' })
    expect(() => bundlePack(brokenMeta)).toThrow(/读取 pack\.json 失败/)
  })

  it('writeBundle 输出 manifest 与分片', () => {
    const pack = makePack({ 'pack.json': '{"id":"demo-pack","schema":"campus-pack/2"}' })
    const out = join(tempDir(), 'out')
    const result = bundlePack(pack)
    writeBundle(out, result)
    const manifest = JSON.parse(readFileSync(join(out, MANIFEST_NAME), 'utf8'))
    expect(manifest.checksum).toBe(result.manifest.checksum)
    expect(result.chunks.has('chunk-000.bin')).toBe(true)
  })
})

describe('demo-empty 最小包', () => {
  it('campus-validate 零错误', () => {
    const report = validatePackDir(join(root, 'packs/demo-empty'))
    expect(report.ok).toBe(true)
    expect(report.summary.errors).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('可以打成离线包', () => {
    const { manifest } = bundlePack(join(root, 'packs/demo-empty'))
    expect(manifest.id).toBe('demo-empty')
    expect(manifest.files.map((file) => file.path)).toEqual(['campus.json', 'pack.json'])
  })
})
