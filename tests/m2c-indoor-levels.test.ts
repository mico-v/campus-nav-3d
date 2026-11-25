// @vitest-environment happy-dom
/**
 * M2-C：楼层深链与室内楼层条。所有解析都走 M4-A 的 parseDeepLink，
 * ?q= 与 ?building&level= 共用一条路，互不覆盖；非法参数回落整楼视图。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeepLink } from '../src/deeplink/index'
import { indoorLevelsOf, indoorRoomsOf, normalizeIndoorLevel, connectorTargetsOf, mountIndoorLevels } from '../src/ui/indoor-levels'
import type { CampusData, Building } from '../src/data/campusData'

function building(overrides: Partial<Building> = {}): Building {
  return { id: 'c3', name: '3 号楼', category: 'academic', position: [0, 0], size: [10, 10], height: 12, ...overrides }
}

function data(buildings: Building[]): CampusData {
  return { name: 't', bounds: { width: 100, depth: 100 }, zones: [], buildings, roads: [], waters: [], fields: [], trees: [], pois: [] }
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainSource = readFileSync(join(repoRoot, 'src/main.ts'), 'utf8')

const withFloors = building({
  floors: [
    { level: -1, name: 'B1' },
    { level: 0, name: '1F' },
    { level: 2, name: '3F' },
  ],
} as Partial<Building>)

describe('M2-C 深链：与 ?q= 共用一个解析器', () => {
  it('?building&level 与 ?q= 组合，两组成员都在，互不覆盖', () => {
    // main.ts 把入口页换成为包名后交给同一个 parseDeepLink；这里验证那条真实路径。
    expect(mainSource).toMatch(/parseDeepLink\(normalized\)/)
    expect(parseDeepLink('/usts-tianping?q=library&building=c3&level=2')).toEqual({
      pack: 'usts-tianping', q: 'library', building: 'c3', level: 2,
    })
    expect(parseDeepLink('/usts-tianping?building=c3&level=0&q=%E5%9B%BE%E4%B9%A6%E9%A6%86')).toEqual({
      pack: 'usts-tianping', building: 'c3', level: 0, q: '图书馆',
    })
  })

  it('只有 ?q= 的老深链行为不变', () => {
    expect(parseDeepLink('/demo.html?q=%E5%9B%BE%E4%B9%A6%E9%A6%86')).toEqual({ pack: 'default', q: '图书馆' })
  })

  it('非法 level 与非法 building：整条解析拒绝，调用方回落整楼视图不白屏', () => {
    expect(parseDeepLink('/usts-tianping?building=c3&level=-1')).toBeNull()
    expect(parseDeepLink('/usts-tianping?building=C3&level=1')).toBeNull()
    expect(parseDeepLink('/usts-tianping?building=c3&level=1.5')).toBeNull()
  })
})

describe('M2-C 楼层状态纯逻辑', () => {
  it('有 floors 才出楼层列表，level 原样来自 M2-A 数据', () => {
    expect(indoorLevelsOf(withFloors)).toEqual([
      { level: -1, label: 'B1' },
      { level: 0, label: '1F' },
      { level: 2, label: '3F' },
    ])
  })

  it('没有 floors 的建筑不显示楼层条', () => {
    expect(indoorLevelsOf(building())).toEqual([])
    expect(indoorLevelsOf(undefined)).toEqual([])
  })

  it('层号不在本楼 floors 内时非法，回落 null（整楼视图）', () => {
    expect(normalizeIndoorLevel(withFloors, 2)).toBe(2)
    expect(normalizeIndoorLevel(withFloors, 1)).toBeNull()
    expect(normalizeIndoorLevel(building(), 0)).toBeNull()
  })

  it('有 rooms 才出店面列表；老 pack / 无 rooms 时为空', () => {
    const canteen = building({
      floors: [
        { level: 0, name: '1F', rooms: [{ id: 'kfc', name: 'KFC', kind: 'service' }, { id: 'coffee', name: '咖啡' }] },
        { level: 1, name: '2F' },
      ],
    } as Partial<Building>)
    expect(indoorRoomsOf(canteen, 0)).toEqual([
      { id: 'kfc', label: 'KFC' },
      { id: 'coffee', label: '咖啡' },
    ])
    expect(indoorRoomsOf(canteen, 1)).toEqual([])
    expect(indoorRoomsOf(withFloors, 0)).toEqual([])
    expect(indoorRoomsOf(undefined, null)).toEqual([])
  })

  it('connector 标记列出当前层可达的其它层', () => {
    const d = data([withFloors])
    Object.assign(d, {
      connectors: [
        { id: 'c1', kind: 'stairs', from: { building: 'c3', level: 0 }, to: { building: 'c3', level: 2 } },
        { id: 'c2', kind: 'elevator', from: { building: 'c3', level: -1 }, to: { building: 'c3', level: 0 } },
        { id: 'c3', kind: 'ramp', from: { building: 'other', level: 0 }, to: { building: 'other', level: 2 } },
      ],
    })
    expect(connectorTargetsOf(d, withFloors, 0)).toEqual([-1, 2])
    expect(connectorTargetsOf(d, withFloors, 2)).toEqual([0])
  })
})

describe('M2-C 楼层条 DOM', () => {
  it('只渲染合法楼层按钮与连接标记；无 floors 时容器 hidden', () => {
    const host = document.createElement('div')
    let selected: number | null = null
    const d = data([withFloors])
    Object.assign(d, {
      connectors: [{ id: 'c1', kind: 'stairs', from: { building: 'c3', level: 0 }, to: { building: 'c3', level: 2 } }],
    })
    const bar = mountIndoorLevels(host, { data: d, onSelect: (level) => { selected = level } })

    bar.update(withFloors, 0)
    expect(host.hidden).toBe(false)
    const buttons = host.querySelectorAll<HTMLButtonElement>('.indoor-level-btn')
    expect([...buttons].map((b) => b.dataset.level)).toEqual(['-1', '0', '2'])
    expect(host.querySelector('[data-level="0"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[data-level="2"]')?.classList.contains('has-connector')).toBe(true)

    buttons[2].click()
    expect(selected).toBe(2)

    bar.update(building(), null)
    expect(host.hidden).toBe(true)
    expect(host.innerHTML).toBe('')
    bar.destroy()
  })

  it('楼层条下方渲染本层房间名，点击回调既有选中逻辑', () => {
    const host = document.createElement('div')
    let selectedRoom: string | null = null
    const canteen = building({
      floors: [
        { level: 0, name: '1F', rooms: [{ id: 'kfc', name: 'KFC' }, { id: 'coffee', name: '咖啡' }] },
        { level: 1, name: '2F' },
      ],
    } as Partial<Building>)
    const bar = mountIndoorLevels(host, {
      data: data([canteen]),
      onSelect: () => {},
      onSelectRoom: (id) => { selectedRoom = id },
    })

    bar.update(canteen, 0)
    expect([...host.querySelectorAll<HTMLButtonElement>('.indoor-room-btn')].map((b) => b.textContent)).toEqual(['KFC', '咖啡'])
    host.querySelector<HTMLButtonElement>('[data-room="coffee"]')?.click()
    expect(selectedRoom).toBe('coffee')

    bar.update(canteen, 1)
    expect(host.querySelector('.indoor-room-list')).toBeNull()
    bar.destroy()
  })

  it('房间按钮的点击路径可接到已有的 POI 选中入口（entityList 同款）', () => {
    const host = document.createElement('div')
    const entityList = document.createElement('div')
    const canteen = building({
      floors: [{ level: 0, name: '1F', rooms: [{ id: 'poi-m1-048', name: 'KFC' }] }],
    } as Partial<Building>)
    const poi = { id: 'poi-m1-048', name: 'KFC（二食堂店）', kind: 'service' }
    const d = data([canteen])
    d.pois.push(poi as never)
    entityList.innerHTML = `<button type="button" data-kind="poi" data-id="${poi.id}">${poi.name}</button>`
    let selected: { kind: 'poi'; id: string } | null = null
    const selectFromEntityList = (id: string): void => { selected = { kind: 'poi', id } }
    entityList.addEventListener('click', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]')
      if (item?.dataset.kind === 'poi' && item.dataset.id) selectFromEntityList(item.dataset.id)
    })

    const bar = mountIndoorLevels(host, {
      data: d,
      onSelect: () => {},
      onSelectRoom: (roomId) => {
        if (d.pois.some((entry) => entry.id === roomId)) selectFromEntityList(roomId)
      },
    })
    bar.update(canteen, 0)
    host.querySelector<HTMLButtonElement>('[data-room="poi-m1-048"]')?.click()
    expect(selected).toEqual({ kind: 'poi', id: 'poi-m1-048' })
    bar.destroy()
  })
})
