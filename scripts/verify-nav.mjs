#!/usr/bin/env node
/**
 * 站点导航口径核查（index / demo / editor 三页同一份导航）。
 * 每页断言：.site-nav 恰好 3 个并列入口（index/demo/editor）+ 1 个 aside 入口（plan.html 独立页）、
 * 恰好 1 条 aria-current 且指向本页、无 .back-home 孤立出口、0 条控制台 error。
 * 用法：node scripts/verify-nav.mjs [--dist dist]
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(process.cwd(), process.argv.includes('--dist') ? process.argv[process.argv.indexOf('--dist') + 1] : 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  const file = join(root, url === '/' ? 'index.html' : url)
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

const pages = [
  { label: 'index', file: 'index.html', href: './index.html' },
  { label: 'demo', file: 'demo.html', href: './demo.html' },
  { label: 'editor', file: 'editor.html', href: './editor.html' },
]

const browser = await chromium.launch()
const problems = []
const rows = []
for (const item of pages) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}/${item.file}`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => ({
    navLinks: document.querySelectorAll('.site-nav a:not(.site-nav-aside)').length,
    navAside: document.querySelectorAll('.site-nav a.site-nav-aside').length,
    navCurrent: document.querySelectorAll('.site-nav a[aria-current="page"]').length,
    currentHref: document.querySelector('.site-nav a[aria-current="page"]')?.getAttribute('href') ?? null,
    planLinks: document.querySelectorAll('.site-nav a.site-nav-aside[href$="plan.html"]').length,
    backHome: document.querySelectorAll('.back-home').length,
  }))
  rows.push({ ...item, ...m, errors: errors.length })
  if (m.navLinks !== 3) problems.push(`${item.label}: 站点导航入口 ${m.navLinks} 个（应为 3）`)
  if (m.navCurrent !== 1) problems.push(`${item.label}: aria-current ${m.navCurrent} 条（应为 1）`)
  if (m.currentHref !== item.href) problems.push(`${item.label}: aria-current 指向 ${m.currentHref}（应为 ${item.href}）`)
  if (m.navAside !== 1) problems.push(`${item.label}: plan.html aside 入口 ${m.navAside} 个（应为 1）`)
  if (m.planLinks !== 1) problems.push(`${item.label}: plan.html 未挂在站点导航 aside 位（${m.planLinks} 条）`)
  if (m.backHome !== 0) problems.push(`${item.label}: 仍有 .back-home 孤立出口`)
  for (const e of errors) problems.push(`${item.label}: 页面 error —— ${e}`)
  await context.close()
}
await browser.close()
server.close()

console.log('\n=== 站点导航三页核查 ===')
console.log('页面   | 导航入口 | aria-current | 指向          | plan 链接 | back-home | error | 结果')
for (const r of rows) {
  console.log(
    `${r.label.padEnd(6)} | ${String(r.navLinks).padStart(8)} | ${String(r.navCurrent).padStart(12)} | ${String(r.currentHref).padEnd(13)} | ${String(r.planLinks).padStart(9)} | ${String(r.backHome).padStart(9)} | ${String(r.errors).padStart(5)} | ${problems.some((p) => p.startsWith(`${r.label}:`)) ? 'fail' : 'pass'}`,
  )
}
if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} 项不通过：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\n✓ index / demo / editor 三页均：3 入口并列 + 1 个 plan.html 独立页 aside、aria-current 指向本页、无 back-home、0 条 error')
