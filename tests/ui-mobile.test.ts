// @vitest-environment node
/**
 * 移动端布局回归（docs/design-overview-v2.md §6.1 / §6.2）。
 *
 * 手机壳里出过两次同类的坑：抽屉拖不动、地图被面板挤小。这类问题在桌面浏览器
 * 上看不出来，所以把「窄屏该成立的那几条」变成断言钉住：
 * 断点只写一处、抽屉档位 CSS 与脚本同数、贴底浮层同时避开抽屉和刘海、点击区 44px。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const css = read('src/style.css')
const mainTs = read('src/main.ts')
const demoHtml = read('demo.html')

/** 窄屏那一段样式：媒体查询里的规则带缩进，逐条取规则得在这一段里做。 */
/** 断点阶梯：手机档 + 抽屉档，见下方「断点只写一处」 */
const PHONE_BREAKPOINT = '560'
const DRAWER_BREAKPOINT = '959'

const narrowCss = css.slice(css.indexOf('@media (max-width: 959px)'))
const narrowRule = (selector: string): string => {
  const match = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(narrowCss)
  if (!match) throw new Error(`窄屏样式里没有这条规则：${selector}`)
  return match[0]
}

describe('断点只写一处', () => {
  it('CSS 与脚本都用 959px', () => {
    expect(css).toMatch(/@media \(max-width: 959px\)/)
    expect(mainTs).toContain("window.matchMedia('(max-width: 959px)')")
    // 断点阶梯只允许两级，想加第三档得先在这里显式登记（只数 @media，别的 max-width 不算）：
    //   PHONE 手机档：品牌收成图标、站点导航压窄、点击区吃满 44px
    //   DRAWER 抽屉档：地图全屏 + 底部抽屉，脚本里的 narrowViewport() 也用这个数
    const allCss = [css, read('src/ui/site-nav.css')].join('\n')
    const breakpoints = new Set([...allCss.matchAll(/@media \(max-width:\s*(\d+)px\)/g)].map((m) => m[1]))
    expect([...breakpoints].sort((a, b) => Number(a) - Number(b))).toEqual([PHONE_BREAKPOINT, DRAWER_BREAKPOINT])
  })

  it('窄屏才算窄屏：抽屉的拖动/吸附都过 narrowViewport()', () => {
    expect(mainTs).toContain('const narrowViewport')
    const dragStart = mainTs.slice(mainTs.indexOf("drawerHandle.addEventListener('pointerdown'"))
    expect(dragStart).toMatch(/^[\s\S]{0,200}if \(!narrowViewport\(\)/)
  })
})

describe('抽屉三档：CSS 与脚本同一套数', () => {
  it('closed / half / full 的高度对得上', () => {
    const pairs: Array<[string, string, number]> = [
      ['closed', 'closed', 0],
      ['half', 'half', 30],
      ['full', 'full', 86],
    ]
    for (const [state, tsKey, vh] of pairs) {
      const rule = narrowRule(`.sidebar[data-drawer='${state}']`)
      if (state === 'closed') {
        // 收起时只留手柄高度，别留一条空白缝
        expect(rule).toContain('calc(var(--tap) + 6px)')
        expect(mainTs).toContain("closed: 'calc(var(--tap) + 6px)'")
        continue
      }
      expect(rule).toContain(`${vh}vh`)
      const tsValue = new RegExp(`${tsKey}:\\s*'([\\d.]+)vh'`).exec(mainTs)?.[1]
      expect(Number(tsValue)).toBe(vh)
      const snap = new RegExp(`${tsKey}:\\s*([\\d.]+)\\s*[},]`).exec(mainTs)?.[1]
      expect(Number(snap) * 100).toBeCloseTo(vh, 5)
    }
  })

  it('半屏档不超过三分之一屏——地图默认还是主视区', () => {
    const half = /height:\s*([\d.]+)vh/.exec(narrowRule(".sidebar[data-drawer='half']"))?.[1]
    expect(Number(half)).toBeLessThanOrEqual(34)
    expect(narrowCss).toMatch(/--drawer-h:\s*30vh/)
  })
})

describe('贴底浮层同时避开抽屉与刘海', () => {
  const bottomAnchored = ['.map-overlay', '.map-tools', '.detail-card']

  /** 基础规则 + 窄屏覆盖一起看：窄屏没重写 bottom 就沿用基础规则里的避让。 */
  const combinedRule = (selector: string): string => {
    const base = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? ''
    const narrow = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(narrowCss)?.[0] ?? ''
    return `${base}\n${narrow}`
  }

  it('每条都吃到 --drawer-h 与 safe-area-inset-bottom', () => {
    for (const selector of bottomAnchored) {
      const rule = combinedRule(selector)
      expect(rule, selector).toContain('var(--drawer-h)')
      expect(rule, selector).toContain('env(safe-area-inset-bottom')
    }
  })

  it('页面声明了 viewport-fit=cover，env() 才有值', () => {
    expect(demoHtml).toMatch(/name="viewport"[^>]*viewport-fit=cover/)
  })
})

describe('窄屏顶栏与搜索不挤爆', () => {
  it('顶栏按 44px 搜索框长高，品牌名让位给搜索', () => {
    expect(narrowRule('.appbar')).toContain('calc(var(--appbar-h) + 8px)')
    expect(narrowRule('.campus-name')).toContain('display: none')
    expect(narrowRule('.searchbox')).toContain('flex: 1 1 auto')
    expect(narrowRule('#entity-search')).toContain('height: var(--tap)')
  })

  it('窄屏点击区 44px，打字时缩放不被 iOS 抢走', () => {
    expect(narrowCss).toMatch(/--tap:\s*44px/)
    // iOS 在字号 < 16px 的输入框上会自动放大页面；窄屏得把搜索框顶到 16px
    expect(narrowRule('#entity-search')).toContain('font-size: 16px')
    expect(css).toContain('touch-action: manipulation')
  })

  it('窄屏收起图例只留比例尺，别把地图糊满', () => {
    expect(narrowRule('.map-overlay .legend')).toContain('display: none')
    expect(css).toMatch(/\.map-scale\s*\{/)
  })
})

describe('窄屏卡片与抽屉不打架', () => {
  it('抽屉拉满时详情卡先收起，拉回半屏自己回来', () => {
    expect(narrowCss).toMatch(/\.sidebar\[data-drawer='full'\] ~ \.detail-card \{\s*display: none;/)
  })

  it('对象列表有高度上限，不会把抽屉撑成整屏', () => {
    expect(narrowRule('.entity-list')).toContain('max-height')
  })

  it('地图容器始终铺满，窄屏不靠 flex 给面板让位', () => {
    expect(css).toMatch(/\.map-pane \{\s*position: absolute;\s*inset: 0;/)
    expect(narrowCss).not.toMatch(/\.map-pane\s*\{[^}]*height:\s*\d/)
  })
})
