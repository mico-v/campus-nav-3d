#!/usr/bin/env node
/**
 * 真浏览器布局验收（docs/ui-redesign-v3.md §4 第 2 条 / 切片 s1）。
 *
 * 做四件事：
 * 1. 起一个只读静态服务指向 `dist/`（不依赖 `vite preview`，避开本机 networkInterfaces 报错）；
 * 2. 用 Playwright 在 320 / 768 / 1280 三档视口打开 `demo.html`，各截一张图到 `artifacts/ui-v3/`；
 * 3. 断言：无横向溢出、地图画布高度 ≥ 视口 70%、浮层盖住后露出的地图面积 ≥ 70%、
 *    窄屏抽屉默认 peek 且高度 ≤ 视口 14%、
 *    旁路 `plan.html` 链接 0 条（允许 site-nav 内 1 条 aside 出口）、
 *    站点导航恰好三入口且只有一条 aria-current、没有 WebGL 兜底页顶上来；
 *    编辑器页另跑一遍三入口与 plan 链接口径（切片 s1 要求三页都有同一份导航）；
 * 4. 打印一段能直接粘进 issue 的摘要。
 *
 * 装不上 Chromium / 起不来浏览器时**不伪造通过**：打 `skipped: <原因>` 并退出码 2。
 * 用法：先 `npm run build`，再 `npm run verify:ui`（或 `node scripts/verify-ui.mjs --dir dist`）。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const dirArg = argv.indexOf('--dir')
const distDir = resolve(process.cwd(), dirArg >= 0 ? argv[dirArg + 1] : 'dist')
const artifactsDir = resolve(process.cwd(), 'artifacts/ui-v3')
const VIEWPORTS = [
  { name: '320', width: 320, height: 720 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function skip(reason) {
  console.error(`skipped: ${reason}`)
  // 退出码 2 表示「没验成」——CI 里这是失败，别当绿灯
  process.exit(2)
}

if (!existsSync(join(distDir, 'demo.html'))) {
  fail(`找不到 ${join(distDir, 'demo.html')}，先跑 npm run build`)
}

/** 极简静态服务：只读 dist/，够 Playwright 拉 module / css / 资源。 */
function serve(dir) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let filePath = join(dir, urlPath)
    if (urlPath.endsWith('/')) filePath = join(filePath, 'index.html')
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(dir, 'index.html')
      if (!existsSync(filePath)) {
        res.writeHead(404).end('not found')
        return
      }
    }
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    createReadStream(filePath).pipe(res)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch (error) {
  skip(`playwright 没装上（${error instanceof Error ? error.message.split('\n')[0] : String(error)}）`)
}

mkdirSync(artifactsDir, { recursive: true })

const server = await serve(distDir)
const { port } = server.address()
const base = `http://127.0.0.1:${port}`

let browser
try {
  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
} catch (error) {
  server.close()
  skip(`Chromium 起不来（${error instanceof Error ? error.message.split('\n')[0] : String(error)}）`)
}

const rows = []
const problems = []

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  await page.goto(`${base}/demo.html`, { waitUntil: 'load' })
  // 地图与抽屉都是 rAF 驱动的，等一帧再量尺寸
  await page.waitForTimeout(1200)

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('.map-pane canvas')
    const nav = document.querySelector('.site-nav')
    const fallback = document.querySelector('.webgl-fallback')
    const sidebar = document.querySelector('.sidebar')
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      mapHeight: canvas?.getBoundingClientRect().height ?? 0,
      drawerState: sidebar?.dataset.drawer ?? null,
      drawerHeight: sidebar?.getBoundingClientRect().height ?? 0,
      drawerWidth: sidebar?.getBoundingClientRect().width ?? 0,
      navLinks: document.querySelectorAll('.site-nav a').length - document.querySelectorAll('.site-nav a.site-nav-aside').length,
      navCurrent: document.querySelectorAll('.site-nav a[aria-current="page"]').length,
      planAside: document.querySelectorAll('.site-nav a.site-nav-aside[href$="plan.html"]').length,
      planLinks: document.querySelectorAll('a[href$="plan.html"]').length - document.querySelectorAll('.site-nav a.site-nav-aside[href$="plan.html"]').length,
      backHome: document.querySelectorAll('.back-home').length,
      fallbackReason: fallback ? (fallback.textContent ?? '').trim().slice(0, 200) : null,
    }
  })

  const mapRatio = metrics.innerHeight > 0 ? metrics.mapHeight / metrics.innerHeight : 0
  // 画布本来就是满屏，真正决定「地图看着有多大」的是没被浮层盖住的那一块。
  // 窄屏是满宽的底部抽屉，按高度算就够；桌面是浮在左侧的一列，只看高度会把 732px
  // 的侧栏误判成「地图被盖住 91%」，所以统一按面积算。
  const narrow = metrics.innerWidth <= 959
  const viewArea = metrics.innerWidth * metrics.innerHeight
  const coveredArea = metrics.drawerHeight * metrics.drawerWidth
  const unobstructedRatio = viewArea > 0 ? Math.max(0, 1 - coveredArea / viewArea) : 0
  const label = `${viewport.name}px`
  const row = {
    viewport: label,
    mapHeight: Math.round(metrics.mapHeight),
    mapRatio: `${(mapRatio * 100).toFixed(1)}%`,
    drawer: `${narrow ? 'drawer' : 'pane'} ${Math.round(metrics.drawerWidth)}x${Math.round(metrics.drawerHeight)}`,
    openRatio: `${(unobstructedRatio * 100).toFixed(1)}%`,
    overflow: metrics.scrollWidth - metrics.innerWidth,
    navLinks: metrics.navLinks,
    planLinks: metrics.planLinks,
    result: 'pass',
  }

  if (metrics.scrollWidth > metrics.innerWidth) problems.push(`${label}: 横向溢出 ${row.overflow}px`)
  if (metrics.fallbackReason !== null) problems.push(`${label}: 出现 WebGL 兜底页 —— ${metrics.fallbackReason}`)
  if (mapRatio < 0.7) problems.push(`${label}: 地图画布高度 ${row.mapRatio} < 70%`)
  // 「抽屉默认 peek」是窄屏口径；桌面是浮在图上的一列，不参与抽屉三档
  if (narrow && metrics.drawerState !== 'peek') problems.push(`${label}: 抽屉默认档是 ${metrics.drawerState}（应为 peek）`)
  if (unobstructedRatio < 0.7) problems.push(`${label}: 浮层盖掉 ${((1 - unobstructedRatio) * 100).toFixed(1)}%，露出地图 < 70%`)
  if (narrow && metrics.drawerHeight > metrics.innerHeight * 0.14) problems.push(`${label}: 默认抽屉高 ${Math.round(metrics.drawerHeight)}px，超过视口 14%`)
  if (metrics.navLinks !== 3) problems.push(`${label}: 站点导航入口 ${metrics.navLinks} 个（应为 3）`)
  if (metrics.navCurrent !== 1) problems.push(`${label}: aria-current 标记 ${metrics.navCurrent} 个（应为 1）`)
  if (metrics.planLinks !== 0) problems.push(`${label}: 地图页仍有 ${metrics.planLinks} 条旁路 plan.html 链接`)
  if (metrics.backHome !== 0) problems.push(`${label}: 仍有 .back-home 孤立出口`)
  for (const error of consoleErrors) problems.push(`${label}: 控制台 error —— ${error}`)

  if (problems.some((item) => item.startsWith(`${label}:`))) row.result = 'fail'
  rows.push(row)

  const shot = join(artifactsDir, `ui-v3-${viewport.name}.png`)
  await page.screenshot({ path: shot, fullPage: false })
  await context.close()
}

// 编辑器页也要挂同一份三入口导航，且应用内不许出现 plan.html（docs/ui-redesign-v3.md §2）
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`${base}/editor.html`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const editor = await page.evaluate(() => ({
    navLinks: document.querySelectorAll('.site-nav a').length - document.querySelectorAll('.site-nav a.site-nav-aside').length,
    navCurrent: document.querySelectorAll('.site-nav a[aria-current="page"]').length,
    currentHref: document.querySelector('.site-nav a[aria-current="page"]')?.getAttribute('href') ?? null,
    planAside: document.querySelectorAll('.site-nav a.site-nav-aside[href$="plan.html"]').length,
    planLinks: document.querySelectorAll('a[href$="plan.html"]').length - document.querySelectorAll('.site-nav a.site-nav-aside[href$="plan.html"]').length,
  }))
  rows.push({
    viewport: 'editor',
    mapHeight: '-',
    mapRatio: '-',
    drawer: '-',
    openRatio: '-',
    overflow: '-',
    navLinks: editor.navLinks,
    planLinks: editor.planLinks,
    result: 'pass',
  })
  if (editor.navLinks !== 3) problems.push(`editor: 站点导航入口 ${editor.navLinks} 个（应为 3）`)
  if (editor.navCurrent !== 1) problems.push(`editor: aria-current 标记 ${editor.navCurrent} 个（应为 1）`)
  if (editor.currentHref !== './editor.html') problems.push(`editor: aria-current 指向 ${editor.currentHref}（应为 ./editor.html）`)
  if (editor.planLinks !== 0) problems.push(`editor: 仍有 ${editor.planLinks} 条旁路 plan.html 链接`)
  if (problems.some((item) => item.startsWith('editor:'))) rows.at(-1).result = 'fail'
  await page.screenshot({ path: join(artifactsDir, 'ui-v3-editor.png'), fullPage: false })
  await context.close()
}

await browser.close()
server.close()

console.log('\n=== UI v3 真浏览器验收 ===')
console.log('视口    | 地图高度 | 地图占比 | 浮层         | 露出地图 | 溢出 | 导航 | plan | 结果')
for (const row of rows) {
  console.log(
    `${row.viewport.padEnd(7)} | ${String(row.mapHeight).padStart(8)} | ${row.mapRatio.padStart(8)} | ${row.drawer.padEnd(11)} | ${row.openRatio.padStart(8)} | ${String(row.overflow).padStart(4)} | ${String(row.navLinks).padStart(4)} | ${String(row.planLinks).padStart(4)} | ${row.result}`,
  )
}
console.log(`截图：${artifactsDir}/ui-v3-{320,768,1280,editor}.png`)

if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} 项不通过：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\n✓ 三档全部通过：无溢出、地图 ≥ 70% 视口、露出的地图 ≥ 70%、窄屏抽屉默认 peek、三入口并列、应用内 0 条旁路 plan.html（aside 出口允许 1 条）')
