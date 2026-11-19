// @vitest-environment node
/**
 * chrome 令牌表守卫（docs/ui-redesign-v3.md §1 room-tba / s3）。
 *
 * 这一片把两件散落的东西收成表：
 * 1. **层级** —— z-index 一律 `var(--z-*)`，规则里不许再出现裸数字；层序按令牌数值从小到大排好；
 * 2. **动效** —— 过渡时长一律 `var(--motion-*)`，`prefers-reduced-motion` 里只改令牌就能全归零。
 *
 * 断的是「随手写个 z-index: 999 把它盖住」「过渡时长一处处手写」这两类回归。
 * 断言读源码文本，不渲染——真浏览器一致性靠 `scripts/verify-ui.mjs`。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const css = read('src/style.css')
const mainTs = read('src/main.ts')

/** 令牌块（:root 顶层那份）里的某个族：name -> 值 */
function tokenFamily(prefix: string): Map<string, string> {
  const root = /^:root\s*\{[\s\S]*?\n\}/m.exec(css)?.[0] ?? ''
  const family = new Map<string, string>()
  for (const m of root.matchAll(new RegExp(`(${prefix}[a-z0-9-]*)\\s*:\\s*([^;]+);`, 'g'))) {
    family.set(m[1], m[2].trim())
  }
  return family
}

/** 所有声明了该属性的行（含媒体查询里的缩进行） */
const declarations = (property: string): string[] =>
  [...css.matchAll(new RegExp(`(^|\\n)[^\\n]*${property}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[2].trim())

describe('层级表：z-index 只在令牌里定', () => {
  const layers = tokenFamily('--z-')

  it('层级令牌齐全，数值唯一且按叠放顺序递增', () => {
    expect([...layers.keys()].sort()).toEqual(
      ['--z-appbar', '--z-detail', '--z-drawer', '--z-fallback', '--z-labels', '--z-map', '--z-popover', '--z-status-bar'],
    )
    const values = [...layers.values()].map(Number)
    expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true)
    expect(new Set(values).size).toBe(values.length)
    // 地图打底 < 标签 < 状态条 < 抽屉 < 详情 < 顶栏 < 搜索下拉；兜底页盖住一切
    const order = ['--z-map', '--z-labels', '--z-status-bar', '--z-drawer', '--z-detail', '--z-appbar', '--z-popover', '--z-fallback']
    for (let i = 1; i < order.length; i += 1) {
      expect(Number(layers.get(order[i])), `${order[i]} 必须高于 ${order[i - 1]}`).toBeGreaterThan(Number(layers.get(order[i - 1])))
    }
  })

  it('每个层级令牌都被真的用上', () => {
    for (const name of layers.keys()) expect(css, `${name} 声明了却没用到`).toContain(`var(${name})`)
  })

  it('规则里没有裸 z-index 数字', () => {
    const values = declarations('z-index')
    expect(values.length).toBeGreaterThan(4)
    for (const value of values) expect(value, `z-index 必须走令牌：${value}`).toMatch(/^var\(--z-[a-z-]+\)$/)
  })
})

describe('动效表：过渡时长只有一套数', () => {
  const motions = tokenFamily('--motion-')

  it('三档时长都声明了，单位统一是 ms', () => {
    expect([...motions.keys()].sort()).toEqual(['--motion-base', '--motion-fast', '--motion-slow'])
    for (const [name, value] of motions) expect(value, name).toMatch(/^\d+ms$/)
    expect(Number.parseInt(motions.get('--motion-fast') ?? '', 10)).toBeLessThan(Number.parseInt(motions.get('--motion-base') ?? '', 10))
    expect(Number.parseInt(motions.get('--motion-base') ?? '', 10)).toBeLessThan(Number.parseInt(motions.get('--motion-slow') ?? '', 10))
    // 功能性过渡不许慢过 300ms
    expect(Number.parseInt(motions.get('--motion-slow') ?? '', 10)).toBeLessThanOrEqual(300)
  })

  it('每个动效令牌都被真的用上', () => {
    for (const name of motions.keys()) expect(css, `${name} 声明了却没用到`).toContain(`var(${name})`)
  })

  it('过渡只写 `none` 或走令牌，不许手写时长', () => {
    const values = declarations('transition')
    expect(values.length).toBeGreaterThan(2)
    for (const value of values) {
      if (value === 'none') continue
      expect(value, `过渡时长必须走令牌：${value}`).toContain('var(--motion-')
      expect(value, `过渡里还有手写时长：${value}`).not.toMatch(/\b\d+(\.\d+)?m?s\b/)
    }
  })

  it('减动效只改令牌，不动规则', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('--motion-fast: 0ms')
    expect(reduced).toContain('--motion-base: 0ms')
    expect(reduced).toContain('--motion-slow: 0ms')
  })
})

describe('状态条与 chrome 分层不打架', () => {
  it('状态条低于抽屉与详情卡：抽屉展开时压住状态条而不是被它盖', () => {
    expect(css).toMatch(/\.status-bar\s*\{[^}]*z-index: var\(--z-status-bar\)/)
    expect(css).toMatch(/\.sidebar\s*\{[^}]*z-index: var\(--z-drawer\)/)
    expect(css).toMatch(/\.detail-card\s*\{[^}]*z-index: var\(--z-detail\)/)
    expect(css).toMatch(/\.appbar\s*\{[^}]*z-index: var\(--z-appbar\)/)
  })

  it('搜索下拉挂在顶栏之上，WebGL 兜底盖住全部 chrome', () => {
    expect(css).toMatch(/\.search-results\s*\{[^}]*z-index: var\(--z-popover\)/)
    expect(css).toMatch(/\.webgl-fallback\s*\{[^}]*z-index: var\(--z-fallback\)/)
  })

  it('状态条只有一份真身：脚本里就一个 .status-bar', () => {
    expect(mainTs.match(/class="status-bar"/g)?.length).toBe(1)
    // 图例 / 比例尺 / 工具都在这条里，不再各占一角
    for (const part of ['sb-credit', 'sb-status', 'sb-legend', 'map-scale', 'sb-tools']) {
      expect(mainTs).toContain(part)
    }
  })
})
