import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const MANIFEST_NAME = 'manifest.json'
export const DEFAULT_CHUNK_SIZE = 64 * 1024

export interface BundleFile {
  path: string
  bytes: number
  sha256: string
  chunk: string
}

export interface BundleManifest {
  id: string
  schema: string
  version: number
  checksum: string
  files: BundleFile[]
}

export interface BundleOptions {
  /** 单个分片的目标字节上限。 */
  chunkSize?: number
}

export interface BundleResult {
  manifest: BundleManifest
  chunks: Map<string, Uint8Array>
}

function listFiles(packDir: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return walk(full)
      return entry.isFile() ? [full] : []
    })
  return walk(packDir)
    .map((file) => relative(packDir, file).split(sep).join('/'))
    .filter((path) => path !== MANIFEST_NAME)
    .sort()
}

function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * 把 pack 目录打成确定性离线包：同输入得到同 checksum 与同分片内容。
 * checksum = sha256(按路径排序后的 `path\0sha256\0` 拼接串)。
 */
export function bundlePack(packDir: string, options: BundleOptions = {}): BundleResult {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`分片大小必须是正整数，收到 ${chunkSize}`)
  }
  if (!statSync(packDir).isDirectory()) throw new Error(`${packDir} 不是目录`)

  const paths = listFiles(packDir)
  if (!paths.includes('pack.json')) throw new Error(`${packDir} 缺少 pack.json，无法确定包 id 与 schema`)

  let meta: { id?: unknown; schema?: unknown }
  try {
    meta = JSON.parse(readFileSync(join(packDir, 'pack.json'), 'utf8')) as typeof meta
  } catch (error) {
    throw new Error(`读取 pack.json 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof meta.id !== 'string' || !meta.id) throw new Error('pack.json 缺少有效的 id')
  if (typeof meta.schema !== 'string' || !meta.schema) throw new Error('pack.json 缺少有效的 schema')

  const files: BundleFile[] = []
  const contents: Uint8Array[] = []
  for (const path of paths) {
    const content = readFileSync(join(packDir, path))
    files.push({ path, bytes: content.length, sha256: sha256(content), chunk: '' })
    contents.push(content)
  }

  const checksum = sha256(files.map((file) => `${file.path}\0${file.sha256}\0`).join(''))

  const chunks = new Map<string, Uint8Array>()
  const pending: number[] = []
  let pendingSize = 0
  let index = 0
  const flush = (): void => {
    if (pending.length === 0) return
    const name = `chunk-${String(index).padStart(3, '0')}.bin`
    chunks.set(name, concatBytes(pending.map((i) => contents[i]!)))
    for (const i of pending) files[i]!.chunk = name
    index += 1
    pending.length = 0
    pendingSize = 0
  }

  contents.forEach((content, i) => {
    if (content.length > chunkSize) {
      throw new Error(`文件 ${files[i]!.path} 超过分片上限 ${chunkSize} 字节，无法打包`)
    }
    if (pendingSize > 0 && pendingSize + content.length > chunkSize) flush()
    pending.push(i)
    pendingSize += content.length
  })
  flush()

  return { manifest: { id: meta.id, schema: meta.schema, version: 1, checksum, files }, chunks }
}

/** 写出 manifest 与分片到输出目录。 */
export function writeBundle(outDir: string, result: BundleResult): void {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, MANIFEST_NAME), `${JSON.stringify(result.manifest, null, 2)}\n`)
  for (const [name, content] of result.chunks) writeFileSync(join(outDir, name), content)
}
