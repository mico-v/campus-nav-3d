#!/usr/bin/env -S node --experimental-strip-types
import { basename, resolve } from 'node:path'
import { bundlePack, writeBundle } from './bundle.ts'
import { validatePackDir, type ValidationReport } from './validate.ts'

export const HELP_TEXT = `campus-validate — campus-pack/2 自检与打包

用法：
  campus-validate validate <pack-dir> [--json] [--with-schema]
  campus-validate bundle <pack-dir> <out-dir> [--chunk-size <bytes>]
  campus-validate --help

选项：
  --json          输出结构化 JSON
  --with-schema   把 campus-schema 的结构性错误也计入报告
  --chunk-size    分片字节上限（默认 65536）
  -h, --help      显示帮助

退出码：0 表示零错误，1 表示存在错误。
`

export interface CliResult {
  code: number
  stdout: string
  stderr: string
}

function formatText(report: ValidationReport): string {
  const lines = [
    `${report.pack}: ${report.ok ? 'OK' : 'FAILED'}`,
    `geometry=${report.summary.geometry} topology=${report.summary.topology} naming=${report.summary.naming} schema=${report.summary.schema}`,
  ]
  for (const issue of report.issues) {
    lines.push(`  [${issue.category}] ${issue.code} ${issue.path}: ${issue.message}`)
  }
  return `${lines.join('\n')}\n`
}

/** 解析参数并生成输出；不直接 process.exit，方便测试。 */
export function run(argv: string[], cwd = process.cwd()): CliResult {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return { code: 0, stdout: HELP_TEXT, stderr: '' }
  }
  if (command !== 'validate' && command !== 'bundle') {
    return { code: 1, stdout: '', stderr: `未知命令：${command}\n${HELP_TEXT}` }
  }

  const flagValue = (name: string): string | undefined => {
    const index = rest.indexOf(name)
    return index >= 0 ? rest[index + 1] : undefined
  }
  const positional: string[] = []
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && rest[index + 1] && !rest[index + 1]!.startsWith('--')) index += 1
      continue
    }
    positional.push(arg)
  }
  const json = rest.includes('--json')
  const withSchema = rest.includes('--with-schema')

  if (command === 'bundle') {
    if (positional.length < 2) {
      return { code: 1, stdout: '', stderr: `缺少 pack 目录或输出目录\n${HELP_TEXT}` }
    }
    const packDir = resolve(cwd, positional[0]!)
    const outDir = resolve(cwd, positional[1]!)
    const rawChunkSize = flagValue('--chunk-size')
    try {
      const result = bundlePack(
        packDir,
        rawChunkSize === undefined ? {} : { chunkSize: Number(rawChunkSize) },
      )
      writeBundle(outDir, result)
      const summary = {
        pack: result.manifest.id,
        out: outDir,
        checksum: result.manifest.checksum,
        files: result.manifest.files.length,
        chunks: result.chunks.size,
      }
      const stdout = json
        ? `${JSON.stringify(summary, null, 2)}\n`
        : `${summary.pack}: ${summary.files} 个文件 / ${summary.chunks} 个分片\nchecksum=${summary.checksum}\n→ ${outDir}\n`
      return { code: 0, stdout, stderr: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { code: 1, stdout: '', stderr: `bundle 失败：${message}\n` }
    }
  }
  if (positional.length === 0) {
    return { code: 1, stdout: '', stderr: `缺少 pack 目录\n${HELP_TEXT}` }
  }

  const packDir = resolve(cwd, positional[0]!)
  try {
    const report = validatePackDir(packDir, { withSchema })
    const stdout = json ? `${JSON.stringify(report, null, 2)}\n` : formatText(report)
    return { code: report.ok ? 0 : 1, stdout, stderr: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (json) {
      const report = {
        pack: packDir,
        ok: false,
        summary: { errors: 1, geometry: 0, topology: 0, naming: 0, schema: 1 },
        issues: [{ category: 'schema', path: '', code: 'pack.read', message }],
      }
      return { code: 1, stdout: `${JSON.stringify(report, null, 2)}\n`, stderr: '' }
    }
    return { code: 1, stdout: '', stderr: `${basename(packDir)}: ${message}\n` }
  }
}

const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (import.meta.url === `file://${entryFile}`) {
  const result = run(process.argv.slice(2))
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.code)
}
