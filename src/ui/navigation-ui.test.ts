// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultCampusData, type CampusData } from '../data/campusData'
import { buildingAnchorId } from '../navigation/route'
import { MAX_VIA_COUNT, mountNavigationUi, type NavigationRouteState } from './navigation-ui'

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const data = createDefaultCampusData()
  const calls: Array<{ origin: number; via: number[]; destination: number; mode: string }> = []
  const ui = mountNavigationUi(host, {
    onRouteRequest: (origin, via, destination, mode) => calls.push({ origin, via, destination, mode }),
    onModeChange: () => {},
    onClear: () => {},
    onPickModeChange: () => {},
  })
  const state: NavigationRouteState = { origin: null, via: [], destination: null, summary: null, error: null, mode: 'pedestrian' }
  ui.update(data, state)
  return { host, data, calls, ui, state }
}

const q = <T extends Element>(host: HTMLElement, selector: string): T => {
  const element = host.querySelector<T>(selector)
  if (!element) throw new Error(`missing ${selector}`)
  return element
}
const rows = (host: HTMLElement): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('[data-via-row]'))
const values = (host: HTMLElement): string[] => rows(host).map((row) => q<HTMLSelectElement>(row, 'select').value)
const fire = (el: Element, type: string): void => { el.dispatchEvent(new Event(type, { bubbles: true })) }
const click = (el: Element): void => fire(el, 'click')

/** 取一组都有路网锚点、互不相同的建筑索引，避免 disabled 选项干扰断言。 */
function pickIndexes(data: CampusData, count: number): number[] {
  const indexes: number[] = []
  for (let i = 0; i < data.buildings.length && indexes.length < count; i += 1) {
    if (buildingAnchorId(data, i) !== null) indexes.push(i)
  }
  expect(indexes.length).toBeGreaterThanOrEqual(count)
  return indexes
}

describe('navigation-ui 途经点输入', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => { document.body.innerHTML = ''; ctx = setup() })

  it('空态没有 via 行，有添加按钮且未禁用', () => {
    expect(rows(ctx.host)).toHaveLength(0)
    expect(q<HTMLButtonElement>(ctx.host, '#nav-via-add').disabled).toBe(false)
  })

  it('加 3 条后 3 行 select，顺序与添加顺序一致', () => {
    const [a, b, c] = pickIndexes(ctx.data, 3)
    const add = q<HTMLButtonElement>(ctx.host, '#nav-via-add')
    click(add); click(add); click(add)
    expect(rows(ctx.host)).toHaveLength(3)
    ;[a, b, c].forEach((index, i) => { q<HTMLSelectElement>(rows(ctx.host)[i], 'select').value = String(index) })
    expect(values(ctx.host)).toEqual([String(a), String(b), String(c)])
    fire(q<HTMLSelectElement>(rows(ctx.host)[2], 'select'), 'change')
    expect(ctx.calls.at(-1)?.via).toEqual([a, b, c])
  })

  it('上移下移后 DOM 顺序与 onRouteRequest 的 via 数组一致', () => {
    const [a, b, c] = pickIndexes(ctx.data, 3)
    const add = q<HTMLButtonElement>(ctx.host, '#nav-via-add')
    click(add); click(add); click(add)
    ;[a, b, c].forEach((index, i) => { q<HTMLSelectElement>(rows(ctx.host)[i], 'select').value = String(index) })
    click(q(rows(ctx.host)[2], '[data-action="up"]'))
    expect(values(ctx.host)).toEqual([String(a), String(c), String(b)])
    fire(q<HTMLSelectElement>(rows(ctx.host)[0], 'select'), 'change')
    expect(ctx.calls.at(-1)?.via).toEqual([a, c, b])
    click(q(rows(ctx.host)[0], '[data-action="down"]'))
    expect(values(ctx.host)).toEqual([String(c), String(a), String(b)])
    fire(q<HTMLSelectElement>(rows(ctx.host)[0], 'select'), 'change')
    expect(ctx.calls.at(-1)?.via).toEqual([c, a, b])
  })

  it('删除中间一条后剩 2 条，顺序正确，删除本身不触发路线请求', () => {
    const [a, b, c] = pickIndexes(ctx.data, 3)
    const add = q<HTMLButtonElement>(ctx.host, '#nav-via-add')
    click(add); click(add); click(add)
    ;[a, b, c].forEach((index, i) => { q<HTMLSelectElement>(rows(ctx.host)[i], 'select').value = String(index) })
    const before = ctx.calls.length
    click(q(rows(ctx.host)[1], '[data-action="remove"]'))
    expect(rows(ctx.host)).toHaveLength(2)
    expect(values(ctx.host)).toEqual([String(a), String(c)])
    expect(ctx.calls).toHaveLength(before)
  })

  it(`到 ${MAX_VIA_COUNT} 条上限时添加按钮 disabled`, () => {
    const add = q<HTMLButtonElement>(ctx.host, '#nav-via-add')
    for (let i = 0; i < MAX_VIA_COUNT; i += 1) click(add)
    expect(rows(ctx.host)).toHaveLength(MAX_VIA_COUNT)
    expect(add.disabled).toBe(true)
    click(add)
    expect(rows(ctx.host)).toHaveLength(MAX_VIA_COUNT)
    click(q(rows(ctx.host)[0], '[data-action="remove"]'))
    expect(add.disabled).toBe(false)
  })

  it('空 via 传 []；规划时 origin / via / destination / mode 逐个正确', () => {
    const [origin, a, b, destination] = pickIndexes(ctx.data, 4)
    q<HTMLSelectElement>(ctx.host, '#nav-origin').value = String(origin)
    q<HTMLSelectElement>(ctx.host, '#nav-destination').value = String(destination)
    fire(q<HTMLSelectElement>(ctx.host, '#nav-destination'), 'change')
    expect(ctx.calls.at(-1)).toEqual({ origin, via: [], destination, mode: 'pedestrian' })
    // 真实链路里 handler 收到请求后会回写 state；这里同步缓存，避免模式按钮重渲染时丢掉选择。
    Object.assign(ctx.state, { origin, destination })
    ctx.ui.update(ctx.data, ctx.state)

    const add = q<HTMLButtonElement>(ctx.host, '#nav-via-add')
    click(add); click(add)
    ;[a, b].forEach((index, i) => { q<HTMLSelectElement>(rows(ctx.host)[i], 'select').value = String(index) })
    click(q(ctx.host, '#nav-modes [data-mode="bicycle"]'))
    fire(q<HTMLSelectElement>(rows(ctx.host)[1], 'select'), 'change')
    expect(ctx.calls.at(-1)).toEqual({ origin, via: [a, b], destination, mode: 'bicycle' })
  })

  it('via 与起点 / 终点相同的楼被标灰，不会提交冲突', () => {
    const [origin, destination, other] = pickIndexes(ctx.data, 3)
    q<HTMLSelectElement>(ctx.host, '#nav-origin').value = String(origin)
    fire(q<HTMLSelectElement>(ctx.host, '#nav-origin'), 'change')
    // change handler triggers a route request with empty via; reset the log for this assertion.
    ctx.calls.length = 0
    q<HTMLSelectElement>(ctx.host, '#nav-destination').value = String(destination)
    click(q<HTMLButtonElement>(ctx.host, '#nav-via-add'))
    const select = q<HTMLSelectElement>(rows(ctx.host)[0], 'select')
    expect(select.querySelector<HTMLOptionElement>(`option[value="${origin}"]`)?.disabled).toBe(true)
    expect(select.querySelector<HTMLOptionElement>(`option[value="${destination}"]`)?.disabled).toBe(true)
    select.value = String(other)
    fire(select, 'change')
    expect(ctx.calls.at(-1)?.via).toEqual([other])
  })

  it('#nav-clear 同时清空 via', () => {
    click(q<HTMLButtonElement>(ctx.host, '#nav-via-add'))
    click(q<HTMLButtonElement>(ctx.host, '#nav-via-add'))
    expect(rows(ctx.host)).toHaveLength(2)
    click(q(ctx.host, '#nav-clear'))
    expect(rows(ctx.host)).toHaveLength(0)
  })
})
