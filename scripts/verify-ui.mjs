#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'artifacts', 'ui-v3')
const viewports = [
  { width: 320, height: 720 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]
const host = '127.0.0.1'
const port = 4317
const base = `http://${host}:${port}`
const expectedRatios = { peek: 0.16, half: 0.52, full: 0.86 }
const tolerance = 0.02

const fail = (reason) => {
  console.log(`skipped: ${reason}`)
  process.exit(2)
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base + '/demo.html')
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error(`preview server did not become ready at ${base}`)
}

async function startPreview() {
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const proc = spawn(process.execPath, [viteBin, 'preview', '--host', host, '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  })
  try {
    await waitForServer()
    return { proc, mode: 'vite preview' }
  } catch (error) {
    proc.kill('SIGTERM')
    throw error
  }
}

async function launchChromium() {
  try {
    return await import('playwright')
  } catch (error) {
    fail(`playwright not installed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const { chromium } = await launchChromium()
const executablePath = process.env.CHROMIUM_PATH ?? (exists('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined)

function exists(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function openBrowser() {
  try {
    return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  } catch (error) {
    const cache = join(homedir(), '.cache', 'ms-playwright')
    fail(`Chromium unavailable; cache=${cache}; ${error instanceof Error ? error.message : String(error)}`)
  }
}

const browser = await openBrowser()
mkdirSync(artifacts, { recursive: true })

let preview
const rows = []
let failed = false

const near = (value, target) => Math.abs(value - target) <= tolerance
const ANCHOR_TOLERANCE_PX = 2

async function snapshot(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('#detail-sheet')
    if (!sheet) return null
    const rect = sheet.getBoundingClientRect()
    const fact = sheet.querySelector('.detail-fact')
    const factRect = fact?.getBoundingClientRect()
    const sheetRectTop = rect.top
    return {
      state: sheet.dataset.sheet,
      height: rect.height,
      top: rect.top,
      bottomGap: window.innerHeight - rect.bottom,
      viewportHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      factText: fact?.textContent?.trim() ?? '',
      factVisible: Boolean(factRect && factRect.top >= sheetRectTop && factRect.bottom <= window.innerHeight + 1),
      itemCount: sheet.querySelectorAll('#entity-list .entity-item').length,
      selectedCount: sheet.querySelectorAll('#entity-list .entity-item.selected').length,
    }
  })
}

try {
  preview = await startPreview()
} catch (error) {
  await browser.close()
  fail(`static preview failed: ${error instanceof Error ? error.message : String(error)}`)
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport })
    const consoleErrors = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await page.goto(base + '/demo.html', { waitUntil: 'networkidle' })
    await page.waitForSelector('#scene canvas', { timeout: 15000 })
    await page.waitForSelector('#detail-sheet', { timeout: 5000 })

    const narrow = viewport.width <= 720
    const checks = []
    let metrics
    if (narrow) {
      const handle = page.locator('.sheet-handle')
      const states = []
      const baseline = await snapshot(page)
      states.push(['half', baseline])
      for (const state of ['full', 'peek', 'half']) {
        await handle.click()
        await page.waitForTimeout(280)
        states.push([state, await snapshot(page)])
      }
      checks.push(['initial half', baseline.state === 'half'])

      // 量卡片自身高度（rect.height），不用露出高度（视口底 - rect.top）：后者会被定位偏移污染。
      // 先核对卡片确实贴底，避免拿一个位置漂移的卡片把高度断言蒙过去。
      for (const [state, value] of states) {
        const ratio = value.height / value.viewportHeight
        checks.push([`${state} ${(ratio * 100).toFixed(1)}%`, value.state === state && near(ratio, expectedRatios[state])])
        checks.push([`${state} anchored bottom`, Math.abs(value.bottomGap) <= ANCHOR_TOLERANCE_PX])
      }

      const peek = states.find(([state]) => state === 'peek')[1]
      checks.push([`peek <=30vh (${(peek.height / peek.viewportHeight * 100).toFixed(1)}%)`, peek.height / peek.viewportHeight <= 0.3])
      checks.push(['peek first fact visible', peek.factVisible && peek.factText.length > 0])

      await handle.click()
      await handle.click()
      await page.waitForTimeout(280)
      const beforeDrag = await snapshot(page)
      checks.push([`drag start ${beforeDrag.state}`, beforeDrag.state === 'peek'])
      const box = await handle.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 240, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(280)
      const dragged = await snapshot(page)
      checks.push([`drag 240px -> ${dragged.state}`, dragged.state !== 'peek'])

      const chips = page.locator('[data-filter]')
      const allCount = await page.locator('#entity-list .entity-item').count()
      await chips.filter({ hasText: '教学' }).click()
      const academicCount = await page.locator('#entity-list .entity-item').count()
      checks.push([`filter ${allCount}->${academicCount}`, academicCount > 0 && academicCount !== allCount])
      await chips.filter({ hasText: '全部' }).click()
      const selectedCount = await page.locator('#entity-list .entity-item.selected').count()
      checks.push(['selected state readable', selectedCount === 1])

      metrics = await snapshot(page)
    } else {
      metrics = await snapshot(page)
      checks.push(['desktop panel in document flow', metrics.top >= 0])
      checks.push(['desktop no horizontal overflow', metrics.scrollWidth <= metrics.innerWidth])
    }
    checks.push(['no console errors', consoleErrors.length === 0])

    const file = join(artifacts, `s4-${viewport.width}.png`)
    await page.screenshot({ path: file, fullPage: false })
    rows.push({ viewport: `${viewport.width}x${viewport.height}`, checks, consoleErrors, file })
    if (checks.some(([, ok]) => !ok)) failed = true
    await page.close()
  }
} finally {
  await browser.close()
  preview?.proc.kill('SIGTERM')
}

console.log('\nUI-v3 S4 browser verification summary')
for (const row of rows) {
  console.log(row.viewport)
  for (const [label, ok] of row.checks) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`)
  console.log(`  screenshot ${row.file}`)
}

if (failed) {
  console.error('browser assertions failed')
  process.exit(1)
}
console.log('all browser assertions passed')
process.exit(0)
