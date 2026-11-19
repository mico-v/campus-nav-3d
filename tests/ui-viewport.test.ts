// @vitest-environment node
/**
 * 首屏视野回归（docs/ui-redesign-v3.md §5 s2）。
 *
 * 主人手机上的一句「地图还是不够大」拆成三件事钉住：
 * 1. 默认档位是 peek —— 进页面不许自动展开面板把地图挤成一条；
 * 2. 布局令牌一处一处声明：顶栏 / 底部状态条 / 左右 padding 都走 --map-inset-*；
 * 3. 相机留白读令牌，不在渲染核心里写死 NDC 数字（写死了改令牌也不起作用）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const css = read('src/style.css')
const mainTs = read('src/main.ts')
const sceneTs = read('src/scene/CampusScene.ts')
const verifyScript = read('scripts/verify-ui.mjs')

/** 取 :root 里第一次声明的令牌值 */
const token = (name: string): string | undefined =>
  new RegExp(`(^|\\n)\\s*${name}:\\s*([^;]+);`).exec(css)?.[2]?.trim()

describe('布局令牌：chrome 尺寸只有一处真值', () => {
  const names = [
    '--map-ui-padding',
    '--search-block-height',
    '--status-bar-block-height',
    '--drawer-peek-height',
    '--map-inset-top',
    '--map-inset-bottom',
    '--map-inset-x',
  ]

  it('七个令牌都声明了，且各声明一次', () => {
    for (const name of names) {
      const hits = [...css.matchAll(new RegExp(`(^|\\n)\\s*${name}:`, 'g'))]
      expect(hits.length, `${name} 声明了 ${hits.length} 次`).toBe(1)
    }
  })

  it('取景留白由顶栏 / 状态条 / 抽屉推导，不是写死的像素', () => {
    expect(token('--map-inset-top')).toContain('var(--search-block-height)')
    expect(token('--map-inset-bottom')).toContain('var(--drawer-h)')
    expect(token('--map-inset-bottom')).toContain('var(--status-bar-block-height)')
    expect(token('--map-inset-x')).toContain('var(--map-ui-padding)')
    // 顶栏高度令牌与 appbar 同源，别各写一份 48px
    expect(token('--search-block-height')).toContain('var(--appbar-h)')
    expect(css).toMatch(/--appbar-h:\s*48px/)
  })

  it('peek 高度吃掉不到 12% 视口，首屏地图 ≥ 70% 是留得出来的', () => {
    // 窄屏 --tap 44px → peek 50px；最矮的验收视口 720px → 6.9%
    const narrowCss = css.slice(css.indexOf('@media (max-width: 959px)'))
    const tap = Number(/--tap:\s*(\d+)px;/.exec(narrowCss)?.[1])
    expect(tap).toBeGreaterThanOrEqual(44)
    expect((tap + 6) / 720).toBeLessThan(0.12)
  })
})

describe('相机留白读令牌', () => {
  it('渲染内核不再写死 NDC 上下沿', () => {
    // 原来是 portrait ? -0.34 : -0.86 这类字面量：改令牌也不生效，正是本轮要拆掉的东西
    expect(sceneTs).not.toMatch(/minNdcY\s*=\s*portrait/)
    expect(sceneTs).not.toMatch(/maxNdcY\s*=\s*portrait/)
    expect(sceneTs).toContain('readSafeInsets')
    for (const name of ['--map-inset-top', '--map-inset-bottom', '--map-inset-x']) {
      expect(sceneTs).toContain(name)
    }
  })

  it('读不到令牌时退回保守值，测试环境不会算出 NaN', () => {
    expect(sceneTs).toMatch(/fallback\s*=\s*\{[^}]*top:\s*\d+/)
    expect(sceneTs).toMatch(/Number\.isFinite\(value\)/)
  })
})

describe('抽屉默认 peek', () => {
  it('HTML 初值、脚本兜底值、CSS 令牌三处一致', () => {
    expect(mainTs).toContain('data-drawer="peek"')
    expect(mainTs).toContain("'peek', 'half', 'full'")
    expect(mainTs).toContain("peek: 'var(--drawer-peek-height)'")
  })

  it('只有选中对象时才把抽屉拉到半屏', () => {
    expect(mainTs).toMatch(/narrowViewport\(\) && \(sidebar\.dataset\.drawer \?\? 'peek'\) === 'peek'\) setDrawer\('half'\)/)
  })
})

describe('真浏览器脚本守住这两条', () => {
  it('量抽屉默认高度并断言首屏未被遮挡的地图 ≥ 70%', () => {
    expect(verifyScript).toContain('drawerState')
    expect(verifyScript).toContain('unobstructedRatio')
    expect(verifyScript).toMatch(/unobstructedRatio\s*<\s*0\.7/)
    expect(verifyScript).toMatch(/drawerState !== 'peek'/)
  })
})
