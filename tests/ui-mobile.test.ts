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
  it('peek / half / full 的高度对得上', () => {
    const pairs: Array<[string, string, number]> = [
      ['peek', 'peek', 0],
      ['half', 'half', 30],
      ['full', 'full', 86],
    ]
    for (const [state, tsKey, vh] of pairs) {
      const rule = narrowRule(`.sidebar[data-drawer='${state}']`)
      if (state === 'peek') {
        // peek 只留手柄高度，别留一条空白缝；高度由令牌给，脚本不再抄一份数字
        expect(rule).toContain('height: var(--drawer-peek-height)')
        expect(mainTs).toContain("peek: 'var(--drawer-peek-height)'")
        expect(css).toMatch(/--drawer-peek-height:\s*calc\(var\(--tap\) \+ 6px\)/)
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
  })

  it('默认是 peek 档：首屏不展开面板，地图是主视区', () => {
    // 面板初始档位写在 HTML 里，脚本的兜底值也得跟它一致，否则 syncDrawerOffset 会按 half 算
    expect(mainTs).toContain('data-drawer="peek"')
    expect(narrowCss).toMatch(/--drawer-h:\s*var\(--drawer-peek-height\)/)
    expect(mainTs).toContain("?? 'peek'")
    expect(mainTs).not.toContain("?? 'half'")
  })
})

describe('贴底浮层同时避开抽屉与刘海', () => {
  const bottomAnchored = ['.detail-card']

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

  it('窄屏抽屉坐在状态条上沿，两者不重叠', () => {
    expect(narrowRule('.sidebar')).toContain('bottom: var(--status-bar-block-height)')
    expect(ruleForStatusBar()).toContain('bottom: 0')
  })
})

function ruleForStatusBar(): string {
  const match = /(^|\n)\.status-bar\s*\{[^}]*\}/.exec(css)
  if (!match) throw new Error('样式里没有 .status-bar 规则')
  return match[0]
}

describe('窄屏顶栏与搜索不挤爆', () => {
  it('顶栏按 44px 搜索框长高，品牌名让位给搜索', () => {
    // 窄屏顶栏 = 桌面档 + 8px，差值走令牌，规则里不再散落魔法算式
    expect(css).toContain('--appbar-h-narrow: calc(var(--appbar-h) + 8px)')
    expect(narrowRule('.appbar')).toContain('height: var(--appbar-h-narrow)')
    expect(narrowRule('.sb-credit-dim')).toContain('display: none')
    expect(narrowRule('.searchbox')).toContain('flex: 1 1 auto')
    expect(narrowRule('#entity-search')).toContain('height: var(--tap)')
  })

  it('窄屏点击区 44px，打字时缩放不被 iOS 抢走', () => {
    expect(narrowCss).toMatch(/--tap:\s*44px/)
    // iOS 在字号 < 16px 的输入框上会自动放大页面；窄屏得把搜索框顶到 16px
    expect(narrowRule('#entity-search')).toContain('font-size: 16px')
    expect(css).toContain('touch-action: manipulation')
  })

  it('窄屏状态条收起图例，只留署名 / 状态 / 比例尺 / 工具', () => {
    expect(narrowRule('.sb-legend')).toContain('display: none')
    expect(css).toMatch(/\.map-scale\s*\{/)
    expect(narrowRule('.status-bar')).toContain('padding')
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

describe('顶栏与状态条不为挤字幕让位', () => {
  const siteNavCss = read('src/ui/site-nav.css')

  it('顶栏定死一行：宽度不够时只挤站点导航，不把搜索框截断', () => {
    // 截图回归：导航占宽 + 搜索框被压 → 「搜索建筑 / 地」被裁成半截
    expect(narrowRule('.appbar')).toContain('flex-wrap: nowrap')
    expect(siteNavCss).toContain('flex: 0 1 auto')
    // 手机档导航整组收起，宽度全留给搜索框（三入口在抽屉 / 落地页仍有出口）
    const phoneCss = siteNavCss.slice(siteNavCss.indexOf('@media (max-width: 560px)'))
    expect(phoneCss).toMatch(/\.site-nav \{\s*display: none;/)
  })

  it('站点导航自己可省略，但不撑破顶栏', () => {
    expect(siteNavCss).toMatch(/\.site-nav \{[^}]*min-width: 0;[^}]*overflow: hidden;/)
    expect(siteNavCss).toMatch(/\.site-nav a \{[^}]*text-overflow: ellipsis;/)
  })

  it('状态条的选中对象不省略、最多折两行，名称必须可读', () => {
    // 截图回归：底部只剩「已选…」，看不出选中了哪栋楼
    expect(css).toMatch(/\.sb-status \{[^}]*white-space: normal;/)
    expect(css).toMatch(/\.sb-status \{[^}]*text-overflow: clip;/)
    expect(css).toMatch(/\.sb-status \{[^}]*flex: 1 1 auto;/)
    expect(css).toMatch(/-webkit-line-clamp: 2;/)
  })
})
