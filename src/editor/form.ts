import type { EditorStore } from './store.ts'
import type { CampusData, BuildingCategory, ZoneCategory } from '../data/campusData.ts'
import { buildingCategoryOptions } from '../data/campusData.ts'
import { translatePoints } from './geometry.ts'
import type { Selection } from './types.ts'

type Option = { value: string; label: string }

interface FieldDesc {
  id: string
  label: string
  kind: 'text' | 'number' | 'textarea' | 'select' | 'readonly'
  options?: Option[]
  get: () => string
  apply?: (raw: string) => void
}

const ZONE_CATEGORIES: Option[] = [
  { value: 'dorm', label: 'dorm' },
  { value: 'academic', label: 'academic' },
  { value: 'landscape', label: 'landscape' },
  { value: 'sports', label: 'sports' },
  { value: 'service', label: 'service' },
  { value: 'admin', label: 'admin' },
]

const POI_KINDS: Option[] = [
  { value: 'landmark', label: 'landmark' },
  { value: 'service', label: 'service' },
  { value: 'gate', label: 'gate' },
]

function num(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export class FormPanel {
  private host: HTMLElement
  private store: EditorStore
  private renderedKey = ''
  private fields: FieldDesc[] = []
  private inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
  private before: CampusData | null = null

  constructor(host: HTMLElement, store: EditorStore) {
    this.host = host
    this.store = store
  }

  private selectionKey(sel: Selection): string {
    if (!sel) return 'none'
    if (sel.kind === 'routePoint') return `routePoint:${sel.routeIndex}.${sel.index}`
    return `${sel.kind}:${sel.index}`
  }

  render(): void {
    const sel = this.store.selection
    const key = this.selectionKey(sel)
    if (key !== this.renderedKey) {
      this.renderedKey = key
      this.before = null
      this.rebuild(sel)
    } else {
      this.syncValues()
    }
  }

  private titleFor(sel: Selection): { title: string; sub: string } {
    const data = this.store.data
    if (!sel) return { title: '', sub: '' }
    switch (sel.kind) {
      case 'building': {
        const b = data.buildings[sel.index]
        return { title: b?.name || '建筑', sub: `建筑 · ${b?.category ?? ''}` }
      }
      case 'road':
        return { title: `道路 ${sel.index + 1}`, sub: `道路 · ${data.roads[sel.index]?.points.length ?? 0} 个节点` }
      case 'zone':
        return { title: data.zones[sel.index]?.name || '区域', sub: '区域' }
      case 'water':
        return { title: data.waters[sel.index]?.name || '水体', sub: '水体' }
      case 'field':
        return { title: data.fields[sel.index]?.name || '操场', sub: '操场' }
      case 'poi':
        return { title: data.pois[sel.index]?.name || 'POI', sub: `POI · ${data.pois[sel.index]?.kind ?? ''}` }
      case 'routePoint':
        return { title: `路线点 ${sel.index + 1}`, sub: '路线' }
      default:
        return { title: '', sub: '' }
    }
  }

  private rebuild(sel: Selection): void {
    this.host.innerHTML = ''
    this.inputs.clear()
    this.fields = this.fieldsFor(sel)
    if (!sel || this.fields.length === 0) {
      const hint = document.createElement('p')
      hint.className = 'empty-hint'
      hint.textContent = '未选择对象 — 在左侧点选建筑 / 道路 / 区域 / POI'
      this.host.appendChild(hint)
      return
    }

    const meta = this.titleFor(sel)
    const h = document.createElement('h2')
    h.textContent = meta.title
    const sub = document.createElement('p')
    sub.className = 'sub'
    sub.textContent = meta.sub
    this.host.appendChild(h)
    this.host.appendChild(sub)

    for (const f of this.fields) {
      this.host.appendChild(this.renderField(f))
    }
  }

  private renderField(f: FieldDesc): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const label = document.createElement('label')
    label.textContent = f.label
    wrap.appendChild(label)

    let el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (f.kind === 'select') {
      const select = document.createElement('select')
      for (const opt of f.options ?? []) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label
        select.appendChild(o)
      }
      el = select
    } else if (f.kind === 'textarea') {
      el = document.createElement('textarea')
    } else {
      const input = document.createElement('input')
      input.type = f.kind === 'number' ? 'number' : 'text'
      if (f.kind === 'readonly') input.readOnly = true
      el = input
    }
    el.value = f.get()
    if (f.kind === 'readonly') {
      el.setAttribute('disabled', 'true')
    } else if (f.apply) {
      const apply = f.apply
      el.addEventListener('focus', () => this.captureBefore())
      el.addEventListener('input', () => {
        apply(el.value)
        this.store.notifyChange()
      })
      el.addEventListener('change', () => this.commit())
    }
    this.inputs.set(f.id, el)
    wrap.appendChild(el)
    return wrap
  }

  private syncValues(): void {
    for (const f of this.fields) {
      const el = this.inputs.get(f.id)
      if (!el || el === document.activeElement) continue
      el.value = f.get()
    }
  }

  private captureBefore(): void {
    if (!this.before) {
      this.before = JSON.parse(JSON.stringify(this.store.data)) as CampusData
    }
  }

  private commit(): void {
    if (this.before) {
      this.store.recordUndo(this.before)
      this.before = null
    }
  }

  // ---- field definitions per selection kind ----------------------------

  private fieldsFor(sel: Selection): FieldDesc[] {
    if (!sel) return []
    const data = this.store.data
    switch (sel.kind) {
      case 'building':
        return this.buildingFields(sel.index)
      case 'road':
        return this.roadFields(sel.index)
      case 'zone':
      case 'water':
      case 'field':
        return this.areaFields(sel.kind, sel.index)
      case 'poi':
        return this.poiFields(sel.index)
      case 'routePoint':
        return this.routePointFields(sel.routeIndex, sel.index)
      default:
        void data
        return []
    }
  }

  private buildingFields(i: number): FieldDesc[] {
    const b = () => this.store.data.buildings[i]
    const zones: Option[] = this.store.data.zones.map((z) => ({ value: z.id, label: `${z.name} (${z.id})` }))
    // ensure current zoneId is selectable even if not in list
    if (b() && !zones.some((z) => z.value === b().zoneId)) {
      zones.unshift({ value: b().zoneId, label: b().zoneId })
    }
    return [
      { id: 'name', label: '名称', kind: 'text', get: () => b().name, apply: (v) => { b().name = v } },
      {
        id: 'category',
        label: '类别',
        kind: 'select',
        options: buildingCategoryOptions.map((c) => ({ value: c, label: c })),
        get: () => b().category,
        apply: (v) => { b().category = v as BuildingCategory },
      },
      { id: 'height', label: '高度', kind: 'number', get: () => String(b().height), apply: (v) => { const n = num(v); if (n !== null) b().height = n } },
      { id: 'sizeW', label: '宽度 (X)', kind: 'number', get: () => String(b().size[0]), apply: (v) => { const n = num(v); if (n !== null) b().size = [n, b().size[1]] } },
      { id: 'sizeD', label: '进深 (Z)', kind: 'number', get: () => String(b().size[1]), apply: (v) => { const n = num(v); if (n !== null) b().size = [b().size[0], n] } },
      { id: 'posX', label: '位置 X', kind: 'number', get: () => String(round(b().position[0])), apply: (v) => this.applyBuildingPos(i, 0, v) },
      { id: 'posZ', label: '位置 Z', kind: 'number', get: () => String(round(b().position[1])), apply: (v) => this.applyBuildingPos(i, 1, v) },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => b().color ?? '', apply: (v) => { b().color = v.trim() ? v.trim() : undefined } },
      { id: 'zoneId', label: '所属区域', kind: 'select', options: zones, get: () => b().zoneId, apply: (v) => { b().zoneId = v } },
      { id: 'info', label: '信息', kind: 'textarea', get: () => b().info ?? '', apply: (v) => { b().info = v.trim() ? v : undefined } },
    ]
  }

  private applyBuildingPos(i: number, axis: 0 | 1, raw: string): void {
    const n = num(raw)
    if (n === null) return
    const b = this.store.data.buildings[i]
    const delta = n - b.position[axis]
    b.position = axis === 0 ? [n, b.position[1]] : [b.position[0], n]
    if (b.footprint && b.footprint.length >= 3) {
      b.footprint = translatePoints(b.footprint, axis === 0 ? delta : 0, axis === 1 ? delta : 0)
    }
  }

  private roadFields(i: number): FieldDesc[] {
    const r = () => this.store.data.roads[i]
    return [
      { id: 'width', label: '宽度', kind: 'number', get: () => String(r().width ?? 3.2), apply: (v) => { const n = num(v); if (n !== null && n > 0) r().width = n } },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => r().color ?? '', apply: (v) => { r().color = v.trim() ? v.trim() : undefined } },
      { id: 'points', label: '节点数', kind: 'readonly', get: () => String(r().points.length) },
    ]
  }

  private areaFields(kind: 'zone' | 'water' | 'field', i: number): FieldDesc[] {
    const list = () => (kind === 'zone' ? this.store.data.zones : kind === 'water' ? this.store.data.waters : this.store.data.fields)
    const item = () => list()[i]
    const fields: FieldDesc[] = [
      { id: 'name', label: '名称', kind: 'text', get: () => item().name, apply: (v) => { item().name = v } },
    ]
    if (kind === 'zone') {
      fields.push({
        id: 'category',
        label: '类别',
        kind: 'select',
        options: ZONE_CATEGORIES,
        get: () => this.store.data.zones[i].category,
        apply: (v) => { this.store.data.zones[i].category = v as ZoneCategory },
      })
    }
    fields.push(
      { id: 'cx', label: '中心 X', kind: 'number', get: () => String(round(item().center[0])), apply: (v) => { const n = num(v); if (n !== null) item().center = [n, item().center[1]] } },
      { id: 'cz', label: '中心 Z', kind: 'number', get: () => String(round(item().center[1])), apply: (v) => { const n = num(v); if (n !== null) item().center = [item().center[0], n] } },
      { id: 'sw', label: '宽度 (X)', kind: 'number', get: () => String(round(item().size[0])), apply: (v) => { const n = num(v); if (n !== null && n > 0) item().size = [n, item().size[1]] } },
      { id: 'sd', label: '高度 (Z)', kind: 'number', get: () => String(round(item().size[1])), apply: (v) => { const n = num(v); if (n !== null && n > 0) item().size = [item().size[0], n] } },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => item().color ?? '', apply: (v) => { item().color = v.trim() ? v.trim() : undefined } },
    )
    if (kind === 'field') {
      fields.push({ id: 'stripe', label: '条纹色 (hex，可空)', kind: 'text', get: () => this.store.data.fields[i].stripeColor ?? '', apply: (v) => { this.store.data.fields[i].stripeColor = v.trim() ? v.trim() : undefined } })
    }
    return fields
  }

  private poiFields(i: number): FieldDesc[] {
    const p = () => this.store.data.pois[i]
    return [
      { id: 'name', label: '名称', kind: 'text', get: () => p().name, apply: (v) => { p().name = v } },
      { id: 'kind', label: '类型', kind: 'select', options: POI_KINDS, get: () => p().kind, apply: (v) => { p().kind = v as 'landmark' | 'service' | 'gate' } },
      { id: 'px', label: '位置 X', kind: 'number', get: () => String(round(p().position[0])), apply: (v) => { const n = num(v); if (n !== null) p().position = [n, p().position[1], p().position[2]] } },
      { id: 'py', label: '高度 Y', kind: 'number', get: () => String(round(p().position[1])), apply: (v) => { const n = num(v); if (n !== null) p().position = [p().position[0], n, p().position[2]] } },
      { id: 'pz', label: '位置 Z', kind: 'number', get: () => String(round(p().position[2])), apply: (v) => { const n = num(v); if (n !== null) p().position = [p().position[0], p().position[1], n] } },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => p().color ?? '', apply: (v) => { p().color = v.trim() ? v.trim() : undefined } },
      { id: 'info', label: '信息', kind: 'textarea', get: () => p().info ?? '', apply: (v) => { p().info = v.trim() ? v : undefined } },
    ]
  }

  private routePointFields(ri: number, i: number): FieldDesc[] {
    const pt = () => this.store.data.routes[ri].points[i]
    const set = (axis: 0 | 1 | 2, raw: string) => {
      const n = num(raw)
      if (n === null) return
      const cur = pt()
      const next: [number, number, number] = [cur[0], cur[1], cur[2]]
      next[axis] = n
      this.store.data.routes[ri].points[i] = next
    }
    return [
      { id: 'x', label: '位置 X', kind: 'number', get: () => String(round(pt()[0])), apply: (v) => set(0, v) },
      { id: 'y', label: '高度 Y', kind: 'number', get: () => String(round(pt()[1])), apply: (v) => set(1, v) },
      { id: 'z', label: '位置 Z', kind: 'number', get: () => String(round(pt()[2])), apply: (v) => set(2, v) },
    ]
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
