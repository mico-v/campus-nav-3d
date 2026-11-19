// @vitest-environment node
/**
 * 站点导航守卫（docs/ui-redesign-v3.md §2，切片 s1）。
 *
 * 钉住四条口径，任何一条被改回去都算回归：
 * 1. 三入口并列：项目首页 / 3D 地图 / 地图编辑器，同一个 `site-nav` 里显示，当前页带 aria-current；
 * 2. 应用内（demo / editor）不出现 `plan.html` —— 计划书只作为 Pages 独立页存在；
 * 3. 地图页不再有「← 项目首页」这种孤立出口，也不挂站点页脚；
 * 4. 站点首页仍能到达 `plan.html`，且站点导航真的被三个页面用上了（不是写了没接）。
 *
 * 注意：只扫 `index.html` / `demo.html` / `editor.html` 与 `src/`（不含 tests、docs），
 * 免得断言去匹配到测试文件自身而变成假绿。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_NAV_ENTRIES, siteNavHtml } from '../src/ui/site-nav'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

const indexHtml = read('index.html')
const demoHtml = read('demo.html')
const editorHtml = read('editor.html')
const mainTs = read('src/main.ts')
const editorTs = read('src/editor/main.ts')
const navCss = read('src/ui/site-nav.css')

/** 数某个子串出现几次 */
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1

/**
 * 去掉注释再扫，避免「注释里提了一句就被判成引用」的假红（也不至于因为写了注释就漏掉真链接）。
 * 只处理 // 与 /* *\/ 两种，够用：源码里没有字符串里带 // 的写法。
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 「真的当链接/路径用」的写法：引号/括号/模板串插值结尾接的 plan.html，或者 href 里指向它 */
const PLAN_LINK_RE = /["'`(}]\.?\/?plan\.html|href=["'][^"']*plan\.html/

/** 递归收集 src/ 下的源码文件（不含 node_modules / dist，反正它们不在 src 下） */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(repoRoot, dir))) {
    const rel = `${dir}/${name}`
    const stat = statSync(join(repoRoot, rel))
    if (stat.isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.(ts|tsx|js|mjs|css|html)$/.test(name)) out.push(rel)
  }
  return out
}

const SITE_PAGES = ['./index.html', './demo.html', './editor.html']

describe('三入口并列', () => {
  it('入口表就是 index / demo / editor 三个，顺序和标签固定', () => {
    expect(SITE_NAV_ENTRIES.map((entry) => entry.href)).toEqual(SITE_PAGES)
    expect(SITE_NAV_ENTRIES.map((entry) => entry.key)).toEqual(['index', 'demo', 'editor'])
    for (const entry of SITE_NAV_ENTRIES) expect(entry.label.trim().length).toBeGreaterThan(0)
    expect(SITE_NAV_ENTRIES.some((entry) => entry.href.includes('plan'))).toBe(false)
  })

  it('每个页面渲染出的导航都含齐全的四个链接位：三个入口、且只有一个 aria-current', () => {
    for (const key of ['index', 'demo', 'editor'] as const) {
      const html = siteNavHtml(key)
      expect(html, key).toContain('<nav class="site-nav" aria-label="站点导航">')
      for (const href of SITE_PAGES) expect(html, key).toContain(`href="${href}"`)
      expect(count(html, 'aria-current="page"'), key).toBe(1)
      expect(html, key).toContain(`href="./${key}.html" aria-current="page"`)
    }
  })

  it('导航真的被三个页面接上了，不只是写了个没人用的模块', () => {
    expect(mainTs).toContain("import './ui/site-nav.css'")
    expect(mainTs).toContain("siteNavHtml('demo')")
    expect(editorTs).toContain("import '../ui/site-nav.css'")
    expect(editorTs).toContain("siteNavHtml('editor')")

    // 首页是静态 HTML，锚点集合要与模块渲染结果一致
    expect(indexHtml).toContain('href="./src/ui/site-nav.css"')
    for (const href of SITE_PAGES) expect(indexHtml).toContain(`href="${href}"`)
    expect(indexHtml).toContain('<a href="./index.html" aria-current="page">')
  })
})

describe('计划书只在 Pages 上独立可达', () => {
  it('地图页与编辑器页 0 条 plan.html 链接', () => {
    expect(count(demoHtml, 'plan.html')).toBe(0)
    expect(count(editorHtml, 'plan.html')).toBe(0)
  })

  it('应用源码（src/，含地图页与编辑器）里没有 plan.html 引用', () => {
    const offenders = sourceFiles()
      .filter((rel) => PLAN_LINK_RE.test(stripComments(read(rel))))
      .map((rel) => relative(repoRoot, join(repoRoot, rel)))
    expect(offenders).toEqual([])
  })

  it('守卫本身不是假绿：真正的引用会被抓到', () => {
    // 正样本：href / import / 拼接出来的路径
    for (const sample of [
      '<a href="./plan.html">计划书</a>',
      "const url = './plan.html'",
      'const link = `${base}plan.html`',
      "import './plan.html'",
    ]) {
      expect(PLAN_LINK_RE.test(stripComments(sample)), sample).toBe(true)
    }
    // 负样本：只在注释、或者别的文件名里提到
    expect(PLAN_LINK_RE.test(stripComments('/* 计划书 plan.html 不进口应用 */'))).toBe(false)
    expect(PLAN_LINK_RE.test(stripComments('// 见 plan.html\nconst a = 1'))).toBe(false)
    expect(PLAN_LINK_RE.test(stripComments("const p = './plane.html'"))).toBe(false)
  })

  it('站点首页仍然能点到计划书', () => {
    expect(indexHtml).toContain('href="./plan.html"')
  })
})

describe('地图页不挂站点外壳', () => {
  it('没有「← 项目首页」孤立出口', () => {
    for (const [name, html] of [['demo.html', demoHtml], ['editor.html', editorHtml]] as const) {
      expect(html, name).not.toContain('back-home')
      expect(html, name).not.toContain('项目首页')
    }
  })

  it('地图页没有站点页脚', () => {
    expect(demoHtml).not.toContain('<footer')
    expect(editorHtml).not.toContain('<footer')
  })

  it('壳内（?shell=1）整套站点导航隐藏，只留地图', () => {
    expect(navCss).toMatch(/html\[data-shell='1'\]\s*\.site-nav\s*\{\s*display:\s*none/)
  })
})
