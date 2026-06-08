// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { FormPanel } from './form.ts'
import { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'

function data(): CampusData {
  return {
    name: 't',
    bounds: { width: 100, depth: 100 },
    zones: [{ id: 'z1', name: '宿舍区', category: 'dorm', center: [0, 0], size: [10, 10], color: '#fff' }],
    buildings: [
      { id: 'b1', name: 'B1', category: 'academic', position: [10, 20], size: [30, 40], height: 12, zoneId: 'z1' },
    ],
    roads: [],
    waters: [],
    fields: [],
    trees: [],
    pois: [{ id: 'p1', name: 'POI1', kind: 'landmark', position: [5, 6, 7] }],
    routes: [],
  }
}

function inputByLabel(host: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const fields = Array.from(host.querySelectorAll('.field'))
  for (const f of fields) {
    if (f.querySelector('label')?.textContent === label) {
      return f.querySelector('input, textarea, select') as HTMLInputElement
    }
  }
  throw new Error(`field not found: ${label}`)
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }))
}

describe('FormPanel', () => {
  it('shows empty hint with no selection', () => {
    const host = document.createElement('div')
    const store = new EditorStore(data())
    new FormPanel(host, store).render()
    expect(host.querySelector('.empty-hint')).toBeTruthy()
  })

  it('edits building height and marks dirty on commit', () => {
    const host = document.createElement('div')
    const store = new EditorStore(data())
    const form = new FormPanel(host, store)
    store.subscribe(() => form.render())
    store.select({ kind: 'building', index: 0 })

    const height = inputByLabel(host, '高度') as HTMLInputElement
    height.dispatchEvent(new Event('focus'))
    height.value = '25'
    fire(height, 'input')
    expect(store.data.buildings[0].height).toBe(25)
    fire(height, 'change')
    expect(store.dirty).toBe(true)
    store.undo()
    expect(store.data.buildings[0].height).toBe(12)
  })

  it('edits building info textarea', () => {
    const host = document.createElement('div')
    const store = new EditorStore(data())
    const form = new FormPanel(host, store)
    store.subscribe(() => form.render())
    store.select({ kind: 'building', index: 0 })

    const info = inputByLabel(host, '信息') as HTMLTextAreaElement
    info.dispatchEvent(new Event('focus'))
    info.value = '三号教学楼'
    fire(info, 'input')
    fire(info, 'change')
    expect(store.data.buildings[0].info).toBe('三号教学楼')
  })

  it('translates footprint when editing building position X', () => {
    const d = data()
    d.buildings[0].footprint = [[0, 0], [20, 0], [20, 40], [0, 40]]
    d.buildings[0].position = [10, 20]
    const host = document.createElement('div')
    const store = new EditorStore(d)
    const form = new FormPanel(host, store)
    store.subscribe(() => form.render())
    store.select({ kind: 'building', index: 0 })

    const posX = inputByLabel(host, '位置 X') as HTMLInputElement
    posX.dispatchEvent(new Event('focus'))
    posX.value = '15' // +5
    fire(posX, 'input')
    expect(store.data.buildings[0].footprint![0][0]).toBeCloseTo(5)
  })

  it('rebuilds the form when selection changes kind', () => {
    const host = document.createElement('div')
    const store = new EditorStore(data())
    const form = new FormPanel(host, store)
    store.subscribe(() => form.render())
    store.select({ kind: 'building', index: 0 })
    expect(() => inputByLabel(host, '高度')).not.toThrow()
    store.select({ kind: 'poi', index: 0 })
    expect(() => inputByLabel(host, '高度')).toThrow()
    expect(() => inputByLabel(host, '类型')).not.toThrow() // poi kind field
  })
})
