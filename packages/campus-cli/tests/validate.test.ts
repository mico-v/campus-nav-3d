import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { run } from '../src/main.ts'
import { inspectPack, readPack, validatePackDir } from '../src/validate.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const cli = join(root, 'packages/campus-cli/src/main.ts')
const fixture = (name: string) => join(root, 'packages/campus-cli/fixtures', name)
const codes = (name: string) => validatePackDir(fixture(name)).issues.map((issue) => issue.code)

function runCli(args: string[]) {
  return run(args, root)
}

describe('campus-validate CLI', () => {
  it('对 packs/usts-tianping 输出零错误', () => {
    const report = validatePackDir(join(root, 'packs/usts-tianping'))
    expect(report.ok).toBe(true)
    expect(report.summary.errors).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('坏样例目录全部报错，好样例零错误', () => {
    for (const name of [
      'bad-few-vertices',
      'bad-zero-area',
      'bad-duplicate-id',
      'bad-id-format',
      'bad-one-way-vertical',
      'bad-unreachable-room',
    ]) {
      expect(validatePackDir(fixture(name)).ok, name).toBe(false)
    }
    expect(validatePackDir(fixture('good-empty')).ok).toBe(true)
  })

  it('报告按 geometry / topology / naming 三类计数', () => {
    const report = validatePackDir(fixture('bad-zero-area'))
    expect(report.summary.geometry).toBe(1)
    expect(report.summary.topology).toBe(0)
    expect(report.summary.naming).toBe(0)
  })

  it('readPack 会合并 pack.json 与 campus.json', () => {
    const pack = readPack(fixture('good-empty')) as { id: string; zones: unknown[] }
    expect(pack.id).toBe('demo-pack')
    expect(pack.zones).toHaveLength(1)
  })

  it('--json 输出结构化报告，退出码随错误变化', () => {
    const ok = runCli(['validate', 'packs/usts-tianping', '--json'])
    expect(ok.code).toBe(0)
    expect(JSON.parse(ok.stdout).summary.errors).toBe(0)

    const bad = runCli(['validate', 'packages/campus-cli/fixtures/bad-zero-area', '--json'])
    expect(bad.code).toBe(1)
    expect(JSON.parse(bad.stdout).issues[0].code).toBe('polygon.zero-area')
  })

  it('help 与未知命令行为正确', () => {
    expect(runCli(['--help']).code).toBe(0)
    expect(runCli(['nope']).code).toBe(1)
    expect(runCli(['validate']).code).toBe(1)
  })
})

describe('几何自检', () => {
  it('多边形顶点不足时报 polygon.too-few-vertices', () => {
    expect(codes('bad-few-vertices')).toContain('polygon.too-few-vertices')
  })

  it('面积为 0 时报 polygon.zero-area', () => {
    expect(codes('bad-zero-area')).toContain('polygon.zero-area')
  })

  it('面积为 0 的错误路径指向具体多边形', () => {
    const issue = validatePackDir(fixture('bad-zero-area')).issues[0]
    expect(issue.path).toBe('zones[0].polygon')
    expect(issue.category).toBe('geometry')
  })
})

describe('拓扑自检', () => {
  it('id 重复时报 *.id.duplicate', () => {
    const found = codes('bad-duplicate-id')
    expect(found).toContain('building.id.duplicate')
    expect(found).toContain('poi.id.duplicate')
  })

  it('id 重复计入 topology 分类', () => {
    const issue = validatePackDir(fixture('bad-duplicate-id')).issues
      .find((entry) => entry.code === 'building.id.duplicate')
    expect(issue?.category).toBe('topology')
  })

  it('竖向连接单向时报 vertical.one-way', () => {
    expect(codes('bad-one-way-vertical')).toContain('vertical.one-way')
  })

  it('竖向连接错误计入 topology 分类', () => {
    const issue = validatePackDir(fixture('bad-one-way-vertical')).issues[0]
    expect(issue.category).toBe('topology')
  })

  it('房间不可达时报 unit.unreachable 与 level.unreachable', () => {
    const found = codes('bad-unreachable-room')
    expect(found).toContain('unit.unreachable')
    expect(found).toContain('level.unreachable')
  })

  it('房间不可达的错误路径包含房间 id', () => {
    const issue = validatePackDir(fixture('bad-unreachable-room')).issues
      .find((entry) => entry.code === 'unit.unreachable')
    expect(issue?.message).toContain('r-lab')
  })
})

describe('命名自检', () => {
  it('id 非小写连字符时报 *.id.invalid', () => {
    const found = codes('bad-id-format')
    expect(found).toContain('building.id.invalid')
    expect(found).toContain('poi.id.invalid')
  })

  it('命名错误计入 naming 分类', () => {
    const report = validatePackDir(fixture('bad-id-format'))
    expect(report.summary.naming).toBe(2)
    expect(report.issues.every((issue) => issue.category === 'naming')).toBe(true)
  })

  it('多边形顶点不足在几何层被拦下，不重复计入 schema', () => {
    const pack = readPack(fixture('bad-few-vertices'))
    const withoutSchema = inspectPack(pack)
    const withSchema = inspectPack(pack, { withSchema: true })
    expect(withoutSchema.map((issue) => issue.code)).toEqual(['polygon.too-few-vertices'])
    expect(withSchema.some((issue) => issue.category === 'schema')).toBe(true)
  })
})

describe('入口脚本', () => {
  it('能被 node --experimental-strip-types 直接运行', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, 'validate', 'packs/usts-tianping', '--json'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).ok).toBe(true)
  })
})
