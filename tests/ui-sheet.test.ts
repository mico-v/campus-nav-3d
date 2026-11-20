// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createSheet, sheetHeightRatio, snapAfterDrag, type SheetState } from '../src/ui/sheet'
import { filterEntities, renderFilterChips, renderEntityList } from '../src/ui/panel'
import { createDefaultCampusData } from '../src/data/campusData'

function setupSheet() {
  document.body.innerHTML = '<aside data-sheet="half"><button class="sheet-handle">handle</button><div class="body"></div></aside>'
  const root = document.querySelector<HTMLElement>('[data-sheet]')!
  const handle = root.querySelector<HTMLButtonElement>('.sheet-handle')!
  const sheet = createSheet(root)
  return { root, handle, sheet }
}

function pointer(type: string, clientY: number): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, clientY, button: 0, pointerId: 1 })
  return event
}

describe('sheet state machine', () => {
  it('starts at half and cycles full -> peek on handle taps', () => {
    const { root, handle, sheet } = setupSheet()
    expect(root.dataset.sheet).toBe('half')
    handle.click()
    expect(root.dataset.sheet).toBe('full')
    handle.click()
    expect(root.dataset.sheet).toBe('peek')
    handle.click()
    expect(root.dataset.sheet).toBe('half')
    sheet.destroy()
  })

  it('snaps up 240px without falling back to peek', () => {
    const { root, handle, sheet } = setupSheet()
    root.dataset.sheet = 'peek'
    handle.dispatchEvent(pointer('pointerdown', 500))
    handle.dispatchEvent(pointer('pointermove', 260))
    handle.dispatchEvent(pointer('pointerup', 260))
    expect(root.dataset.sheet).toBe('half')
    expect(snapAfterDrag('peek', -240)).toBe('half')
    sheet.destroy()
  })

  it('reads sheet height from --sheet-* tokens only', () => {
    const values: Record<SheetState, string> = { peek: '16vh', half: '52vh', full: '86vh' }
    const styles = { getPropertyValue: (name: string) => values[name.replace('--sheet-', '') as SheetState] ?? '' } as CSSStyleDeclaration
    expect(sheetHeightRatio('peek', 720, styles)).toBeCloseTo(0.16, 5)
    expect(sheetHeightRatio('half', 720, styles)).toBeCloseTo(0.52, 5)
    expect(sheetHeightRatio('full', 720, styles)).toBeCloseTo(0.86, 5)
  })
})

describe('entity filters', () => {
  const data = createDefaultCampusData()

  it('changes item count when category chip changes', () => {
    const chips = document.createElement('div')
    const list = document.createElement('div')
    renderFilterChips(chips, 'all')
    renderEntityList(data, null, list, '', 'all')
    const allCount = list.querySelectorAll('.entity-item').length
    const academic = filterEntities(data.buildings.map((b, index) => ({ kind: 'building' as const, index, id: b.id, name: b.name, subtitle: '', category: b.category })), 'academic')
    renderEntityList(data, null, list, '', 'academic')
    expect(list.querySelectorAll('.entity-item').length).toBe(academic.length)
    expect(list.querySelectorAll('.entity-item').length).toBeLessThan(allCount)
    expect(chips.querySelector('[data-filter="all"]')?.classList.contains('active')).toBe(true)
  })
})

describe('filter chip wiring', () => {
  // main.ts 启动要 WebGL，happydom 里跑不起来；这里覆盖 chip 状态 + 列表联动这一层，
  // 真实点击链路由 Playwright 的 ui-smoke 验收。
  it('marks the selected chip active and re-renders the list on chip change', () => {
    const chips = document.createElement('div')
    const list = document.createElement('div')
    const data = createDefaultCampusData()
    renderFilterChips(chips, 'all')
    renderEntityList(data, null, list, '', 'all')
    const allCount = list.querySelectorAll('.entity-item').length
    expect(chips.querySelectorAll('[data-filter]').length).toBeGreaterThan(1)
    expect(chips.querySelector('[data-filter="all"]')?.classList.contains('active')).toBe(true)

    renderFilterChips(chips, 'academic')
    renderEntityList(data, null, list, '', 'academic')
    expect(chips.querySelector('[data-filter="academic"]')?.classList.contains('active')).toBe(true)
    expect(chips.querySelector('[data-filter="all"]')?.classList.contains('active')).toBe(false)
    const filtered = list.querySelectorAll('.entity-item').length
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(allCount)

    renderFilterChips(chips, 'all')
    renderEntityList(data, null, list, '', 'all')
    expect(list.querySelectorAll('.entity-item').length).toBe(allCount)
  })
})
