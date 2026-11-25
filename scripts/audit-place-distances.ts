#!/usr/bin/env -S npx tsx
/**
 * 只读校验：把 placeEdges.csv 的地点邻接距离与 campus.json 现有坐标做比对。
 * 不写任何文件；偏差 >30% 的组合打印出来供 docs/audit/campus-plan-crosscheck.md 逐条给结论。
 *
 * 坐标口径：campus.json 的 local-meters 为准；drawio 只用来定相对方位。
 * CSV 来源：https://github.com/ZDaneel/usts-navigation-graph （master, placeEdges.csv）
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const campus = JSON.parse(readFileSync(resolve(repoRoot, 'packs/usts-tianping/campus.json'), 'utf8')) as {
  buildings: Array<{ id: string; name: string; position?: [number, number]; aliases?: string[]; alias?: string[] }>
}

// 47 地点 -> campus.json 建筑名。别名命中也算（如 西区快递点 -> 西区菜鸟驿站）。
const placeToBuilding: Record<string, string> = {
  '一号门': '一号门', '二号门': '二号门', 'C4教学楼': 'C4教学楼', '教学2楼': '教学2楼',
  '图书馆': '图书馆', '行政楼': '行政楼', '院士楼': '院士楼',
  '环境科学与工程学院': '环境科学与工程学院', '外国语学院': '外国语学院',
  '电子与信息工程学院': '电子与信息工程学院', '化学与生物工程学院': '化学与生物工程学院',
  '逸夫楼': '逸夫楼', '塔影阁': '塔影阁', '二食堂': '二食堂', '三食堂': '三食堂',
  '东区食堂': '东区食堂', '校医院': '校医院', '东区宿舍': '东区宿舍1号楼', '南区宿舍': '南区宿舍',
  '传媒与视觉艺术学院': '传媒与视觉艺术学院', '西区快递点': '西区菜鸟驿站', '东区快递点': '东区快递点',
  '足球场': '足球场', '体育馆1': '体育馆1', '体育馆2': '体育馆2',
  '西区宿舍4组团': '西区宿舍4组团', '员工宿舍': '员工宿舍',
  '西区宿舍3组团': '西区宿舍3组团', '西区宿舍2组团': '西区宿舍2组团',
  '西区宿舍5组团': '西区宿舍5组团', '西区宿舍1组团': '西区宿舍1组团',
  '环境生物技术研究所': '环境生物技术研究所', 'C5教学楼': 'C5教学楼', 'C6教学楼': 'C6教学楼',
  '地理科学与测绘工程学院': '地理科学与测绘工程学院', '商学院': '商学院',
  '师陶园': '师陶园', '学宿3': '学宿3', '学宿8': '学宿8', '音乐厅': '音乐厅',
  '社会发展与公共管理学院': '社会发展与公共管理学院', '教学4楼': '教学4楼', '教学5楼': '教学5楼',
  '教学3楼': '教学3楼', '教学6楼': '教学6楼', '教学7楼': '教学7楼', '敬文书院': '敬文书院',
}

const csv = readFileSync(resolve(repoRoot, 'scripts/fixtures/placeEdges.csv'), 'utf8').trim().split('\n')
const header = csv[0]!.split(',')
const places = header.slice(1)
const byName = new Map(campus.buildings.map((b) => [b.name, b]))
const positionOf = (place: string): [number, number] | null => {
  const name = placeToBuilding[place]
  if (!name) return null
  const b = byName.get(name)
  return b?.position ?? null
}

interface Deviation { a: string; b: string; csv: number; actual: number; ratio: number }
const deviations: Deviation[] = []
let edges = 0
for (let i = 1; i < csv.length; i += 1) {
  const cells = csv[i]!.split(',')
  const a = cells[0]!
  const pa = positionOf(a)
  if (!pa) continue
  for (let j = 1; j < cells.length; j += 1) {
    const raw = cells[j]!.trim()
    if (!raw) continue
    const b = places[j - 1]!
    const pb = positionOf(b)
    if (!pb || a === b) continue
    // CSV 为对称矩阵，同一对只统计一次（按地点清单顺序去重）。
    if (places.indexOf(a) > places.indexOf(b)) continue
    edges += 1
    const actual = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
    const expected = Number(raw)
    const ratio = actual / expected
    if (!(ratio >= 0.7 && ratio <= 1.3)) deviations.push({ a, b, csv: expected, actual: Math.round(actual), ratio: Math.round(ratio * 100) / 100 })
  }
}
deviations.sort((x, y) => Math.abs(y.ratio - 1) - Math.abs(x.ratio - 1))
console.log(`placeEdges 有边点对 ${edges}；与现有坐标偏差 >30%：${deviations.length}`)
for (const d of deviations) {
  console.log(`${d.a} ↔ ${d.b}: csv ${d.csv}m, world ${d.actual}m, 比值 ${d.ratio}`)
}
