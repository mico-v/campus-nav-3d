#!/usr/bin/env node
/**
 * 项目状态板 —— 一眼看清「哪片在飞、哪片等复核、哪片停滞」。
 *
 * 数据来源：CNB issue / PR API、`cnb-remote builds`、git log、`docs/agent/memory.md` 的里程碑表。
 * 零依赖，Node 24 直接跑：`node tools/project-status.mjs`（或 `npm run status`）。
 *
 * 判定口径（改这里就是改追踪口径）：
 * - PR 超过 4 小时没人动 → 标「等复核超时」；
 * - 派工中的 issue 超过 24 小时没新评论 → 标「疑似停滞」；
 * - 同一时刻在飞切片上限 3（WIP 限制，见 docs/agent/pipeline.md）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = process.env.CNB_REPO ?? 'mico-v/campus-nav-3d'
const api = 'https://api.cnb.cool'
const tokenPath = join(homedir(), '.config/cnb/token')
const WIP_LIMIT = 3
const STALE_PR_HOURS = 4
const STALE_ISSUE_HOURS = 24

function token() {
  try {
    return readFileSync(tokenPath, 'utf8').trim()
  } catch {
    return ''
  }
}

async function fetchJson(path) {
  const auth = token()
  if (!auth) return { error: '缺少 ~/.config/cnb/token' }
  const response = await fetch(api + path, {
    headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.cnb.api+json' },
  })
  if (!response.ok) return { error: `HTTP ${response.status}` }
  return { data: await response.json() }
}

function hoursSince(iso) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return (Date.now() - then) / 36e5
}

function shortTitle(title, max = 44) {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title
}

function milestones() {
  try {
    const text = readFileSync(join(root, 'docs/agent/memory.md'), 'utf8')
    const section = text.split('## 里程碑')[1]?.split('##')[0] ?? ''
    return section
      .split('\n')
      .filter((line) => /^\|\s*M\d/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
      .map(([stage, content, status]) => ({ stage, content, status }))
  } catch {
    return []
  }
}

function recentCommits(count = 5) {
  try {
    return execFileSync('git', ['log', `-${count}`, '--oneline'], { cwd: root, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function recentBuilds(count = 5) {
  try {
    const out = execFileSync('python3', [join(homedir(), 'bin/cnb-remote'), 'builds', '--repo', repo], {
      encoding: 'utf8',
      timeout: 60_000,
    })
    return out
      .trim()
      .split('\n')
      .slice(0, count)
      .map((line) => line.split('\t').map((cell) => cell.trim()).filter(Boolean))
  } catch {
    return []
  }
}

async function main() {
  const [issues, pulls] = await Promise.all([
    fetchJson(`/${repo}/-/issues?state=open&page_size=50`),
    fetchJson(`/${repo}/-/pulls?page_size=50`),
  ])

  const lines = [`# ${repo} 状态板（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）`, '']

  lines.push('## 里程碑')
  const rows = milestones()
  if (rows.length === 0) lines.push('（memory.md 里没读到里程碑表）')
  for (const row of rows) lines.push(`- ${row.stage}｜${row.status}`)
  lines.push('')

  const openIssues = issues.data ?? []
  const openPulls = (pulls.data ?? []).filter((pull) => pull.state === 'open')
  lines.push(`## 在飞（WIP ${openPulls.length}/${WIP_LIMIT}）`)
  if (openPulls.length === 0) lines.push('- 无待复核 PR')
  for (const pull of openPulls) {
    const age = hoursSince(pull.updated_at ?? pull.created_at ?? '')
    const stale = age > STALE_PR_HOURS ? `｜等复核 ${age.toFixed(1)}h` : ''
    lines.push(
      `- PR #${pull.number} ${shortTitle(pull.title)}（${pull.head?.ref ?? '?'}，mergeable=${pull.mergeable_state ?? '?'}${stale}）`,
    )
  }
  lines.push('')

  lines.push('## 派工中 issue')
  const working = openIssues.filter((issue) => issue.number !== undefined)
  if (working.length === 0) lines.push('- 无 open issue')
  for (const issue of working) {
    const age = hoursSince(issue.updated_at ?? issue.created_at ?? '')
    const stale = age > STALE_ISSUE_HOURS ? `｜疑似停滞 ${Math.floor(age / 24)}d` : ''
    lines.push(`- #${issue.number} ${shortTitle(issue.title)}（评论 ${issue.comment_count ?? 0}${stale}）`)
  }
  lines.push('')

  lines.push('## 最近构建')
  const builds = recentBuilds()
  if (builds.length === 0) lines.push('- 读不到（cnb-remote builds 失败）')
  for (const build of builds) lines.push(`- ${build.slice(0, 5).join(' ')}`)

  lines.push('')
  lines.push('## 最近提交')
  for (const commit of recentCommits()) lines.push(`- ${commit}`)

  if (issues.error || pulls.error) {
    lines.push('')
    lines.push(`！CNB 读取失败：issues=${issues.error ?? 'ok'} pulls=${pulls.error ?? 'ok'}`)
  }

  process.stdout.write(`${lines.join('\n')}\n`)
}

await main()
