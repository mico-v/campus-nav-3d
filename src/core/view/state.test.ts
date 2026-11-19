import { describe, expect, it, vi } from 'vitest'
import { defaultLayerVisibility, ViewState } from './state'

describe('ViewState', () => {
  it('默认八个图层全开，且构造参数可以局部覆盖', () => {
    expect(new ViewState().layers).toEqual(defaultLayerVisibility)
    const view = new ViewState(null, { showLabels: false })
    expect(view.layers.showLabels).toBe(false)
    expect(view.layers.showBuildings).toBe(true)
  })

  it('setLayer 只在值变化时通知订阅者', () => {
    const view = new ViewState()
    const listener = vi.fn()
    view.subscribe(listener)

    expect(view.setLayer('showTrees', false)).toBe(true)
    expect(view.layers.showTrees).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)

    expect(view.setLayer('showTrees', false)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('toggleLayer 取反当前值', () => {
    const view = new ViewState()
    view.toggleLayer('showWater')
    expect(view.layers.showWater).toBe(false)
    view.toggleLayer('showWater')
    expect(view.layers.showWater).toBe(true)
  })

  it('setSelected 通知订阅者，退订后不再通知', () => {
    const view = new ViewState<string | null>(null)
    const listener = vi.fn()
    const unsubscribe = view.subscribe(listener)

    view.setSelected('building:0')
    expect(view.selected).toBe('building:0')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    view.setSelected(null)
    expect(view.selected).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('layers 快照不可被外部改掉内部状态', () => {
    const view = new ViewState()
    const before = view.layers
    view.setLayer('showPois', false)
    expect(before.showPois).toBe(true)
    expect(view.layers.showPois).toBe(false)
  })
})
