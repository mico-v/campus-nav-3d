import type { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'
import type { LayerFlags, Selection } from './types.ts'
import { defaultLayerFlags } from './types.ts'
import {
  worldToScreen,
  screenToWorld,
  fitView,
  zoomAt,
  pan,
  type ViewState,
  type ViewBounds,
} from './projection.ts'
import {
  polygonBounds,
  polygonCentroid,
  pointInPolygon,
  nearestVertex,
  nearestEdge,
  insertVertex,
  translatePoints,
  distance,
  type Point,
} from './geometry.ts'

type AreaKind = 'zone' | 'water' | 'field'

type DragState =
  | { kind: 'pan' }
  | { kind: 'bVertex'; b: number; v: number }
  | { kind: 'bMove'; b: number }
  | { kind: 'bCorner'; b: number; c: number }
  | { kind: 'rVertex'; r: number; v: number }
  | { kind: 'rMove'; r: number }
  | { kind: 'aCorner'; a: AreaKind; i: number; c: number }
  | { kind: 'aMove'; a: AreaKind; i: number }
  | { kind: 'poiMove'; i: number }
  | { kind: 'rpMove'; r: number; i: number }

type ActiveVertex = { kind: 'building' | 'road'; index: number; vertex: number } | null

const SVG_NS = 'http://www.w3.org/2000/svg'

const CATEGORY_COLORS: Record<string, string> = {
  dorm: '#c4b5fd',
  academic: '#93c5fd',
  admin: '#86efac',
  sports: '#67e8f9',
  library: '#fde68a',
  gate: '#fb923c',
  canteen: '#fca5a5',
  service: '#fdba74',
  poi: '#f9a8d4',
  landscape: '#86efac',
}

const VERTEX_HIT_PX = 9
const EDGE_HIT_PX = 7
const POINT_HIT_PX = 10
const FIT_PAD = 40

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value))
  }
  return node
}

export function computeDataBounds(data: CampusData): ViewBounds {
  const xs: number[] = []
  const zs: number[] = []
  const push = (x: number, z: number) => {
    xs.push(x)
    zs.push(z)
  }
  for (const b of data.buildings) {
    if (b.footprint && b.footprint.length >= 3) {
      for (const [x, z] of b.footprint) push(x, z)
    } else {
      push(b.position[0] - b.size[0] / 2, b.position[1] - b.size[1] / 2)
      push(b.position[0] + b.size[0] / 2, b.position[1] + b.size[1] / 2)
    }
  }
  for (const r of data.roads) for (const [x, z] of r.points) push(x, z)
  for (const z of data.zones) {
    push(z.center[0] - z.size[0] / 2, z.center[1] - z.size[1] / 2)
    push(z.center[0] + z.size[0] / 2, z.center[1] + z.size[1] / 2)
  }
  for (const w of data.waters) {
    push(w.center[0] - w.size[0] / 2, w.center[1] - w.size[1] / 2)
    push(w.center[0] + w.size[0] / 2, w.center[1] + w.size[1] / 2)
  }
  for (const f of data.fields) {
    push(f.center[0] - f.size[0] / 2, f.center[1] - f.size[1] / 2)
    push(f.center[0] + f.size[0] / 2, f.center[1] + f.size[1] / 2)
  }
  for (const p of data.pois) push(p.position[0], p.position[2])
  for (const route of data.routes) for (const [x, , z] of route.points) push(x, z)
  if (xs.length === 0) return { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

export class Canvas2D {
  protected host: HTMLElement
  protected store: EditorStore
  protected layers: LayerFlags = defaultLayerFlags()
  protected svgRoot: SVGSVGElement
  protected view: ViewState = { scale: 1, offsetX: 0, offsetY: 0 }
  private viewInitialized = false

  constructor(host: HTMLElement, store: EditorStore) {
    this.host = host
    this.store = store
    this.svgRoot = svg('svg', {})
    host.appendChild(this.svgRoot)
    this.attachViewHandlers()
    const ro = new ResizeObserver(() => {
      if (!this.viewInitialized) this.fitToData()
      else this.render()
    })
    ro.observe(host)
  }

  setLayers(flags: LayerFlags): void {
    this.layers = flags
    this.render()
  }

  fitToData(): void {
    const rect = this.host.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return // layout not ready yet
    this.view = fitView(computeDataBounds(this.store.data), rect.width, rect.height, FIT_PAD)
    this.viewInitialized = true
    this.render()
  }

  protected toScreen(x: number, z: number): [number, number] {
    return worldToScreen(this.view, x, z)
  }

  protected toWorld(sx: number, sy: number): Point {
    return screenToWorld(this.view, sx, sy)
  }

  protected pointerToScreen(event: PointerEvent | WheelEvent): [number, number] {
    const rect = this.svgRoot.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  // ---- view navigation + editing interaction ---------------------------

  private drag: DragState | null = null
  private dragBefore: CampusData | null = null
  private dragMoved = false
  private prevWorld: Point = [0, 0]
  private prevScreen: [number, number] = [0, 0]
  protected activeVertex: ActiveVertex = null

  private attachViewHandlers(): void {
    this.svgRoot.addEventListener('wheel', (event) => {
      event.preventDefault()
      const [sx, sy] = this.pointerToScreen(event)
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      this.view = zoomAt(this.view, sx, sy, factor)
      this.render()
    })
    this.svgRoot.addEventListener('pointerdown', (event) => this.handlePointerDown(event))
    this.svgRoot.addEventListener('pointermove', (event) => this.handlePointerMove(event))
    this.svgRoot.addEventListener('pointerup', (event) => this.handlePointerUp(event))
    this.svgRoot.addEventListener('pointercancel', (event) => this.handlePointerUp(event))
    this.svgRoot.addEventListener('dblclick', (event) => this.handleDoubleClick(event))
    window.addEventListener('keydown', (event) => this.handleKeyDown(event))
  }

  private boxCorners(center: Point, size: [number, number]): Point[] {
    return [
      [center[0] - size[0] / 2, center[1] - size[1] / 2],
      [center[0] + size[0] / 2, center[1] - size[1] / 2],
      [center[0] + size[0] / 2, center[1] + size[1] / 2],
      [center[0] - size[0] / 2, center[1] + size[1] / 2],
    ]
  }

  private hitCorner(corners: Point[], world: Point): number | null {
    const idx = nearestVertex(corners, world, this.worldThreshold(VERTEX_HIT_PX))
    return idx
  }

  /** If `world` is near a draggable handle of the current selection, return its drag descriptor. */
  private pickHandle(world: Point): DragState | null {
    const sel = this.store.selection
    if (!sel) return null
    const data = this.store.data
    if (sel.kind === 'building') {
      const b = data.buildings[sel.index]
      if (!b) return null
      if (b.footprint && b.footprint.length >= 3) {
        const v = this.hitVertex(b.footprint, world)
        if (v !== null) {
          this.activeVertex = { kind: 'building', index: sel.index, vertex: v }
          return { kind: 'bVertex', b: sel.index, v }
        }
      } else {
        const c = this.hitCorner(this.boxCorners(b.position, b.size), world)
        if (c !== null) return { kind: 'bCorner', b: sel.index, c }
      }
    } else if (sel.kind === 'road') {
      const r = data.roads[sel.index]
      if (!r) return null
      const v = this.hitVertex(r.points, world)
      if (v !== null) {
        this.activeVertex = { kind: 'road', index: sel.index, vertex: v }
        return { kind: 'rVertex', r: sel.index, v }
      }
    } else if (sel.kind === 'zone' || sel.kind === 'water' || sel.kind === 'field') {
      const list = this.areaList(sel.kind)
      const item = list[sel.index]
      if (!item) return null
      const c = this.hitCorner(this.boxCorners(item.center, item.size), world)
      if (c !== null) return { kind: 'aCorner', a: sel.kind, i: sel.index, c }
    }
    return null
  }

  private areaList(kind: AreaKind) {
    const data = this.store.data
    return kind === 'zone' ? data.zones : kind === 'water' ? data.waters : data.fields
  }

  private moveDragFor(sel: Selection): DragState | null {
    if (!sel) return null
    switch (sel.kind) {
      case 'building':
        return { kind: 'bMove', b: sel.index }
      case 'road':
        return { kind: 'rMove', r: sel.index }
      case 'zone':
      case 'water':
      case 'field':
        return { kind: 'aMove', a: sel.kind, i: sel.index }
      case 'poi':
        return { kind: 'poiMove', i: sel.index }
      case 'routePoint':
        return { kind: 'rpMove', r: sel.routeIndex, i: sel.index }
      default:
        return null
    }
  }

  private startDrag(drag: DragState, world: Point, screen: [number, number], pointerId: number): void {
    this.drag = drag
    this.dragBefore = JSON.parse(JSON.stringify(this.store.data)) as CampusData
    this.dragMoved = false
    this.prevWorld = world
    this.prevScreen = screen
    if (this.svgRoot.setPointerCapture) this.svgRoot.setPointerCapture(pointerId)
  }

  protected handlePointerDown(event: PointerEvent): void {
    const screen = this.pointerToScreen(event)
    const world = this.toWorld(screen[0], screen[1])

    // 1) grab a handle of the current selection
    const handle = this.pickHandle(world)
    if (handle) {
      this.startDrag(handle, world, screen, event.pointerId)
      return
    }

    // 2) (re)select what's under the cursor
    const hit = this.hitTest(world, screen)
    this.store.select(hit)
    if (hit) {
      if (hit.kind !== 'building' && hit.kind !== 'road') this.activeVertex = null
      const move = this.moveDragFor(hit)
      if (move) this.startDrag(move, world, screen, event.pointerId)
      return
    }

    // 3) empty space → pan
    this.activeVertex = null
    this.startDrag({ kind: 'pan' }, world, screen, event.pointerId)
  }

  protected handlePointerMove(event: PointerEvent): void {
    if (!this.drag) return
    const screen = this.pointerToScreen(event)
    if (this.drag.kind === 'pan') {
      this.view = pan(this.view, screen[0] - this.prevScreen[0], screen[1] - this.prevScreen[1])
      this.prevScreen = screen
      this.render()
      return
    }
    const world = this.toWorld(screen[0], screen[1])
    const dx = world[0] - this.prevWorld[0]
    const dz = world[1] - this.prevWorld[1]
    if (dx === 0 && dz === 0) return
    this.dragMoved = true
    this.applyDrag(this.drag, world, dx, dz)
    this.prevWorld = world
    this.prevScreen = screen
    this.store.notifyChange()
  }

  private applyDrag(drag: DragState, world: Point, dx: number, dz: number): void {
    const data = this.store.data
    switch (drag.kind) {
      case 'bVertex': {
        const b = data.buildings[drag.b]
        if (!b.footprint) return
        b.footprint[drag.v] = [world[0], world[1]]
        b.position = polygonCentroid(b.footprint)
        break
      }
      case 'bMove': {
        const b = data.buildings[drag.b]
        if (b.footprint && b.footprint.length >= 3) {
          b.footprint = translatePoints(b.footprint, dx, dz)
          b.position = polygonCentroid(b.footprint)
        } else {
          b.position = [b.position[0] + dx, b.position[1] + dz]
        }
        break
      }
      case 'bCorner': {
        const b = data.buildings[drag.b]
        const next = this.resizeFromCorner(b.position, b.size, drag.c, world)
        b.position = next.center
        b.size = next.size
        break
      }
      case 'rVertex': {
        data.roads[drag.r].points[drag.v] = [world[0], world[1]]
        break
      }
      case 'rMove': {
        const r = data.roads[drag.r]
        r.points = translatePoints(r.points, dx, dz)
        break
      }
      case 'aCorner': {
        const item = this.areaList(drag.a)[drag.i]
        const next = this.resizeFromCorner(item.center, item.size, drag.c, world)
        item.center = next.center
        item.size = next.size
        break
      }
      case 'aMove': {
        const item = this.areaList(drag.a)[drag.i]
        item.center = [item.center[0] + dx, item.center[1] + dz]
        break
      }
      case 'poiMove': {
        const p = data.pois[drag.i]
        p.position = [p.position[0] + dx, p.position[1], p.position[2] + dz]
        break
      }
      case 'rpMove': {
        const pt = data.routes[drag.r].points[drag.i]
        data.routes[drag.r].points[drag.i] = [pt[0] + dx, pt[1], pt[2] + dz]
        break
      }
      case 'pan':
        break
    }
  }

  /** Resize an axis-aligned box by dragging `corner` to `world`; the opposite corner stays fixed. */
  private resizeFromCorner(
    center: Point,
    size: [number, number],
    corner: number,
    world: Point,
  ): { center: Point; size: [number, number] } {
    const corners = this.boxCorners(center, size)
    const fixed = corners[(corner + 2) % 4]
    const minX = Math.min(fixed[0], world[0])
    const maxX = Math.max(fixed[0], world[0])
    const minZ = Math.min(fixed[1], world[1])
    const maxZ = Math.max(fixed[1], world[1])
    const width = Math.max(1, maxX - minX)
    const depth = Math.max(1, maxZ - minZ)
    return { center: [(minX + maxX) / 2, (minZ + maxZ) / 2], size: [width, depth] }
  }

  protected handlePointerUp(event: PointerEvent): void {
    if (!this.drag) return
    if (this.drag.kind !== 'pan' && this.dragMoved && this.dragBefore) {
      this.store.recordUndo(this.dragBefore)
    }
    if (this.svgRoot.hasPointerCapture && this.svgRoot.hasPointerCapture(event.pointerId)) {
      this.svgRoot.releasePointerCapture(event.pointerId)
    }
    this.drag = null
    this.dragBefore = null
  }

  private handleDoubleClick(event: MouseEvent): void {
    const screen = this.pointerToScreen(event as unknown as PointerEvent)
    const world = this.toWorld(screen[0], screen[1])
    const sel = this.store.selection
    if (!sel) return
    if (sel.kind === 'building') {
      const b = this.store.data.buildings[sel.index]
      if (!b.footprint || b.footprint.length < 3) return
      const edge = this.hitEdge(b.footprint, world)
      if (!edge) return
      this.store.mutate('insert-vertex', (d) => {
        const bb = d.buildings[sel.index]
        bb.footprint = insertVertex(bb.footprint!, edge.index, edge.point)
        bb.position = polygonCentroid(bb.footprint)
      })
    } else if (sel.kind === 'road') {
      const r = this.store.data.roads[sel.index]
      const edge = this.hitEdge(r.points, world)
      if (!edge) return
      this.store.mutate('insert-road-node', (d) => {
        d.roads[sel.index].points = insertVertex(d.roads[sel.index].points, edge.index, edge.point)
      })
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return
    }
    const av = this.activeVertex
    if (!av) return
    if (av.kind === 'building') {
      const b = this.store.data.buildings[av.index]
      if (!b?.footprint || b.footprint.length <= 3) return
      event.preventDefault()
      this.store.mutate('remove-vertex', (d) => {
        const bb = d.buildings[av.index]
        bb.footprint!.splice(av.vertex, 1)
        bb.position = polygonCentroid(bb.footprint!)
      })
    } else {
      const r = this.store.data.roads[av.index]
      if (!r || r.points.length <= 2) return
      event.preventDefault()
      this.store.mutate('remove-road-node', (d) => {
        d.roads[av.index].points.splice(av.vertex, 1)
      })
    }
    this.activeVertex = null
  }

  // ---- hit testing -----------------------------------------------------

  protected worldThreshold(px: number): number {
    return px / this.view.scale
  }

  protected hitTest(world: Point, _screen: [number, number]): Selection {
    const data = this.store.data
    // POIs (small, on top)
    if (this.layers.pois) {
      for (let i = data.pois.length - 1; i >= 0; i--) {
        const p = data.pois[i]
        if (distance([p.position[0], p.position[2]], world) <= this.worldThreshold(POINT_HIT_PX)) {
          return { kind: 'poi', index: i }
        }
      }
    }
    // Route points
    if (this.layers.route) {
      for (let ri = 0; ri < data.routes.length; ri++) {
        const pts = data.routes[ri].points
        for (let i = 0; i < pts.length; i++) {
          if (distance([pts[i][0], pts[i][2]], world) <= this.worldThreshold(POINT_HIT_PX)) {
            return { kind: 'routePoint', routeIndex: ri, index: i }
          }
        }
      }
    }
    // Buildings
    if (this.layers.buildings) {
      for (let i = data.buildings.length - 1; i >= 0; i--) {
        const b = data.buildings[i]
        if (b.footprint && b.footprint.length >= 3) {
          if (pointInPolygon(world, b.footprint)) return { kind: 'building', index: i }
        } else {
          const [cx, cz] = b.position
          if (
            Math.abs(world[0] - cx) <= b.size[0] / 2 &&
            Math.abs(world[1] - cz) <= b.size[1] / 2
          ) {
            return { kind: 'building', index: i }
          }
        }
      }
    }
    // Roads
    if (this.layers.roads) {
      for (let i = data.roads.length - 1; i >= 0; i--) {
        const r = data.roads[i]
        if (r.points.length >= 2) {
          const edge = nearestEdge(r.points, world, this.worldThreshold(EDGE_HIT_PX + (r.width ?? 3) / 2))
          if (edge) return { kind: 'road', index: i }
        }
      }
    }
    // Fields / waters / zones (area pick)
    for (const kind of ['field', 'water', 'zone'] as const) {
      if (kind === 'field' && !this.layers.fields) continue
      if (kind === 'water' && !this.layers.waters) continue
      if (kind === 'zone' && !this.layers.zones) continue
      const list =
        kind === 'field' ? data.fields : kind === 'water' ? data.waters : data.zones
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]
        if (
          Math.abs(world[0] - item.center[0]) <= item.size[0] / 2 &&
          Math.abs(world[1] - item.center[1]) <= item.size[1] / 2
        ) {
          return { kind, index: i }
        }
      }
    }
    return null
  }

  // ---- rendering -------------------------------------------------------

  render(): void {
    if (!this.viewInitialized) {
      this.fitToData()
      if (this.viewInitialized) return // fitToData already rendered
    }
    const data = this.store.data
    const selection = this.store.selection
    while (this.svgRoot.firstChild) this.svgRoot.removeChild(this.svgRoot.firstChild)

    const ground = this.layerGroup('ground')
    const bounds = computeDataBounds(data)
    const [gx1, gy1] = this.toScreen(bounds.minX, bounds.minZ)
    const [gx2, gy2] = this.toScreen(bounds.maxX, bounds.maxZ)
    ground.appendChild(
      svg('rect', {
        x: Math.min(gx1, gx2),
        y: Math.min(gy1, gy2),
        width: Math.abs(gx2 - gx1),
        height: Math.abs(gy2 - gy1),
        fill: '#0c1a2e',
        stroke: '#1e3a5f',
        'stroke-width': 1,
      }),
    )

    if (this.layers.zones) {
      const g = this.layerGroup('zones')
      for (const z of data.zones) this.drawRect(g, z.center, z.size, z.color, 0.28)
    }
    if (this.layers.waters) {
      const g = this.layerGroup('waters')
      for (const w of data.waters) this.drawEllipse(g, w.center, w.size, w.color ?? '#60a5fa')
    }
    if (this.layers.fields) {
      const g = this.layerGroup('fields')
      for (const f of data.fields) this.drawRect(g, f.center, f.size, f.color ?? '#22c55e', 0.5)
    }
    if (this.layers.roads) {
      const g = this.layerGroup('roads')
      data.roads.forEach((r, i) => {
        if (r.points.length < 2) return
        const selected = selection?.kind === 'road' && selection.index === i
        g.appendChild(
          svg('polyline', {
            points: r.points.map(([x, z]) => this.toScreen(x, z).join(',')).join(' '),
            fill: 'none',
            stroke: selected ? '#f8fafc' : r.color ?? '#94a3b8',
            'stroke-width': Math.max(1, (r.width ?? 3.2) * this.view.scale),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: selected ? 1 : 0.85,
          }),
        )
      })
    }
    if (this.layers.trees) {
      const g = this.layerGroup('trees')
      for (const [x, z] of data.trees) {
        const [sx, sy] = this.toScreen(x, z)
        g.appendChild(svg('circle', { cx: sx, cy: sy, r: 2.5, fill: '#3f9c58', opacity: 0.7 }))
      }
    }
    if (this.layers.buildings) {
      const g = this.layerGroup('buildings')
      data.buildings.forEach((b, i) => {
        const selected = selection?.kind === 'building' && selection.index === i
        const color = b.color ?? CATEGORY_COLORS[b.category] ?? '#cbd5e1'
        if (b.footprint && b.footprint.length >= 3) {
          g.appendChild(
            svg('polygon', {
              points: b.footprint.map(([x, z]) => this.toScreen(x, z).join(',')).join(' '),
              fill: color,
              'fill-opacity': selected ? 0.85 : 0.7,
              stroke: selected ? '#f43f5e' : '#0f172a',
              'stroke-width': selected ? 2 : 0.75,
            }),
          )
        } else {
          this.drawRect(g, b.position, b.size, color, selected ? 0.85 : 0.7, selected ? '#f43f5e' : '#0f172a', selected ? 2 : 0.75)
        }
      })
    }
    if (this.layers.route) {
      const g = this.layerGroup('route')
      for (const route of data.routes) {
        if (route.points.length < 2) continue
        g.appendChild(
          svg('polyline', {
            points: route.points.map(([x, , z]) => this.toScreen(x, z).join(',')).join(' '),
            fill: 'none',
            stroke: '#ff4fa3',
            'stroke-width': 2,
            'stroke-dasharray': '6 4',
            opacity: 0.9,
          }),
        )
        route.points.forEach(([x, , z]) => {
          const [sx, sy] = this.toScreen(x, z)
          g.appendChild(svg('circle', { cx: sx, cy: sy, r: 3, fill: '#ff8dc7' }))
        })
      }
    }
    if (this.layers.pois) {
      const g = this.layerGroup('pois')
      data.pois.forEach((p, i) => {
        const selected = selection?.kind === 'poi' && selection.index === i
        const [sx, sy] = this.toScreen(p.position[0], p.position[2])
        g.appendChild(
          svg('circle', {
            cx: sx,
            cy: sy,
            r: selected ? 6 : 4,
            fill: p.color ?? '#fbbf24',
            stroke: selected ? '#f43f5e' : '#0f172a',
            'stroke-width': selected ? 2 : 0.75,
          }),
        )
      })
    }

    this.drawSelectionHandles(selection)
  }

  protected layerGroup(name: string): SVGGElement {
    const g = svg('g', { 'data-layer': name })
    this.svgRoot.appendChild(g)
    return g
  }

  protected drawRect(
    g: SVGGElement,
    center: [number, number],
    size: [number, number],
    color: string,
    opacity: number,
    stroke = 'none',
    strokeWidth = 0,
  ): void {
    const [x1, y1] = this.toScreen(center[0] - size[0] / 2, center[1] - size[1] / 2)
    const [x2, y2] = this.toScreen(center[0] + size[0] / 2, center[1] + size[1] / 2)
    g.appendChild(
      svg('rect', {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        fill: color,
        'fill-opacity': opacity,
        stroke,
        'stroke-width': strokeWidth,
      }),
    )
  }

  protected drawEllipse(g: SVGGElement, center: [number, number], size: [number, number], color: string): void {
    const [cx, cy] = this.toScreen(center[0], center[1])
    g.appendChild(
      svg('ellipse', {
        cx,
        cy,
        rx: (size[0] / 2) * this.view.scale,
        ry: (size[1] / 2) * this.view.scale,
        fill: color,
        'fill-opacity': 0.75,
      }),
    )
  }

  protected handleMarker(sx: number, sy: number, fill = '#38bdf8'): SVGRectElement {
    return svg('rect', {
      x: sx - 4,
      y: sy - 4,
      width: 8,
      height: 8,
      fill,
      stroke: '#0f172a',
      'stroke-width': 1,
    })
  }

  protected drawSelectionHandles(selection: Selection): void {
    if (!selection) return
    const data = this.store.data
    const g = this.layerGroup('handles')
    if (selection.kind === 'building') {
      const b = data.buildings[selection.index]
      if (!b) return
      if (b.footprint && b.footprint.length >= 3) {
        for (const [x, z] of b.footprint) {
          const [sx, sy] = this.toScreen(x, z)
          g.appendChild(this.handleMarker(sx, sy))
        }
      } else {
        // corner handles for size + center handle
        const corners: Point[] = [
          [b.position[0] - b.size[0] / 2, b.position[1] - b.size[1] / 2],
          [b.position[0] + b.size[0] / 2, b.position[1] - b.size[1] / 2],
          [b.position[0] + b.size[0] / 2, b.position[1] + b.size[1] / 2],
          [b.position[0] - b.size[0] / 2, b.position[1] + b.size[1] / 2],
        ]
        for (const [x, z] of corners) {
          const [sx, sy] = this.toScreen(x, z)
          g.appendChild(this.handleMarker(sx, sy, '#fbbf24'))
        }
        const [cx, cy] = this.toScreen(b.position[0], b.position[1])
        g.appendChild(svg('circle', { cx, cy, r: 4, fill: '#38bdf8', stroke: '#0f172a', 'stroke-width': 1 }))
      }
    } else if (selection.kind === 'road') {
      const r = data.roads[selection.index]
      if (!r) return
      for (const [x, z] of r.points) {
        const [sx, sy] = this.toScreen(x, z)
        g.appendChild(svg('circle', { cx: sx, cy: sy, r: 4, fill: '#38bdf8', stroke: '#0f172a', 'stroke-width': 1 }))
      }
    } else if (selection.kind === 'zone' || selection.kind === 'water' || selection.kind === 'field') {
      const list =
        selection.kind === 'zone' ? data.zones : selection.kind === 'water' ? data.waters : data.fields
      const item = list[selection.index]
      if (!item) return
      const corners: Point[] = [
        [item.center[0] - item.size[0] / 2, item.center[1] - item.size[1] / 2],
        [item.center[0] + item.size[0] / 2, item.center[1] - item.size[1] / 2],
        [item.center[0] + item.size[0] / 2, item.center[1] + item.size[1] / 2],
        [item.center[0] - item.size[0] / 2, item.center[1] + item.size[1] / 2],
      ]
      for (const [x, z] of corners) {
        const [sx, sy] = this.toScreen(x, z)
        g.appendChild(this.handleMarker(sx, sy, '#fbbf24'))
      }
    }
  }

  // ---- helpers reused by interaction (subclass / later task) -----------

  protected hitVertex(points: Point[], world: Point): number | null {
    return nearestVertex(points, world, this.worldThreshold(VERTEX_HIT_PX))
  }

  protected hitEdge(points: Point[], world: Point): { index: number; point: Point } | null {
    return nearestEdge(points, world, this.worldThreshold(EDGE_HIT_PX))
  }

  protected boundsOf(points: Point[]) {
    return polygonBounds(points)
  }

  // implemented in the add/remove task
  addEntityAtViewCenter(_type: string): void {}

  deleteSelected(): void {}
}
