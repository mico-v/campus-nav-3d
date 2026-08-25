import type { EditorStore } from './store.ts'
import type { CampusData, BuildingCategory, ZoneCategory } from '../data/campusData.ts'
import { buildingCategoryOptions } from '../data/campusData.ts'
import { translatePoints, polygonBounds, polygonCentroid, type Point } from './geometry.ts'
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

const ROAD_CLASSES: Option[] = [
  { value: 'main', label: 'main（主路）' },
  { value: 'secondary', label: 'secondary（次路）' },
  { value: 'walkway', label: 'walkway（步行道）' },
  { value: 'service', label: 'service（服务道路）' },
  { value: 'cycleway', label: 'cycleway（自行车道）' },
]

const ROAD_SURFACES: Option[] = [
  { value: 'asphalt', label: 'asphalt（沥青）' },
  { value: 'concrete', label: 'concrete（水泥）' },
  { value: 'paving', label: 'paving（铺装）' },
  { value: 'gravel', label: 'gravel（砾石）' },
]

const BOOLEAN_OPTIONS: Option[] = [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]

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
    const data = this.store.data
    let shapeSize = 0
    if (sel.kind === 'building') shapeSize = data.buildings[sel.index]?.footprint?.length ?? 0
    else if (sel.kind === 'road') shapeSize = data.roads[sel.index]?.points.length ?? 0
    else if (sel.kind === 'road-node') shapeSize = data.roadNetwork?.nodes.find((node) => node.id === sel.id)?.sourceIds?.length ?? 0
    else if (sel.kind === 'zone') shapeSize = data.zones[sel.index]?.footprint?.length ?? 0
    else if (sel.kind === 'water') shapeSize = data.waters[sel.index]?.footprint?.length ?? 0
    else if (sel.kind === 'field') shapeSize = data.fields[sel.index]?.footprint?.length ?? 0
    return sel.kind === 'road-node' ? `${sel.kind}:${sel.id}:${shapeSize}` : `${sel.kind}:${sel.index}:${shapeSize}`
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
        return { title: data.roads[sel.index]?.name || data.roads[sel.index]?.id || `道路 ${sel.index + 1}`, sub: `道路 · ${data.roads[sel.index]?.points.length ?? 0} 个节点` }
      case 'road-node': {
        const node = data.roadNetwork?.nodes.find((candidate) => candidate.id === sel.id)
        return { title: node?.kind === 'junction' ? '道路路口节点' : '道路节点', sub: `${node?.kind ?? 'waypoint'} · ${node?.sourceIds?.length ?? 0} 条关联道路` }
      }
      case 'zone':
        return { title: data.zones[sel.index]?.name || '区域', sub: '区域' }
      case 'water':
        return { title: data.waters[sel.index]?.name || '水体', sub: '水体' }
      case 'field':
        return { title: data.fields[sel.index]?.name || '操场', sub: '操场' }
      case 'poi':
        return { title: data.pois[sel.index]?.name || 'POI', sub: `POI · ${data.pois[sel.index]?.kind ?? ''}` }
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

    const extras = this.extrasFor(sel)
    if (extras) this.host.appendChild(extras)
  }

  /** Force a full rebuild on the next render (e.g. after add/remove point). */
  private requestRebuild(): void {
    this.renderedKey = ''
    this.render()
  }

  /** Apply new point array as one undoable mutation, then rebuild the panel. */
  private commitPoints(label: string, apply: (data: CampusData) => void): void {
    this.store.mutate(label, apply)
    this.requestRebuild()
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
      el.addEventListener('blur', () => this.commit())
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

  // ---- point list editors (add / delete / move points) ------------------

  private extrasFor(sel: Selection): HTMLElement | null {
    if (!sel) return null
    switch (sel.kind) {
      case 'building': {
        const b = () => this.store.data.buildings[sel.index]
        if (b()?.footprint && b().footprint!.length >= 3) {
          const editor = this.pointsEditor({
            title: '建筑顶点',
            minPoints: 3,
            closed: true,
            getPoints: () => b().footprint!,
            setPoints: (points) => {
              const bb = b()
              bb.footprint = points.map(([x, z]) => [x, z] as [number, number])
              bb.position = polygonCentroid(bb.footprint)
            },
          })
          editor.appendChild(this.convertBuildingToBoxButton(sel.index))
          return editor
        }
        return this.convertToFootprintButton('building', sel.index)
      }
      case 'road': {
        const r = () => this.store.data.roads[sel.index]
        if (!r()) return null
        return this.pointsEditor({
          title: '道路节点',
          minPoints: 2,
          closed: false,
          getPoints: () => r().points,
          setPoints: (points) => { r().points = points.map(([x, z]) => [x, z] as [number, number]) },
        })
      }
      case 'road-node':
        return null
      case 'zone':
      case 'water':
      case 'field': {
        const list = () => (sel.kind === 'zone' ? this.store.data.zones : sel.kind === 'water' ? this.store.data.waters : this.store.data.fields)
        const item = () => list()[sel.index]
        if (item()?.footprint && item().footprint!.length >= 3) {
          const title = sel.kind === 'zone' ? '区域顶点' : sel.kind === 'water' ? '水体顶点' : '操场顶点'
          return this.pointsEditor({
            title,
            minPoints: 3,
            closed: true,
            getPoints: () => item().footprint!,
            setPoints: (points) => {
              const it = item()
              it.footprint = points.map(([x, z]) => [x, z] as [number, number])
              it.center = polygonCentroid(it.footprint)
            },
          })
        }
        return this.convertToFootprintButton(sel.kind, sel.index)
      }
      default:
        return null
    }
  }

  /**
   * Editable list of points: per-point X/Z inputs plus insert-after / delete
   * buttons and an append button. Coordinate edits are live (single undo step
   * per edit); add/remove go through the store as discrete undo steps.
   */
  private pointsEditor(config: {
    title: string
    minPoints: number
    closed: boolean
    getPoints: () => Point[]
    setPoints: (points: Point[]) => void
  }): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'points-editor'
    const points = config.getPoints()
    const h = document.createElement('h3')
    h.textContent = `${config.title}（${points.length} 个点）`
    wrap.appendChild(h)

    const hint = document.createElement('p')
    hint.className = 'points-hint'
    hint.textContent = '可直接修改坐标；「＋」在该点后插入中点，「×」删除该点'
    wrap.appendChild(hint)

    const apply = (label: string, next: Point[]): void => {
      this.commitPoints(label, () => config.setPoints(next))
    }

    points.forEach((point, index) => {
      const row = document.createElement('div')
      row.className = 'points-row'
      const idx = document.createElement('span')
      idx.className = 'points-idx'
      idx.textContent = String(index + 1)
      row.appendChild(idx)

      const setCoord = (axis: 0 | 1, raw: string): void => {
        const n = num(raw)
        if (n === null) return
        config.getPoints()[index][axis] = n
      }
      for (const axis of [0, 1] as const) {
        const input = document.createElement('input')
        input.type = 'number'
        input.step = 'any'
        input.title = axis === 0 ? 'X' : 'Z'
        input.value = String(round(point[axis]))
        input.addEventListener('focus', () => this.captureBefore())
        input.addEventListener('input', () => { setCoord(axis, input.value); this.store.notifyChange() })
        input.addEventListener('change', () => this.commit())
        input.addEventListener('blur', () => this.commit())
        row.appendChild(input)
      }

      const insertBtn = document.createElement('button')
      insertBtn.type = 'button'
      insertBtn.className = 'tool tiny'
      insertBtn.textContent = '＋'
      insertBtn.title = '在此点后插入（取相邻点中点）'
      insertBtn.addEventListener('click', () => {
        const pts = config.getPoints()
        const nextIndex = config.closed ? (index + 1) % pts.length : Math.min(index + 1, pts.length - 1)
        if (!config.closed && index === pts.length - 1) {
          const last = pts[pts.length - 1]
          apply('append-point', [...pts, [last[0] + 2, last[1]] as Point])
          return
        }
        const a = pts[index]
        const b = pts[nextIndex]
        apply('insert-point', [...pts.slice(0, index + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point, ...pts.slice(index + 1)])
      })
      row.appendChild(insertBtn)

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'tool tiny danger'
      deleteBtn.textContent = '×'
      deleteBtn.title = '删除此点'
      deleteBtn.disabled = points.length <= config.minPoints
      deleteBtn.addEventListener('click', () => {
        const pts = config.getPoints()
        apply('remove-point', pts.filter((_, i) => i !== index))
      })
      row.appendChild(deleteBtn)

      wrap.appendChild(row)
    })

    const appendBtn = document.createElement('button')
    appendBtn.type = 'button'
    appendBtn.className = 'tool small'
    appendBtn.textContent = '＋ 在末尾添加点'
    appendBtn.addEventListener('click', () => {
      const pts = config.getPoints()
      const last = pts[pts.length - 1]
      apply('append-point', [...pts, [last[0] + 2, last[1]] as Point])
    })
    wrap.appendChild(appendBtn)
    return wrap
  }

  /** Convert a box-shaped item into an editable polygon footprint. */
  private convertToFootprintButton(kind: 'building' | 'zone' | 'water' | 'field', i: number): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'points-editor'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tool small'
    btn.textContent = '转为多边形轮廓（可添加/删除顶点）'
    btn.addEventListener('click', () => {
      this.commitPoints('convert-to-footprint', (d) => {
        const centerOf = (c: [number, number], size: [number, number]): Point[] => [
          [c[0] - size[0] / 2, c[1] - size[1] / 2],
          [c[0] + size[0] / 2, c[1] - size[1] / 2],
          [c[0] + size[0] / 2, c[1] + size[1] / 2],
          [c[0] - size[0] / 2, c[1] + size[1] / 2],
        ]
        if (kind === 'building') {
          const b = d.buildings[i]
          if (b) b.footprint = centerOf(b.position, b.size)
        } else {
          const list = kind === 'zone' ? d.zones : kind === 'water' ? d.waters : d.fields
          const item = list[i]
          if (item) item.footprint = centerOf(item.center, item.size)
        }
      })
    })
    wrap.appendChild(btn)
    return wrap
  }

  /** Convert a polygon building back to an axis-aligned rectangle. */
  private convertBuildingToBoxButton(index: number): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'geometry-convert'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tool small'
    btn.textContent = '转为矩形建筑（按轮廓包围盒）'
    btn.addEventListener('click', () => {
      this.commitPoints('convert-to-box', (data) => {
        const building = data.buildings[index]
        if (!building?.footprint || building.footprint.length < 3) return
        const bounds = polygonBounds(building.footprint)
        building.position = [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
        building.size = [Math.max(0.01, bounds.width), Math.max(0.01, bounds.depth)]
        delete building.footprint
      })
    })
    wrap.appendChild(btn)
    return wrap
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
      case 'road-node': {
        const node = () => this.store.data.roadNetwork?.nodes.find((candidate) => candidate.id === sel.id)
        return node() ? [
          { id: 'id', label: '节点 ID', kind: 'readonly', get: () => node()?.id ?? '' },
          { id: 'kind', label: '节点类型', kind: 'readonly', get: () => node()?.kind ?? '' },
          { id: 'x', label: '位置 X', kind: 'readonly', get: () => String(round(node()?.position[0] ?? 0)) },
          { id: 'z', label: '位置 Z', kind: 'readonly', get: () => String(round(node()?.position[1] ?? 0)) },
          { id: 'roads', label: '关联道路', kind: 'readonly', get: () => node()?.sourceIds?.join(', ') ?? '' },
        ] : []
      }
      case 'zone':
      case 'water':
      case 'field':
        return this.areaFields(sel.kind, sel.index)
      case 'poi':
        return this.poiFields(sel.index)
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
      zones.unshift({ value: b().zoneId!, label: b().zoneId! })
    }
    return [
      { id: 'id', label: 'ID', kind: 'text', get: () => b().id, apply: (v) => { const id = v.trim(); if (id) b().id = id } },
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
      { id: 'zoneId', label: '所属区域', kind: 'select', options: zones, get: () => b().zoneId ?? '', apply: (v) => { b().zoneId = v || undefined } },
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
      {
        id: 'id',
        label: 'ID',
        kind: 'text',
        get: () => r().id,
        apply: (v) => {
          const road = r()
          const id = v.trim()
          if (!id || id === road.id) return
          const previousId = road.id
          road.id = id
          road.sourceIds = [...new Set((road.sourceIds ?? [previousId]).map((sourceId) => sourceId === previousId ? id : sourceId))]
          if (road.routing?.sourceIds) road.routing.sourceIds = [...new Set(road.routing.sourceIds.map((sourceId) => sourceId === previousId ? id : sourceId))]
        },
      },
      { id: 'name', label: '名称（便于搜索，可空）', kind: 'text', get: () => r().name ?? '', apply: (v) => { r().name = v.trim() || undefined } },
      {
        id: 'kind',
        label: '显示类型',
        kind: 'select',
        options: [
          { value: 'road', label: 'road（道路）' },
          { value: 'graph', label: 'graph（隐形导航图）' },
          { value: 'canal', label: 'canal（水道）' },
        ],
        get: () => r().kind ?? 'road',
        apply: (v) => { r().kind = v as 'graph' | 'road' | 'canal' },
      },
      { id: 'width', label: '宽度', kind: 'number', get: () => String(r().width ?? 3.2), apply: (v) => { const n = num(v); if (n !== null && n > 0) r().width = n } },
      { id: 'roadClass', label: '道路等级', kind: 'select', options: ROAD_CLASSES, get: () => r().roadClass ?? 'secondary', apply: (v) => { r().roadClass = v as 'main' | 'secondary' | 'walkway' | 'service' | 'cycleway' } },
      { id: 'surface', label: '路面材质', kind: 'select', options: ROAD_SURFACES, get: () => r().surface ?? 'concrete', apply: (v) => { r().surface = v as 'asphalt' | 'concrete' | 'paving' | 'gravel' } },
      { id: 'pedestrian', label: '允许步行', kind: 'select', options: BOOLEAN_OPTIONS, get: () => String(r().access?.pedestrian ?? true), apply: (v) => { r().access = { pedestrian: v === 'true', bicycle: r().access?.bicycle ?? true, vehicle: r().access?.vehicle ?? false } } },
      { id: 'bicycle', label: '允许骑行', kind: 'select', options: BOOLEAN_OPTIONS, get: () => String(r().access?.bicycle ?? true), apply: (v) => { r().access = { pedestrian: r().access?.pedestrian ?? true, bicycle: v === 'true', vehicle: r().access?.vehicle ?? false } } },
      { id: 'vehicle', label: '允许机动车', kind: 'select', options: BOOLEAN_OPTIONS, get: () => String(r().access?.vehicle ?? false), apply: (v) => { r().access = { pedestrian: r().access?.pedestrian ?? true, bicycle: r().access?.bicycle ?? true, vehicle: v === 'true' } } },
      { id: 'oneWay', label: '单向通行', kind: 'select', options: BOOLEAN_OPTIONS, get: () => String(r().oneWay ?? false), apply: (v) => { r().oneWay = v === 'true' } },
      { id: 'speed', label: '速度（米/秒，可空）', kind: 'number', get: () => r().speed === undefined ? '' : String(r().speed), apply: (v) => { const n = num(v); r().speed = n !== null && n > 0 ? n : undefined } },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => r().color ?? '', apply: (v) => { r().color = v.trim() ? v.trim() : undefined } },
      { id: 'points', label: '节点数', kind: 'readonly', get: () => String(r().points.length) },
    ]
  }

  private areaFields(kind: 'zone' | 'water' | 'field', i: number): FieldDesc[] {
    const list = () => (kind === 'zone' ? this.store.data.zones : kind === 'water' ? this.store.data.waters : this.store.data.fields)
    const item = () => list()[i]
    const fields: FieldDesc[] = [
      { id: 'id', label: 'ID', kind: 'text', get: () => item().id, apply: (v) => { const id = v.trim(); if (id) item().id = id } },
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
      { id: 'id', label: 'ID', kind: 'text', get: () => p().id, apply: (v) => { const id = v.trim(); if (id) p().id = id } },
      { id: 'name', label: '名称', kind: 'text', get: () => p().name, apply: (v) => { p().name = v } },
      { id: 'kind', label: '类型', kind: 'select', options: POI_KINDS, get: () => p().kind, apply: (v) => { p().kind = v as 'landmark' | 'service' | 'gate' } },
      { id: 'px', label: '位置 X', kind: 'number', get: () => String(round(p().position[0])), apply: (v) => { const n = num(v); if (n !== null) p().position = [n, p().position[1], p().position[2]] } },
      { id: 'py', label: '高度 Y', kind: 'number', get: () => String(round(p().position[1])), apply: (v) => { const n = num(v); if (n !== null) p().position = [p().position[0], n, p().position[2]] } },
      { id: 'pz', label: '位置 Z', kind: 'number', get: () => String(round(p().position[2])), apply: (v) => { const n = num(v); if (n !== null) p().position = [p().position[0], p().position[1], n] } },
      { id: 'color', label: '颜色 (hex，可空)', kind: 'text', get: () => p().color ?? '', apply: (v) => { p().color = v.trim() ? v.trim() : undefined } },
      { id: 'info', label: '信息', kind: 'textarea', get: () => p().info ?? '', apply: (v) => { p().info = v.trim() ? v : undefined } },
    ]
  }

}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
