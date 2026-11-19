// @vitest-environment node
/**
 * 地图页布局守卫（docs/design-overview-v2.md §6.1 / §6.3 / §6.4）。
 *
 * 这几条是「地图永久占主视区、面板浮在图上、颜色只走令牌」的机器可读版本。
 * 谁把布局改回「标题页 + 挤出去的侧栏」、或者往样式里塞裸色值，这里先红。
 * 断言读的是源码文本，不是渲染结果——渲染一致性靠人眼与 s4 的回归截图。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const css = read('src/style.css')
/** 通用色板搬到 src/theme/tokens.css 了（地图页与 landing 同一张表），
    令牌相关的断言必须两张表一起看，否则会误判成「深色没覆盖」。 */
const tokensCss = read('src/theme/tokens.css')
const themedCss = `${tokensCss}\n${css}`
const mainTs = read('src/main.ts')
const demoHtml = read('demo.html')

/** 取出所有匹配选择器的令牌块，按出现顺序合并（同名的后者覆盖前者）。 */
function tokenEntries(source: string, selector: RegExp): Array<[string, string]> {
  const flags = selector.flags.includes('g') ? selector.flags : `${selector.flags}g`
  const re = new RegExp(selector.source, flags)
  const merged = new Map<string, string>()
  for (const match of source.matchAll(re)) {
    const start = match.index + match[0].length - 1
    let depth = 0
    let end = start
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) { end = i; break }
      }
    }
    for (const m of source.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      merged.set(m[1], m[2].trim())
    }
  }
  if (!merged.size) throw new Error(`找不到令牌块：${selector}`)
  return [...merged.entries()]
}

function tokenNames(source: string, selector: RegExp): string[] {
  return tokenEntries(source, selector).map(([name]) => name).sort()
}

/** 值里带 # 或 rgba() 的就是颜色/阴影令牌，这些必须深浅各写一套；px 之类是几何令牌，只声明一次。 */
const isThemeToken = ([, value]: [string, string]): boolean => /#|rgba?\(|hsla?\(/.test(value)

/** 去掉令牌块后的样式正文：这里不允许再出现裸色值。 */
function stripTokenBlocks(source: string): string {
  return source
    .replace(/^:root\s*\{[\s\S]*?\n\}/gm, '')
    .replace(/^:root\[data-theme='dark'\]\s*\{[\s\S]*?\n\}/gm, '')
}

const ruleFor = (selector: string): string => {
  const match = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(css)
  if (!match) throw new Error(`样式里没有这条规则：${selector}`)
  return match[0]
}

describe('地图占主视区，面板浮在图上', () => {
  it('地图容器铺满视口', () => {
    expect(ruleFor('.map-pane')).toContain('inset: 0')
    expect(mainTs).toContain('<div class="map-pane">')
  })

  it('桌面左栏是浮层，不靠 flex 挤压地图', () => {
    const sidebar = ruleFor('.sidebar')
    expect(sidebar).toContain('position: absolute')
    expect(sidebar).not.toContain('position: relative')
    // 地图页容器不允许出现「侧栏占一列」的栅格
    expect(css).not.toMatch(/#app\s*\{[^}]*display:\s*(flex|grid)/)
  })

  it('顶栏 48px，且品牌 / 搜索 / 主题都在里面', () => {
    expect(css).toMatch(/--appbar-h:\s*48px/)
    const appbar = mainTs.slice(mainTs.indexOf('<header class="appbar">'), mainTs.indexOf('</header>'))
    expect(appbar).toContain('class="brand"')
    expect(appbar).toContain('id="entity-search"')
    expect(appbar).toContain('id="theme-toggle"')
  })

  it('窄屏切底部抽屉，三档高度都写了', () => {
    expect(css).toMatch(/@media \(max-width: 959px\)/)
    expect(css).toMatch(/\.sidebar\[data-drawer='peek'\]/)
    expect(css).toMatch(/\.sidebar\[data-drawer='half'\]/)
    expect(css).toMatch(/\.sidebar\[data-drawer='full'\]/)
    expect(mainTs).toContain("['peek', 'half', 'full']")
    expect(mainTs).toContain('id="drawer-handle"')
  })
})

describe('窄屏抽屉能拖', () => {
  it('手柄自己吃手势，浏览器不许抢纵向拖动', () => {
    // pointerdown + setPointerCapture 只有拿到 touch-action: none 才不会被浏览器的
    // 纵向滚动抢走（抢走就是 pointercancel，表现成「点了没反应、拖不动」）
    // 窄屏那份规则在媒体查询里带缩进，正则得允许行首空白
    const handleRules = [...css.matchAll(/(^|\n)\s*\.drawer-handle\s*\{[^}]*\}/g)].map((m) => m[0])
    expect(handleRules.length).toBeGreaterThan(0)
    expect(handleRules.some((rule) => /touch-action:\s*none/.test(rule))).toBe(true)
    // 分组的 manipulation 规则里不许再出现它，否则两处声明靠顺序决胜负，迟早翻车
    const manipulationRule = /\.icon-button,[\s\S]*?touch-action:\s*manipulation;/.exec(css)?.[0] ?? ''
    expect(manipulationRule).not.toContain('.drawer-handle')
  })

  it('拖动期间关掉过渡，松手才吸附', () => {
    expect(css).toMatch(/\.sidebar\.dragging\s*\{[^}]*transition:\s*none/)
    expect(mainTs).toContain("classList.add('dragging')")
    expect(mainTs).toContain("classList.remove('dragging')")
  })

  it('CSS 三档高度与脚本里的吸附阈值是同一套数，别各写各的', () => {
    const cssHalf = /\.sidebar\[data-drawer='half'\]\s*\{[^}]*height:\s*([\d.]+)vh/.exec(css)?.[1]
    const tsHalf = /half:\s*'([\d.]+)vh'/.exec(mainTs)?.[1]
    const tsSnap = /half:\s*([\d.]+),/.exec(mainTs)?.[1]
    expect(cssHalf).toBeTruthy()
    expect(tsHalf).toBeTruthy()
    expect(tsSnap).toBeTruthy()
    expect(Number(tsHalf)).toBe(Number(cssHalf))
    expect(Number(tsSnap) * 100).toBeCloseTo(Number(cssHalf), 5)
    // half 档压到 1/3 屏以下，地图默认还是主视区
    expect(Number(cssHalf)).toBeLessThanOrEqual(34)
  })
})

describe('地图浮层：工具栏 / 图例 / 比例尺', () => {
  it('工具栏、图例与比例尺都浮在图上', () => {
    expect(mainTs).toContain('class="map-tools"')
    expect(mainTs).toContain('class="map-overlay"')
    expect(mainTs).toContain('class="map-scale-bar"')
    expect(ruleFor('.map-tools')).toContain('position: absolute')
    expect(ruleFor('.map-overlay')).toContain('position: absolute')
  })

  it('浮层会避开底部抽屉，别被抽屉盖住', () => {
    expect(css).toMatch(/--drawer-h/)
    expect(ruleFor('.map-overlay')).toContain('var(--drawer-h)')
    expect(mainTs).toContain('syncDrawerOffset')
  })
})

describe('颜色只走令牌', () => {
  it('深浅两套颜色令牌是同一张表，几何令牌只声明一次', () => {
    const light = tokenEntries(themedCss, /^:root\s*\{/m)
    const dark = tokenEntries(css, /^:root\[data-theme='dark'\]\s*\{/m)
    const themeTokens = light.filter(isThemeToken).map(([name]) => name).sort()
    expect(themeTokens.length).toBeGreaterThan(20)
    // 深色必须逐个覆盖浅色的颜色/阴影令牌，不许多也不许漏
    expect(tokenNames(themedCss, /^:root\[data-theme='dark'\]\s*\{/m)).toEqual(themeTokens)
    // 也不许冒出浅色表里没有的名字（拼错就红）
    const lightNames = new Set(light.map(([name]) => name))
    for (const [name] of dark) expect(lightNames.has(name)).toBe(true)
  })

  it('语义四组颜色都定义了（空闲 / 收藏 / 占用 / 告警）', () => {
    const light = tokenNames(themedCss, /^:root\s*\{/m)
    for (const name of ['--state-free', '--state-hold', '--state-busy', '--state-alert']) {
      expect(light).toContain(name)
    }
  })

  it('令牌块之外没有裸色值', () => {
    const body = stripTokenBlocks(themedCss)
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('地图页脚本里不写内联颜色', () => {
    expect(mainTs).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(mainTs).not.toMatch(/style="[^"]*color/)
  })
})

describe('触屏与无障碍', () => {
  it('窄屏点击区放大到 44px', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 959px)'))
    expect(narrow).toMatch(/--tap:\s*44px/)
  })

  it('地图页声明了视口与触屏缩放策略', () => {
    expect(demoHtml).toContain('name="viewport"')
    expect(css).toContain('touch-action: none')
    expect(css).toContain('touch-action: manipulation')
  })
})
