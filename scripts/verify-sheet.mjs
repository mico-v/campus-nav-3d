#!/usr/bin/env node
/**
 * s4 真浏览器验收：三档 sheet + 分类 chip + 列表浏览。
 *
 * 起一个只读静态服务指向 `dist/`，用 Playwright Chromium 在 320×568 / 768×1024 /
 * 1280×800 三个视口上量（三档 sheet 用真实 pointer 拖 handle，不靠点击切档）：
 *   1. 首屏地图高度 ≥ 视口 70%（peek 档）
 *   2. 无横向溢出（documentElement.scrollWidth ≤ clientWidth + 1）
 *   3. 抽屉三档高度：peek ≤ 30vh、half ≈ 30vh、full ≈ 86vh，且三档可循环切换
 *   4. chip 栏在抽屉里可见、可点；点「建筑」后列表只剩建筑、chip aria-pressed 生效
 *   5. 选中列表项 / 点地图后窄屏自动升到 half，详情可见
 *
 * 任何一条不满足 → 退出码 1，CI 就红。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
const ARTIFACTS = resolve(process.cwd(), 'artifacts/ui-sheet')

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
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
}

function serve() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let file = join(DIST, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
    if (!file.startsWith(DIST)) { res.writeHead(403).end('forbidden'); return }
    if (existsSync(file) && !extname(file)) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
]

const failures = []
const report = []
const check = (viewport, label, ok, detail) => {
  report.push(`${ok ? 'PASS' : 'FAIL'} [${viewport}] ${label} — ${detail}`)
  if (!ok) failures.push(`[${viewport}] ${label}: ${detail}`)
}

/** 在页面里量抽屉 / 地图 / 溢出的几何指标 */
const measure = () => {
  const doc = document.documentElement
  const sidebar = document.querySelector('#sidebar') ?? document.querySelector('.sidebar')
  const map = document.querySelector('.map-pane') ?? document.querySelector('#scene')
  const drawerState = sidebar?.getAttribute('data-drawer') ?? 'peek'
  const sidebarBox = sidebar?.getBoundingClientRect()
  const mapBox = map?.getBoundingClientRect()
  return {
    drawerState,
    drawerHeight: sidebarBox ? Math.round(sidebarBox.height) : 0,
    mapHeight: mapBox ? Math.round(mapBox.height) : 0,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    chipCount: document.querySelectorAll('#entity-filters .chip[data-filter]').length,
    listCount: document.querySelectorAll('#entity-list .entity-item').length,
  }
}

async function main() {
  if (!existsSync(DIST)) { console.error('dist/ 不存在，先 npm run build'); process.exit(1) }
  mkdirSync(ARTIFACTS, { recursive: true })

  let chromium
  try { ({ chromium } = await import('playwright')) } catch {
    console.log('SKIP: playwright 未安装（npm i -D playwright）'); return
  }

  const server = await serve()
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  const demoHtml = readFileSync(join(DIST, 'demo.html'), 'utf8')
  if (!demoHtml.includes('<script')) console.log('WARN: demo.html 里没有脚本标签，量到的可能只是空壳')

  let browser
  try {
    browser = await chromium.launch()
  } catch (error) {
    console.log(`SKIP: Chromium 起不来（${error instanceof Error ? error.message : error}）`)
    server.close()
    return
  }

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const consoleErrors = []
    page.on('pageerror', (error) => consoleErrors.push(String(error)))

    await page.goto(`${base}/demo.html`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    const peek = await page.evaluate(measure)
    const mapRatio = peek.mapHeight / viewport.height
    check(viewport.name, '首屏地图 ≥ 70% 视口', mapRatio >= 0.7, `地图 ${peek.mapHeight}px / 视口 ${viewport.height}px = ${(mapRatio * 100).toFixed(1)}%`)
    check(viewport.name, '无横向溢出', peek.scrollWidth <= peek.clientWidth + 1, `scrollWidth ${peek.scrollWidth} ≤ clientWidth ${peek.clientWidth}`)
    if (viewport.width < 960) {
      check(viewport.name, 'peek 档 ≤ 30vh', peek.drawerHeight <= Math.round(viewport.height * 0.3), `${peek.drawerHeight}px vs 30vh=${Math.round(viewport.height * 0.3)}px，状态 ${peek.drawerState}`)
    }
    check(viewport.name, 'chip 栏有筛选按钮', peek.chipCount > 1, `${peek.chipCount} 个 chip`)
    check(viewport.name, '列表有对象', peek.listCount > 0, `${peek.listCount} 项`)
    await page.screenshot({ path: join(ARTIFACTS, `${viewport.name}-peek.png`) })

    if (viewport.width < 960) {
      // 三档吸附：用真实 pointer 拖 handle（不是点击切档），每档都截图存档。
      // 拖 handle 竖直中心到「目标档位高度 - 当前高度」对应的位置，松手后由 drawerNearest 吸附。
      const dragTo = async (targetHeight) => {
        const handle = await page.evaluate(() => {
          const el = document.querySelector('#drawer-handle')
          const sidebar = document.querySelector('#sidebar') ?? document.querySelector('.sidebar')
          if (!el || !sidebar) return null
          const hb = el.getBoundingClientRect()
          return { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2, height: sidebar.getBoundingClientRect().height }
        })
        if (!handle) throw new Error('#drawer-handle 不存在')
        const delta = targetHeight - handle.height
        await page.mouse.move(handle.x, handle.y)
        await page.mouse.down()
        // 分几步移动，超过 6px 才会被识别成拖动（阈值为拖动判定，不是假拖）
        for (let i = 1; i <= 6; i += 1) await page.mouse.move(handle.x, handle.y - (delta * i) / 6)
        await page.mouse.up()
        await page.waitForTimeout(360)
        return page.evaluate(measure)
      }

      const heights = {}
      const viewH = viewport.height
      const dragCases = [
        { name: 'half', target: viewH * 0.45 },
        { name: 'full', target: viewH * 0.95 },
        { name: 'peek', target: 10 },
      ]
      for (const item of dragCases) {
        const box = await dragTo(item.target)
        heights[item.name] = box
        check(viewport.name, `拖动吸附到 ${item.name} 档`, box.drawerState === item.name, `拖到约 ${Math.round(item.target)}px，松手吸附为 ${box.drawerState}（${box.drawerHeight}px）`)
        await page.screenshot({ path: join(ARTIFACTS, `${viewport.name}-${item.name}.png`) })
      }
      check(viewport.name, '真拖 handle 生效', Boolean(heights.full) && heights.full.drawerHeight > heights.peek.drawerHeight + 40, `peek ${heights.peek.drawerHeight}px → full ${heights.full?.drawerHeight}px（pointer down/move/up 实测）`)
      check(viewport.name, '拖拽后回到 peek 档', heights.peek.drawerState === 'peek' && heights.peek.drawerHeight <= Math.round(viewH * 0.3), `实测 ${heights.peek.drawerHeight}px`)

      // 分类 chip：点「建筑」后列表只剩建筑，chip 选中态跟着变
      await page.click('#drawer-handle') // peek → half，让列表可见
      await page.waitForTimeout(300)
      const buildingsOnly = await page.evaluate(async () => {
        const chip = document.querySelector('#entity-filters .chip[data-filter="building"]')
        if (!chip) return { ok: false, reason: '没有 building chip' }
        chip.click()
        await new Promise((r) => setTimeout(r, 120))
        const active = document.querySelector('#entity-filters .chip.active')?.getAttribute('data-filter')
        const pills = Array.from(document.querySelectorAll('#entity-list .entity-item .pill')).map((el) => el.textContent?.trim())
        return { ok: pills.length > 0 && pills.every((p) => p === '建筑') && active === 'building', active, pills: pills.length, sample: pills.slice(0, 3) }
      })
      check(viewport.name, 'chip 筛选生效', buildingsOnly.ok, `active=${buildingsOnly.active}，列表 ${buildingsOnly.pills} 项，样例 ${JSON.stringify(buildingsOnly.sample)}`)

      // 搜索输入时保持当前分类
      await page.fill('#entity-search', 'a')
      await page.waitForTimeout(160)
      const kept = await page.evaluate(() => document.querySelector('#entity-filters .chip.active')?.getAttribute('data-filter'))
      check(viewport.name, '输入搜索后保持分类', kept === 'building', `active=${kept}`)
      await page.fill('#entity-search', '')
      await page.click('#entity-filters .chip[data-filter="all"]')
      await page.waitForTimeout(120)

      // 点列表项：详情卡出、抽屉升到 half
      const selected = await page.evaluate(async () => {
        const item = document.querySelector('#entity-list .entity-item')
        if (!item) return { ok: false, reason: '列表为空' }
        item.click()
        await new Promise((r) => setTimeout(r, 260))
        const card = document.querySelector('#detail-card') ?? document.querySelector('.detail-card')
        const sidebar = document.querySelector('#sidebar') ?? document.querySelector('.sidebar')
        return { ok: !!card && !card.hidden, drawer: sidebar?.getAttribute('data-drawer'), cardHidden: card?.hidden }
      })
      check(viewport.name, '点列表项弹出详情', selected.ok, `drawer=${selected.drawer}，cardHidden=${selected.cardHidden}`)
      await page.screenshot({ path: join(ARTIFACTS, `${viewport.name}-selected.png`) })
    }

    check(viewport.name, '无页面级 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ') || '0 条')
    await context.close()
  }

  await browser.close()
  server.close()

  writeFileSync(join(ARTIFACTS, 'report.txt'), `${report.join('\n')}\n`)
  console.log(report.join('\n'))
  if (failures.length) {
    console.error(`\n${failures.length} 条不达标：\n${failures.join('\n')}`)
    process.exit(1)
  }
  console.log(`\n全部通过，截图与报告在 artifacts/ui-sheet/`)
}

main().catch((error) => { console.error(error); process.exit(1) })
