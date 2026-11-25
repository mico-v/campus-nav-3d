// @vitest-environment happy-dom
/**
 * M2-C 装配守卫：楼层条的 onSelectRoom 必须接到主页面已有的 POI 选中入口；
 * 这里只验证装配形状与延迟调用约束，DOM 点击细节交给 m2c-indoor-levels.test.ts。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultCampusData } from '../src/data/campusData'
import { renderDetails } from '../src/ui/panel'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainSource = readFileSync(join(repoRoot, 'src/main.ts'), 'utf8')
const cssSource = readFileSync(join(repoRoot, 'src/style.css'), 'utf8')

const mountBlock = mainSource.slice(
  mainSource.indexOf('const indoorBar = mountIndoorLevels('),
  mainSource.indexOf('function syncUi()'),
)

describe('M2-C 装配：onSelectRoom 接线', () => {
  it('主页面挂载楼层条时传入 onSelectRoom', () => {
    expect(mountBlock).toContain('onSelectRoom: (roomId) =>')
  })

  it('未知 roomId 不选中，不进入 POI 选中入口', () => {
    expect(mountBlock).toMatch(/if \(!data\.pois\.some\(\(poi\) => poi\.id === roomId\)\) return/)
  })

  it('已知 roomId 走已有 select({ kind: \'poi\', id })', () => {
    expect(mountBlock).toMatch(/select\(\{ kind: 'poi', id: roomId \}\)/)
  })

  it('select() 延迟到下一拍，避免在点击回调里递归重建楼层条', () => {
    expect(mountBlock).toMatch(/window\.setTimeout\(\(\) => select\(\{ kind: 'poi', id: roomId \}\), 0\)/)
  })
})

describe('M2-C 样式：房间列表沿用现有令牌', () => {
  it('新增 .indoor-room-list / .indoor-room-btn，命中区 44px', () => {
    expect(cssSource).toContain('.indoor-room-list {')
    expect(cssSource).toContain('.indoor-room-btn {')
    const roomBtn = cssSource.slice(cssSource.indexOf('.indoor-room-btn {'), cssSource.indexOf('.indoor-room-btn:hover'))
    expect(roomBtn).toContain('min-width: 44px')
    expect(roomBtn).toContain('min-height: 44px')
  })

  it('房间列表与楼层条同令牌，窄屏不额外压状态条', () => {
    expect(cssSource).toContain('border: 1px solid var(--outline)')
    expect(cssSource).toContain('background: var(--surface)')
    expect(cssSource).toContain('color: var(--muted)')
    const narrow = cssSource.slice(cssSource.indexOf('@media (max-width: 959px) {\n  .indoor-levels {'))
    expect(narrow).toContain('.indoor-room-list {')
    expect(narrow).toContain('bottom: var(--indoor-bar-bottom)')
  })
})


describe('M2-C 装配：店面 POI 与详情标题', () => {
  const mainSourceForRoom = mainSource

  it('roomId 命中 pack POI 后进入已存在的 POI 选中入口', () => {
    // kfc 的 room id 就是 pack POI id；适配层补 POI 后主程序按 id 直接命中。
    const data = createDefaultCampusData()
    expect(data.pois.some((poi) => poi.id === 'poi-m1-048')).toBe(true)
    expect(mainSourceForRoom).toMatch(/if \(!data\.pois\.some\(\(poi\) => poi\.id === roomId\)\) return/)
  })

  it('详情卡正文用 POI 名称作为标题，展示 KFC（二食堂店）', () => {
    const data = createDefaultCampusData()
    const container = document.createElement('div')
    renderDetails(data, { kind: 'poi', id: 'poi-m1-048' }, container)
    expect(container.querySelector('h3')?.textContent).toBe('KFC（二食堂店）')
  })
})

describe('M3-B 适配层：室内 POI 按 id 判重', () => {
  // issue #70 给的 65 来自 627edd0b 那份 pack（65 条，含 #74 已删的 poi-m1-055 一食堂）。
  // #76 又删掉与 place-14 同坐标的二食堂 POI，当前 pack 是 63 条；
  // room 里缺 POI 的是 noodle-stall / stir-fry-stall 两条，按 id 判重补齐后写死 65。
  it('默认数据保留 65 条 POI，KFC 与肯悦咖啡都在且 id 不重复', () => {
    const pois = createDefaultCampusData().pois
    expect(pois).toHaveLength(65)
    const ids = new Set(pois.map((poi) => poi.id))
    expect(ids.has('poi-m1-048')).toBe(true)
    expect(ids.has('poi-m1-049')).toBe(true)
    expect(ids.size).toBe(pois.length)
  })
})
