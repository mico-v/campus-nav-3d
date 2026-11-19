// @vitest-environment node
/**
 * 地图页深浅主题守卫（docs/design-overview-v2.md §6.1 第 5 条 / §6.2 / §6.4）。
 *
 * 要求三件事，缺一条首屏就会闪白或者颜色跑偏：
 * 1. 通用令牌只有一张表（src/theme/tokens.css），地图页与 landing 都从它取；
 * 2. demo.html 在样式表之前内联回放主题，并按主题写好 theme-color；
 * 3. 主题切换按钮的显示状态与 theme-color 跟着一起变，且颜色取自令牌。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

const tokensCss = read('src/theme/tokens.css')
const styleCss = read('src/style.css')
const landingCss = read('src/landing/landing.css')
const demoHtml = read('demo.html')
const mainTs = read('src/main.ts')

/** 取某套主题下某个令牌的值（浅色取 `:root`，深色取 `:root[data-theme='dark']`）。 */
function tokenValue(source: string, selector: string, name: string): string {
  const at = source.indexOf(selector)
  if (at < 0) throw new Error(`找不到令牌块：${selector}`)
  const start = source.indexOf('{', at)
  const block = source.slice(start, source.indexOf('\n}', start))
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block)
  if (!match) throw new Error(`${selector} 里没有 ${name}`)
  return match[1].trim()
}

describe('通用令牌只有一张表', () => {
  it('地图页与 landing 都从 src/theme/tokens.css 取通用色板', () => {
    expect(styleCss.trimStart().startsWith("@import './theme/tokens.css';")).toBe(true)
    expect(landingCss.trimStart().startsWith("@import '../theme/tokens.css';")).toBe(true)
  })

  it('页面 CSS 不再各自重复声明通用令牌', () => {
    for (const name of ['--bg', '--surface', '--ink', '--outline', '--primary', '--shadow-1']) {
      expect(tokensCss).toMatch(new RegExp(`${name}\\s*:`))
      expect(styleCss).not.toMatch(new RegExp(`^\\s*${name}\\s*:`, 'm'))
      expect(landingCss).not.toMatch(new RegExp(`^\\s*${name}\\s*:`, 'm'))
    }
  })

  it('深色覆盖浅色的颜色令牌，几何令牌只在共享表里声明一次', () => {
    const lightBlock = tokensCss.slice(tokensCss.indexOf(':root {'), tokensCss.indexOf(":root[data-theme='dark']"))
    const lightColors = [...lightBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .filter(([, , value]) => /#|rgba?\(|hsla?\(/.test(value))
      .map(([, name]) => name)
      .sort()
    const darkNames = [...tokensCss.slice(tokensCss.indexOf(":root[data-theme='dark']")).matchAll(/(--[a-z0-9-]+)\s*:/g)]
      .map(([, name]) => name)
      .sort()
    expect(lightColors.length).toBeGreaterThan(10)
    expect(darkNames).toEqual(lightColors)
  })
})

describe('首屏零闪白', () => {
  it('demo.html 声明主题属性并内联回放脚本', () => {
    expect(demoHtml).toMatch(/<html[^>]*data-theme="light"/)
    expect(demoHtml).toContain("localStorage.getItem('campusnav-theme')")
    expect(demoHtml).toContain('prefers-color-scheme: dark')
  })

  it('主题脚本在样式表与模块脚本之前执行', () => {
    const scriptAt = demoHtml.indexOf("localStorage.getItem('campusnav-theme')")
    const moduleAt = demoHtml.indexOf('/src/main.ts')
    expect(scriptAt).toBeGreaterThan(0)
    expect(scriptAt).toBeLessThan(moduleAt)
  })

  it('theme-color 的浅深值与令牌里的 --bg 一致', () => {
    expect(demoHtml).toContain('name="theme-color"')
    expect(demoHtml).toContain(tokenValue(tokensCss, ':root {', '--bg'))
    expect(demoHtml).toContain(tokenValue(tokensCss, ":root[data-theme='dark'] {", '--bg'))
  })

  it('壳内（?shell=1）标记仍在首屏脚本里设置', () => {
    expect(demoHtml).toContain("new URLSearchParams(location.search).get('shell')")
    expect(demoHtml).toContain("document.documentElement.dataset.shell = '1'")
    expect(styleCss).toMatch(/html\[data-shell='1'\]\s*\.back-home\s*\{\s*display:\s*none/)
  })
})

describe('主题切换按钮', () => {
  it('按钮在顶栏里，带无障碍标签与按下态', () => {
    const appbar = mainTs.slice(mainTs.indexOf('<header class="appbar">'), mainTs.indexOf('</header>'))
    expect(appbar).toContain('id="theme-toggle"')
    expect(appbar).toMatch(/aria-label="[^"]*主题"/)
    expect(mainTs).toContain("setAttribute('aria-pressed'")
  })

  it('切换时同步 theme-color，且颜色取自 --bg 令牌而不是写死色值', () => {
    expect(mainTs).toContain('meta[name="theme-color"]')
    expect(mainTs).toContain("getPropertyValue('--bg')")
    expect(mainTs).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('用户没手动选过时跟着系统主题走', () => {
    expect(mainTs).toContain("addEventListener('change'")
    expect(mainTs).toContain("if (!readStoredTheme())")
  })
})

describe('浮层也跟着主题走', () => {
  it('回到项目首页的按钮不再写内联颜色，改用令牌', () => {
    expect(demoHtml).not.toMatch(/<style[\s\S]*?back-home[\s\S]*?<\/style>/)
    expect(styleCss).toMatch(/\.back-home\s*\{[^}]*var\(--panel-bg\)/)
    expect(styleCss).toMatch(/\.back-home\s*\{[^}]*color:\s*var\(--ink\)/)
  })

  it('窄屏下按钮抬到抽屉之上，避免被盖住', () => {
    const narrow = styleCss.slice(styleCss.indexOf('@media (max-width: 959px)'))
    expect(narrow).toMatch(/\.back-home\s*\{[^}]*var\(--drawer-h\)/)
  })
})
