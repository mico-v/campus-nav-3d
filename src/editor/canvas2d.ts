import type { EditorStore } from './store.ts'
import type { CampusData } from '../data/campusData.ts'
import type { LayerFlags, Selection, EditorMode, GridSettings } from './types.ts'
import { defaultLayerFlags, DEFAULT_GRID_SETTINGS } from './types.ts'
import {
  worldToScreen,
  screenToWorld,
  fitView,
  zoomAt,
  pan,
  type ViewState,
  type ViewBounds,
} from './projection.ts'
import { areaPolygon, buildingPolygon, getDisplayRoads, pointInWorldPolygon, polygonExtent, resolvedPois, roadDisplayWidth, waterPolygon, type DisplayRoad } from '../scene/displayRules.ts'
import {
  polygonCentroid,
  polygonBounds,
  nearestVertex,
  nearestEdge,
  insertVertex,
  translatePoints,
  distance,
  type Point,
} from './geometry.ts'
import { snapPoint, snapAngle, splitCanonicalRoad, mergeCanonicalRoads } from './precision.ts'
import { mergeRoadNodes, moveRoadNode, removeRoadNode } from '../data/roadNetwork.ts'

type AreaKind = 'zone' | 'water' | 'field'

export interface MapBackdropConfig {
  enabled: boolean
  provider: 'arcgis-imagery' | 'bing-aerial' | 'local-file'
  imageUrl?: string
  latitude?: number
  longitude?: number
  zoom?: number
  metersPerWorldUnit?: number
  zToLatitude?: 1 | -1
  bingApiKey?: string
}

type MapBoundsGeo = {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

type MapBackdropRequest = {
  imageUrl: string
  provider: string
}

type DragState =
  | { kind: 'pan' }
  | { kind: 'backdrop' }
  | { kind: 'bVertex'; b: number; v: number }
  | { kind: 'bMove'; b: number }
  | { kind: 'bCorner'; b: number; c: number }
  | { kind: 'rVertex'; r: number; v: number }
  | { kind: 'rMove'; r: number }
  | { kind: 'roadNode'; id: string }
  | { kind: 'aVertex'; a: AreaKind; i: number; v: number }
  | { kind: 'aCorner'; a: AreaKind; i: number; c: number }
  | { kind: 'aMove'; a: AreaKind; i: number }
  | { kind: 'poiMove'; i: number }

type ActiveVertex = { kind: 'building' | 'road' | 'zone' | 'water' | 'field'; index: number; vertex: number } | { kind: 'road-node'; id: string } | null

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
const DEFAULT_SATELLITE_ZOOM = 17
const MIN_MAP_IMAGE_PX = 512
const MAX_MAP_IMAGE_PX = 2048
const FALLBACK_MAP_IMAGE_PX = 1000
// 本地底图 export.png 的固有宽高比（2048×1296），用于固定比例放置。
const LOCAL_IMAGE_ASPECT = 2048 / 1296

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export interface GeoBox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface CanvasRenderMetrics {
  frames: number
  elapsedMs: number
  averageFrameMs: number
  maxFrameMs: number
}

// 纯函数：世界 bounds + 锚点经纬 → 经纬 bbox。无 DOM 依赖，可单测。
export function worldBoundsToGeo(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  opts: { latitude: number; longitude: number; metersPerWorldUnit?: number; zToLatitude?: number },
): GeoBox {
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const zToLatitude = opts.zToLatitude ?? 1
  const metersPerUnit = opts.metersPerWorldUnit ?? 1
  const metersPerLon = 111_320 * Math.cos(opts.latitude * (Math.PI / 180))
  const metersPerLat = 110_574
  const minLat = opts.latitude + ((bounds.minZ - centerZ) * metersPerUnit * zToLatitude) / metersPerLat
  const maxLat = opts.latitude + ((bounds.maxZ - centerZ) * metersPerUnit * zToLatitude) / metersPerLat
  const minLon = opts.longitude + ((bounds.minX - centerX) * metersPerUnit) / metersPerLon
  const maxLon = opts.longitude + ((bounds.maxX - centerX) * metersPerUnit) / metersPerLon
  return {
    minLat: Math.min(minLat, maxLat),
    maxLat: Math.max(minLat, maxLat),
    minLon: Math.min(minLon, maxLon),
    maxLon: Math.max(minLon, maxLon),
  }
}

export interface BackdropAlign {
  offsetX: number
  offsetZ: number
  scale: number
}

export const DEFAULT_BACKDROP_ALIGN: BackdropAlign = { offsetX: 0, offsetZ: 0, scale: 1 }

export interface BackdropRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// 固定比例底图矩形：以「基准 bounds」绕中心 scale+offset 定位。
// 高度按底图自身宽高比（imageAspect）反推，因此底图尺寸/比例与当前数据 bounds 无关——
// 数据边界线变化不会拉伸或改变底图比例，只受 offset/scale 影响。
export function localBackdropRect(
  base: BackdropRect,
  align: BackdropAlign,
  imageAspect: number,
): BackdropRect {
  const aspect = Math.max(0.01, imageAspect)
  const cx = (base.minX + base.maxX) / 2 + align.offsetX
  const cz = (base.minZ + base.maxZ) / 2 + align.offsetZ
  const halfW = ((base.maxX - base.minX) / 2) * align.scale
  const halfH = halfW / aspect
  return { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfH, maxZ: cz + halfH }
}

// 纯函数：把数据 bounds 经"绕中心缩放 + 偏移"得到底图覆盖的世界矩形。无 DOM 依赖。
export function applyBackdropAlign(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  align: BackdropAlign,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  const halfW = ((bounds.maxX - bounds.minX) / 2) * align.scale
  const halfH = ((bounds.maxZ - bounds.minZ) / 2) * align.scale
  return {
    minX: cx + align.offsetX - halfW,
    maxX: cx + align.offsetX + halfW,
    minZ: cz + align.offsetZ - halfH,
    maxZ: cz + align.offsetZ + halfH,
  }
}

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
  const points: Point[] = []
  const add = (point: Point) => {
    if (Number.isFinite(point[0]) && Number.isFinite(point[1])) points.push(point)
  }
  getDisplayRoads(data, { showGraphRoads: true }).forEach((road) => road.points.forEach(add))
  data.buildings.forEach((building) => buildingPolygon(building).forEach(add))
  data.zones.forEach((zone) => areaPolygon(zone).forEach(add))
  data.waters.forEach((water) => waterPolygon(water).forEach(add))
  data.fields.forEach((field) => areaPolygon(field).forEach(add))
  data.trees.forEach(add)
  resolvedPois(data).forEach((poi) => add([poi.position[0], poi.position[2]]))
  if (points.length === 0) return { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }
  return polygonExtent(points)
}

export class Canvas2D {
  protected host: HTMLElement
  protected store: EditorStore
  protected layers: LayerFlags = defaultLayerFlags()
  protected svgRoot: SVGSVGElement
  protected mapBackdrop = document.createElement('img')
  protected view: ViewState = { scale: 1, offsetX: 0, offsetY: 0 }
  private viewInitialized = false
  private mapBackdropConfig: MapBackdropConfig | null = null
  private mapBackdropRequestId = 0
  private mapBackdropRenderKey = ''
  // 本地固定底图的基准：首次激活时的数据 bounds（之后数据变化不改变底图尺寸/比例）
  private backdropBaseBounds: BackdropRect | null = null
  private backdropImageAspect = LOCAL_IMAGE_ASPECT

  constructor(host: HTMLElement, store: EditorStore) {
    this.host = host
    this.store = store
    this.svgRoot = svg('svg', {})
    this.mapBackdrop.className = 'map-backdrop'
    this.mapBackdrop.loading = 'eager'
    this.mapBackdrop.draggable = false
    this.mapBackdrop.style.display = 'none'
    this.mapBackdrop.alt = 'satellite-map'
    host.appendChild(this.mapBackdrop)
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

  setMapBackdrop(config: MapBackdropConfig | null): void {
    if (!config || !config.enabled) {
      this.mapBackdropConfig = null
      this.mapBackdrop.style.display = 'none'
      this.mapBackdrop.src = ''
      this.mapBackdropRenderKey = ''
      this.backdropBaseBounds = null
      return
    }
    this.mapBackdropConfig = config
    this.mapBackdropRenderKey = ''
    this.backdropBaseBounds = null // 重新启用时以当时的 bounds 为基准重新冻结
    this.render()
  }

  setBackdropAlign(align: BackdropAlign): void {
    this.backdropAlign = { offsetX: align.offsetX, offsetZ: align.offsetZ, scale: clamp(align.scale, 0.2, 5) }
    this.render()
  }

  setBackdropLocked(locked: boolean): void {
    this.backdropLocked = locked
  }

  setBackdropScale(scale: number): void {
    this.backdropAlign = { ...this.backdropAlign, scale: clamp(scale, 0.2, 5) }
    this.onBackdropAlignChange?.(this.backdropAlign)
    this.render()
  }

  getBackdropAlign(): BackdropAlign {
    return { ...this.backdropAlign }
  }

  fitToData(): void {
    const rect = this.host.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return // layout not ready yet
    this.view = fitView(this.getDataBounds(), rect.width, rect.height, FIT_PAD)
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
  private backdropAlign: BackdropAlign = { ...DEFAULT_BACKDROP_ALIGN }
  private backdropLocked = true
  onBackdropAlignChange: ((align: BackdropAlign) => void) | null = null
  private prevWorld: Point = [0, 0]
  private prevScreen: [number, number] = [0, 0]
  protected activeVertex: ActiveVertex = null
  private mode: EditorMode = 'select'
  private gridSettings: GridSettings = { ...DEFAULT_GRID_SETTINGS }
  private roadDraft: Point[] = []
  private renderScheduled = false
  private displayRoadsCache: DisplayRoad[] | null = null
  private displayRoadsCacheRevision = -1
  private resolvedPoisCache: ReturnType<typeof resolvedPois> | null = null
  private resolvedPoisCacheRevision = -1
  private dataBoundsCache: ViewBounds | null = null
  private dataBoundsCacheRevision = -1
  private buildingsTransparent = false
  private renderFrames = 0
  private renderElapsedMs = 0
  private renderMaxFrameMs = 0

  private getDisplayRoads(): DisplayRoad[] {
    const revision = this.store.revision
    if (this.displayRoadsCache && this.displayRoadsCacheRevision === revision) return this.displayRoadsCache
    this.displayRoadsCache = getDisplayRoads(this.store.data, { showGraphRoads: true })
    this.displayRoadsCacheRevision = revision
    return this.displayRoadsCache
  }

  private getResolvedPois(): ReturnType<typeof resolvedPois> {
    const revision = this.store.revision
    if (this.resolvedPoisCache && this.resolvedPoisCacheRevision === revision) return this.resolvedPoisCache
    this.resolvedPoisCache = resolvedPois(this.store.data)
    this.resolvedPoisCacheRevision = revision
    return this.resolvedPoisCache
  }

  private getDataBounds(): ViewBounds {
    const revision = this.store.revision
    if (this.dataBoundsCache && this.dataBoundsCacheRevision === revision) return this.dataBoundsCache
    this.dataBoundsCache = computeDataBounds(this.store.data)
    this.dataBoundsCacheRevision = revision
    return this.dataBoundsCache
  }

  /** Coalesce renders to one per animation frame (pointer events fire faster). */
  requestRender(): void {
    if (this.renderScheduled) return
    this.renderScheduled = true
    const run = () => {
      this.renderScheduled = false
      this.render()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else run()
  }

  setMode(mode: EditorMode): void {
    this.mode = mode
    if (mode !== 'add-road') this.roadDraft = []
    this.render()
  }

  getMode(): EditorMode { return this.mode }

  setGridSettings(settings: Partial<GridSettings>): void {
    this.gridSettings = { ...this.gridSettings, ...settings, spacing: Math.max(0.1, settings.spacing ?? this.gridSettings.spacing) }
    this.render()
  }

  getGridSettings(): GridSettings { return { ...this.gridSettings } }

  setBuildingsTransparent(transparent: boolean): void {
    this.buildingsTransparent = transparent
    this.render()
  }

  getBuildingsTransparent(): boolean {
    return this.buildingsTransparent
  }

  getRenderMetrics(): CanvasRenderMetrics {
    return {
      frames: this.renderFrames,
      elapsedMs: this.renderElapsedMs,
      averageFrameMs: this.renderFrames ? this.renderElapsedMs / this.renderFrames : 0,
      maxFrameMs: this.renderMaxFrameMs,
    }
  }

  resetRenderMetrics(): void {
    this.renderFrames = 0
    this.renderElapsedMs = 0
    this.renderMaxFrameMs = 0
  }

  private finishRenderMetrics(started: number): void {
    const elapsed = Math.max(0, performance.now() - started)
    this.renderFrames += 1
    this.renderElapsedMs += elapsed
    this.renderMaxFrameMs = Math.max(this.renderMaxFrameMs, elapsed)
  }

  private snapEditPoint(point: Point): Point {
    if (!this.gridSettings.snap) return point
    return snapPoint(point, this.store.data.roads, this.anchorPoints(), {
      gridSize: this.gridSettings.spacing,
      snapDistance: this.worldThreshold(this.gridSettings.snapDistance),
      grid: true,
      angle: false,
    }).point
  }

  finishRoadDraft(): void {
    if (this.roadDraft.length < 2) { this.roadDraft = []; this.render(); return }
    const draft = this.roadDraft.map(([x, z]) => [x, z] as Point)
    this.store.mutate('draw-road', (data) => {
      const id = this.uniqueId('road', new Set(data.roads.map((road) => road.id)))
      data.roads.push({ id, points: draft, width: 3.2, kind: 'road', sourceIds: [id] })
    })
    this.roadDraft = []
    this.setMode('select')
  }

  cancelRoadDraft(): void { this.roadDraft = []; this.render() }

  splitSelectedRoad(): void {
    const sel = this.store.selection
    if (!sel || sel.kind !== 'road') return
    const road = this.store.data.roads[sel.index]
    if (!road || road.points.length < 2) return
    let index = -1
    let point: Point | null = null
    if (road.points.length >= 3) {
      index = Math.floor((road.points.length - 2) / 2)
      point = road.points[index + 1]
    } else {
      const node = this.store.data.roadNetwork?.nodes.find((candidate) => {
        if (candidate.kind !== 'junction' || !(candidate.sourceIds ?? []).includes(road.id)) return false
        const a = road.points[0]
        const b = road.points[1]
        const dx = b[0] - a[0], dz = b[1] - a[1]
        const lengthSquared = dx * dx + dz * dz
        if (!lengthSquared) return false
        const t = ((candidate.position[0] - a[0]) * dx + (candidate.position[1] - a[1]) * dz) / lengthSquared
        return t > 1e-6 && t < 1 - 1e-6
      })
      if (node) { index = 0; point = node.position }
    }
    if (index < 0 || !point) return
    this.store.mutate('split-road', (data) => splitCanonicalRoad(data, sel.index, index, point))
    this.store.select(null)
  }

  mergeSelectedRoads(first: number, second: number): boolean {
    let merged = false
    this.store.mutate('merge-roads', (data) => { merged = mergeCanonicalRoads(data, first, second) })
    return merged
  }

  mergeSelectedRoadWithNearest(): boolean {
    const sel = this.store.selection
    if (!sel || sel.kind !== 'road') return false
    const road = this.store.data.roads[sel.index]
    if (!road) return false
    const endpoints = [road.points[0], road.points[road.points.length - 1]]
    let bestIndex = -1
    let bestDistance = this.worldThreshold(this.gridSettings.snapDistance)
    this.store.data.roads.forEach((candidate, index) => {
      if (index === sel.index) return
      for (const endpoint of endpoints) {
        for (const point of [candidate.points[0], candidate.points[candidate.points.length - 1]]) {
          const distance = Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1])
          if (distance <= bestDistance) { bestDistance = distance; bestIndex = index }
        }
      }
    })
    if (bestIndex < 0) return false
    return this.mergeSelectedRoads(sel.index, bestIndex)
  }

  mergeSelectedRoadNodeWithNearest(): boolean {
    const sel = this.store.selection
    if (!sel || sel.kind !== 'road-node') return false
    const node = this.store.data.roadNetwork?.nodes.find((candidate) => candidate.id === sel.id)
    if (!node) return false
    const maxDistance = this.worldThreshold(this.gridSettings.snapDistance)
    let nearest: { id: string; distance: number } | null = null
    for (const candidate of this.store.data.roadNetwork?.nodes ?? []) {
      if (candidate.id === node.id) continue
      const d = distance(candidate.position, node.position)
      if (d <= maxDistance && (!nearest || d < nearest.distance)) nearest = { id: candidate.id, distance: d }
    }
    if (!nearest) return false
    let merged = false
    this.store.mutate('merge-road-nodes', (data) => {
      merged = mergeRoadNodes(data.roads, data.roadNetwork ?? { nodes: [], segments: [] }, node.id, nearest!.id, maxDistance)
    })
    if (merged) this.store.select(null)
    return merged
  }

  private attachViewHandlers(): void {
    this.svgRoot.addEventListener('wheel', (event) => {
      event.preventDefault()
      const [sx, sy] = this.pointerToScreen(event)
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      this.view = zoomAt(this.view, sx, sy, factor)
      this.requestRender()
    })
    this.svgRoot.addEventListener('pointerdown', (event) => this.handlePointerDown(event))
    this.svgRoot.addEventListener('pointermove', (event) => this.handlePointerMove(event))
    this.svgRoot.addEventListener('pointerup', (event) => this.handlePointerUp(event))
    this.svgRoot.addEventListener('pointercancel', (event) => this.handlePointerUp(event))
    this.svgRoot.addEventListener('dblclick', (event) => this.handleDoubleClick(event))
    // 阻止右键菜单 / 中键自动滚动等浏览器默认行为干扰画布编辑。
    this.svgRoot.addEventListener('contextmenu', (event) => event.preventDefault())
    this.svgRoot.addEventListener('auxclick', (event) => event.preventDefault())
    this.svgRoot.addEventListener('selectstart', (event) => event.preventDefault())
    this.svgRoot.addEventListener('dragstart', (event) => event.preventDefault())
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
    } else if (sel.kind === 'road-node') {
      const node = data.roadNetwork?.nodes.find((candidate) => candidate.id === sel.id)
      if (node && distance(node.position, world) <= this.worldThreshold(VERTEX_HIT_PX)) {
        this.activeVertex = { kind: 'road-node', id: node.id }
        return { kind: 'roadNode', id: node.id }
      }
    } else if (sel.kind === 'zone' || sel.kind === 'water' || sel.kind === 'field') {
      const list = this.areaList(sel.kind)
      const item = list[sel.index]
      if (!item) return null
      if (item.footprint && item.footprint.length >= 3) {
        const v = this.hitVertex(item.footprint, world)
        if (v !== null) {
          this.activeVertex = { kind: sel.kind, index: sel.index, vertex: v }
          return { kind: 'aVertex', a: sel.kind, i: sel.index, v }
        }
      } else {
        const c = this.hitCorner(this.boxCorners(item.center, item.size), world)
        if (c !== null) return { kind: 'aCorner', a: sel.kind, i: sel.index, c }
      }
    }
    return null
  }

  /**
   * Grab a vertex of *any* visible entity near `world` (no need to select the
   * entity first). Selects the owner entity, marks the vertex active (so it can
   * be deleted with Delete/「删除选中点」), and returns the vertex drag.
   */
  private pickVertexAnywhere(world: Point): { drag: DragState; selection: Selection } | null {
    const data = this.store.data
    if (this.layers.buildings) {
      for (let i = data.buildings.length - 1; i >= 0; i--) {
        const footprint = data.buildings[i].footprint
        if (!footprint || footprint.length < 3) continue
        const v = this.hitVertex(footprint, world)
        if (v !== null) {
          this.activeVertex = { kind: 'building', index: i, vertex: v }
          return { drag: { kind: 'bVertex', b: i, v }, selection: { kind: 'building', index: i } }
        }
      }
    }
    if (this.layers.roads) {
      const nodes = data.roadNetwork?.nodes ?? []
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        if (distance(node.position, world) <= this.worldThreshold(VERTEX_HIT_PX)) {
          this.activeVertex = { kind: 'road-node', id: node.id }
          return { drag: { kind: 'roadNode', id: node.id }, selection: { kind: 'road-node', id: node.id } }
        }
      }
      for (let i = data.roads.length - 1; i >= 0; i--) {
        const points = data.roads[i].points
        if (!points) continue
        const v = this.hitVertex(points, world)
        if (v !== null) {
          this.activeVertex = { kind: 'road', index: i, vertex: v }
          return { drag: { kind: 'rVertex', r: i, v }, selection: { kind: 'road', index: i } }
        }
      }
    }
    for (const kind of ['field', 'water', 'zone'] as const) {
      if (kind === 'field' && !this.layers.fields) continue
      if (kind === 'water' && !this.layers.waters) continue
      if (kind === 'zone' && !this.layers.zones) continue
      const list = this.areaList(kind)
      for (let i = list.length - 1; i >= 0; i--) {
        const footprint = list[i].footprint
        if (!footprint || footprint.length < 3) continue
        const v = this.hitVertex(footprint, world)
        if (v !== null) {
          this.activeVertex = { kind, index: i, vertex: v }
          return { drag: { kind: 'aVertex', a: kind, i, v }, selection: { kind, index: i } }
        }
      }
    }
    return null
  }

  private areaList(kind: AreaKind) {
    const data = this.store.data
    return kind === 'zone' ? data.zones : kind === 'water' ? data.waters : data.fields
  }

  private moveDragFor(sel: Selection): DragState | null {
    if (!sel) return null
    const data = this.store.data
    switch (sel.kind) {
      case 'building':
        return { kind: 'bMove', b: sel.index }
      case 'road':
        return { kind: 'rMove', r: sel.index }
      case 'road-node':
        return { kind: 'roadNode', id: sel.id }
      case 'zone':
      case 'water':
      case 'field':
        return { kind: 'aMove', a: sel.kind, i: sel.index }
      case 'poi':
        return data.pois[sel.index]?.sourceBuildingId ? null : { kind: 'poiMove', i: sel.index }
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
    let world = this.toWorld(screen[0], screen[1])

    if (this.mode === 'pan' || event.button === 1) {
      event.preventDefault()
      this.startDrag({ kind: 'pan' }, world, screen, event.pointerId)
      return
    }
    if (event.button !== undefined && event.button !== 0) return
    if (this.mode === 'add-road') {
      // A double click emits two pointerdown events. Keep the first vertex,
      // but do not append a duplicate second vertex before dblclick finishes.
      if (event.detail > 1) return
      const snap = snapPoint(world, this.store.data.roads, this.anchorPoints(), {
        gridSize: this.gridSettings.spacing,
        snapDistance: this.worldThreshold(this.gridSettings.snapDistance),
        grid: this.gridSettings.snap,
        angle: this.gridSettings.angleSnap,
        angleStep: this.gridSettings.angleStep,
      })
      world = snap.point
      if (this.gridSettings.angleSnap && this.roadDraft.length > 0) world = snapAngle(this.roadDraft[this.roadDraft.length - 1], world, this.gridSettings.angleStep)
      this.roadDraft.push(world)
      this.render()
      return
    }

    // 0b) 底图解锁(对齐模式) → 左键拖动平移底图，暂停元素编辑
    if (!this.backdropLocked) {
      this.startDrag({ kind: 'backdrop' }, world, screen, event.pointerId)
      return
    }

    // Reshape mode is deliberately vertex-only; it prevents an accidental
    // drag from moving the whole object while editing geometry.
    if (this.mode === 'reshape') {
      const handle = this.pickHandle(world)
      if (handle) {
        event.preventDefault()
        // 选中的顶点可能变了（activeVertex），通知工具栏刷新
        this.store.select(this.store.selection)
        this.startDrag(handle, world, screen, event.pointerId)
        return
      }
      const vertexPick = this.pickVertexAnywhere(world)
      if (vertexPick) {
        event.preventDefault()
        this.store.select(vertexPick.selection)
        this.startDrag(vertexPick.drag, world, screen, event.pointerId)
        this.requestRender()
        return
      }
      return
    }

    // 1) grab a handle of the current selection
    const handle = this.pickHandle(world)
    if (handle) {
      event.preventDefault()
      this.store.select(this.store.selection)
      this.startDrag(handle, world, screen, event.pointerId)
      return
    }

    // 1b) grab a vertex of any visible entity — selects the entity AND the
    // vertex, so Delete / 「删除选中点」 can remove it directly.
    const vertexPick = this.pickVertexAnywhere(world)
    if (vertexPick) {
      event.preventDefault()
      this.store.select(vertexPick.selection)
      this.startDrag(vertexPick.drag, world, screen, event.pointerId)
      this.requestRender()
      return
    }

    // 2) (re)select what's under the cursor
    const hit = this.hitTest(world, screen)
    this.store.select(hit)
    if (hit) {
      this.activeVertex = null
      const move = this.moveDragFor(hit)
      if (move) {
        event.preventDefault()
        this.startDrag(move, world, screen, event.pointerId)
      }
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
      this.requestRender()
      return
    }
    if (this.drag.kind === 'backdrop') {
      const w = this.toWorld(screen[0], screen[1])
      this.backdropAlign = {
        ...this.backdropAlign,
        offsetX: this.backdropAlign.offsetX + (w[0] - this.prevWorld[0]),
        offsetZ: this.backdropAlign.offsetZ + (w[1] - this.prevWorld[1]),
      }
      this.prevWorld = w
      this.prevScreen = screen
      this.onBackdropAlignChange?.(this.backdropAlign)
      this.requestRender()
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
    this.requestRender()
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
        const next = this.resizeFromCorner(b.position, b.size, drag.c, this.snapEditPoint(world))
        b.position = next.center
        b.size = next.size
        break
      }
      case 'rVertex': {
        const candidate = this.gridSettings.snap
          ? snapPoint(world, data.roads, this.anchorPoints(), {
            gridSize: this.gridSettings.spacing,
            snapDistance: this.worldThreshold(this.gridSettings.snapDistance),
            grid: true,
            angle: false,
          }).point
          : world
        data.roads[drag.r].points[drag.v] = [candidate[0], candidate[1]]
        break
      }
      case 'roadNode': {
        const candidate = this.gridSettings.snap
          ? snapPoint(world, data.roads, this.anchorPoints(), {
            gridSize: this.gridSettings.spacing,
            snapDistance: this.worldThreshold(this.gridSettings.snapDistance),
            grid: true,
            angle: false,
          }).point
          : world
        moveRoadNode(
          data.roads,
          data.roadNetwork ?? { nodes: [], segments: [] },
          drag.id,
          [candidate[0], candidate[1]],
          this.worldThreshold(this.gridSettings.snapDistance),
        )
        break
      }
      case 'rMove': {
        const r = data.roads[drag.r]
        r.points = translatePoints(r.points, dx, dz)
        break
      }
      case 'aVertex': {
        const item = this.areaList(drag.a)[drag.i]
        if (!item.footprint) return
        const point = this.snapEditPoint(world)
        item.footprint[drag.v] = [point[0], point[1]]
        item.center = polygonCentroid(item.footprint)
        break
      }
      case 'aCorner': {
        const item = this.areaList(drag.a)[drag.i]
        const next = this.resizeFromCorner(item.center, item.size, drag.c, this.snapEditPoint(world))
        item.center = next.center
        item.size = next.size
        break
      }
      case 'aMove': {
        const item = this.areaList(drag.a)[drag.i]
        if (item.footprint && item.footprint.length >= 3) {
          item.footprint = translatePoints(item.footprint, dx, dz)
          item.center = polygonCentroid(item.footprint)
        } else {
          item.center = [item.center[0] + dx, item.center[1] + dz]
        }
        break
      }
      case 'poiMove': {
        const p = data.pois[drag.i]
        p.position = [p.position[0] + dx, p.position[1], p.position[2] + dz]
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
    if (this.drag.kind !== 'pan' && this.drag.kind !== 'backdrop' && this.dragMoved && this.dragBefore) {
      this.store.recordUndo(this.dragBefore)
    }
    if (this.svgRoot.hasPointerCapture && this.svgRoot.hasPointerCapture(event.pointerId)) {
      this.svgRoot.releasePointerCapture(event.pointerId)
    }
    this.drag = null
    this.dragBefore = null
  }

  private handleDoubleClick(event: MouseEvent): void {
    event.preventDefault()
    if (this.mode === 'add-road') {
      this.finishRoadDraft()
      return
    }
    const screen = this.pointerToScreen(event as unknown as PointerEvent)
    const world = this.toWorld(screen[0], screen[1])
    const sel = this.store.selection
    if (!sel) return
    if (sel.kind === 'building') {
      const b = this.store.data.buildings[sel.index]
      if (!b.footprint || b.footprint.length < 3) return
      const edge = this.hitEdge(b.footprint, world)
      if (!edge) return
      const point = this.snapEditPoint(edge.point)
      this.store.mutate('insert-vertex', (d) => {
        const bb = d.buildings[sel.index]
        bb.footprint = insertVertex(bb.footprint!, edge.index, point)
        bb.position = polygonCentroid(bb.footprint)
      })
    } else if (sel.kind === 'road') {
      const r = this.store.data.roads[sel.index]
      const edge = this.hitEdge(r.points, world)
      if (!edge) return
      const point = this.snapEditPoint(edge.point)
      this.store.mutate('insert-road-node', (d) => {
        d.roads[sel.index].points = insertVertex(d.roads[sel.index].points, edge.index, point)
      })
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return

    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) this.store.redo()
      else this.store.undo()
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.store.redo()
      return
    }
    if (event.key === 'Escape' && this.mode === 'add-road') {
      event.preventDefault()
      this.cancelRoadDraft()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      this.deleteActiveVertex()
    }
  }

  get hasActiveVertex(): boolean {
    return this.activeVertexPoint() !== null
  }

  get canDeleteActiveVertex(): boolean {
    const av = this.activeVertex
    if (!av || !this.activeVertexPoint()) return false
    if (av.kind === 'road-node') {
      const node = this.store.data.roadNetwork?.nodes.find((candidate) => candidate.id === av.id)
      if (!node || node.kind === 'junction') return false
      return this.store.data.roads.some((road) => {
        if (!(node.sourceIds ?? []).some((sourceId) => (road.sourceIds ?? [road.id]).includes(sourceId))) return false
        const index = road.points.findIndex((point) => distance(point, node.position) <= this.worldThreshold(this.gridSettings.snapDistance))
        if (index < 0 || road.points.length <= 2) return false
        const closed = road.points.length >= 4 && distance(road.points[0], road.points[road.points.length - 1]) <= this.worldThreshold(this.gridSettings.snapDistance)
        return !closed || (index > 0 && index < road.points.length - 1)
      })
    }
    if (av.kind === 'road') return this.store.data.roads[av.index]?.points.length > 2
    if (av.kind === 'building') return (this.store.data.buildings[av.index]?.footprint?.length ?? 0) > 3
    const list = av.kind === 'zone' ? this.store.data.zones : av.kind === 'water' ? this.store.data.waters : this.store.data.fields
    return (list[av.index]?.footprint?.length ?? 0) > 3
  }

  private activeVertexPoint(): Point | null {
    const av = this.activeVertex
    if (!av) return null
    const selection = this.store.selection
    if (!selection || selection.kind !== av.kind) return null
    const data = this.store.data
    if (av.kind === 'road-node') {
      if (selection.kind !== 'road-node' || selection.id !== av.id) return null
      return data.roadNetwork?.nodes.find((node) => node.id === av.id)?.position ?? null
    }
    if (selection.kind === 'road-node') return null
    if (selection.index !== av.index) return null
    if (av.kind === 'road') return data.roads[av.index]?.points[av.vertex] ?? null
    if (av.kind === 'building') return data.buildings[av.index]?.footprint?.[av.vertex] ?? null
    const list = av.kind === 'zone' ? data.zones : av.kind === 'water' ? data.waters : data.fields
    return list[av.index]?.footprint?.[av.vertex] ?? null
  }

  /** Delete the currently selected vertex (clicked point). Returns false if none/not deletable. */
  deleteActiveVertex(): boolean {
    const av = this.activeVertex
    if (!av || !this.activeVertexPoint()) return false
    let deleted = false
    this.store.mutate('remove-vertex', (d) => {
      if (av.kind === 'road-node') {
        deleted = removeRoadNode(d.roads, d.roadNetwork ?? { nodes: [], segments: [] }, av.id, this.worldThreshold(this.gridSettings.snapDistance))
        return
      }
      if (av.kind === 'road') {
        const r = d.roads[av.index]
        if (!r || r.points.length <= 2) return
        r.points.splice(av.vertex, 1)
        deleted = true
        return
      }
      if (av.kind === 'building') {
        const b = d.buildings[av.index]
        if (!b?.footprint || b.footprint.length <= 3) return
        b.footprint.splice(av.vertex, 1)
        b.position = polygonCentroid(b.footprint)
        deleted = true
        return
      }
      const list = av.kind === 'zone' ? d.zones : av.kind === 'water' ? d.waters : d.fields
      const item = list[av.index]
      if (!item?.footprint || item.footprint.length <= 3) return
      item.footprint.splice(av.vertex, 1)
      item.center = polygonCentroid(item.footprint)
      deleted = true
    })
    if (!deleted) return false
    this.activeVertex = null
    // Refresh the toolbar immediately so the point-delete action disables
    // itself after a successful deletion.
    this.store.select(av.kind === 'road-node' ? null : this.store.selection)
    return true
  }

  // ---- hit testing -----------------------------------------------------

  protected worldThreshold(px: number): number {
    return px / this.view.scale
  }

  protected hitTest(world: Point, _screen: [number, number]): Selection {
    const data = this.store.data
    const pois = this.getResolvedPois()
    if (this.layers.roads) {
      const nodes = data.roadNetwork?.nodes ?? []
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i]
        if (distance(node.position, world) <= this.worldThreshold(VERTEX_HIT_PX)) return { kind: 'road-node', id: node.id }
      }
    }
    // POIs (small, on top). Anchored POIs follow their source building and are not draggable.
    if (this.layers.pois) {
      for (let i = pois.length - 1; i >= 0; i--) {
        const p = pois[i]
        if (distance([p.position[0], p.position[2]], world) <= this.worldThreshold(POINT_HIT_PX)) {
          return { kind: 'poi', index: i }
        }
      }
    }
    // Buildings
    if (this.layers.buildings) {
      for (let i = data.buildings.length - 1; i >= 0; i--) {
        const b = data.buildings[i]
        if (pointInWorldPolygon(world, buildingPolygon(b))) return { kind: 'building', index: i }
      }
    }
    if (this.layers.roads) {
      for (const road of this.getDisplayRoads()) {
        const index = data.roads.findIndex((item) => road.sourceIds?.includes(item.id) || item.id === road.id)
        const edge = nearestEdge(road.points, world, this.worldThreshold(EDGE_HIT_PX + roadDisplayWidth(road) / 2))
        if (edge && index >= 0) return { kind: 'road', index }
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
        const polygon = kind === 'water' ? waterPolygon(item) : areaPolygon(item)
        if (pointInWorldPolygon(world, polygon)) return { kind, index: i }
      }
    }
    return null
  }

  private anchorPoints(): Point[] {
    const data = this.store.data
    return [...data.buildings.flatMap((b) => b.footprint ?? [b.position]), ...data.zones.flatMap((z) => z.footprint ?? [z.center]), ...data.fields.flatMap((f) => f.footprint ?? [f.center])]
  }

  private drawGrid(bounds: ViewBounds): void {
    if (!this.gridSettings.visible || this.gridSettings.spacing <= 0) return
    const g = this.layerGroup('grid')
    const spacing = this.gridSettings.spacing
    const startX = Math.floor(bounds.minX / spacing) * spacing
    const startZ = Math.floor(bounds.minZ / spacing) * spacing
    for (let x = startX; x <= bounds.maxX; x += spacing) {
      const [sx1, sy1] = this.toScreen(x, bounds.minZ)
      const [sx2, sy2] = this.toScreen(x, bounds.maxZ)
      g.appendChild(svg('line', { x1: sx1, y1: sy1, x2: sx2, y2: sy2, stroke: '#94a3b8', 'stroke-opacity': 0.16, 'stroke-width': 1 }))
    }
    for (let z = startZ; z <= bounds.maxZ; z += spacing) {
      const [sx1, sy1] = this.toScreen(bounds.minX, z)
      const [sx2, sy2] = this.toScreen(bounds.maxX, z)
      g.appendChild(svg('line', { x1: sx1, y1: sy1, x2: sx2, y2: sy2, stroke: '#94a3b8', 'stroke-opacity': 0.16, 'stroke-width': 1 }))
    }
  }

  render(): void {
    const started = performance.now()
    if (!this.viewInitialized) {
      this.fitToData()
      if (this.viewInitialized) return // fitToData already rendered
    }
    const data = this.store.data
    const selection = this.store.selection
    const bounds = this.getDataBounds()
    this.syncMapBackdrop(bounds)
    this.svgRoot.replaceChildren()
    const displayRoads = this.getDisplayRoads()
    const pois = this.getResolvedPois()

    const ground = this.layerGroup('ground')
    this.drawGrid(bounds)
    const [gx1, gy1] = this.toScreen(bounds.minX, bounds.minZ)
    const [gx2, gy2] = this.toScreen(bounds.maxX, bounds.maxZ)
    const backdropActive = this.mapBackdropConfig !== null
    ground.appendChild(
      svg('rect', {
        x: Math.min(gx1, gx2),
        y: Math.min(gy1, gy2),
        width: Math.abs(gx2 - gx1),
        height: Math.abs(gy2 - gy1),
        fill: backdropActive ? 'none' : '#0c1a2e',
        stroke: '#1e3a5f',
        'stroke-width': 1,
      }),
    )

    if (this.layers.zones) {
      const g = this.layerGroup('zones')
      data.zones.forEach((zone, index) => this.drawArea(g, areaPolygon(zone), zone.color, 0.28, selection?.kind === 'zone' && selection.index === index))
    }
    if (this.layers.waters) {
      const g = this.layerGroup('waters')
      data.waters.forEach((water, index) => this.drawArea(g, waterPolygon(water), water.color ?? '#60a5fa', 0.75, selection?.kind === 'water' && selection.index === index))
    }
    if (this.layers.fields) {
      const g = this.layerGroup('fields')
      data.fields.forEach((field, index) => this.drawArea(g, areaPolygon(field), field.color ?? '#22c55e', 0.5, selection?.kind === 'field' && selection.index === index))
    }
    if (this.layers.roads) {
      const g = this.layerGroup('roads')
      displayRoads.forEach((r) => {
        const index = data.roads.findIndex((item) => r.sourceIds?.includes(item.id) || item.id === r.id)
        const selected = selection?.kind === 'road' && selection.index === index
        g.appendChild(svg('polyline', {
          points: r.points.map(([x, z]) => this.toScreen(x, z).join(',')).join(' '), fill: 'none',
          stroke: selected ? '#f8fafc' : r.color ?? (r.displayKind === 'canal' ? '#76b7d5' : '#94a3b8'),
          'stroke-width': Math.max(1, roadDisplayWidth(r) * this.view.scale), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: selected ? 1 : 0.85,
        }))
        const direction = r.points[Math.min(1, r.points.length - 1)]
        const origin = r.points[0]
        if (direction) {
          const [sx, sy] = this.toScreen((origin[0] + direction[0]) / 2, (origin[1] + direction[1]) / 2)
          g.appendChild(svg('circle', { cx: sx, cy: sy, r: selected ? 3 : 2, fill: selected ? '#f8fafc' : '#64748b', 'data-road-direction': r.id }))
        }
      })
      if (this.roadDraft.length) {
        g.appendChild(svg('polyline', { points: this.roadDraft.map(([x, z]) => this.toScreen(x, z).join(',')).join(' '), fill: 'none', stroke: '#fbbf24', 'stroke-width': 3, 'stroke-dasharray': '5 3' }))
        this.roadDraft.forEach(([x, z]) => { const [sx, sy] = this.toScreen(x, z); g.appendChild(svg('circle', { cx: sx, cy: sy, r: 4, fill: '#fbbf24' })) })
      }
      const network = data.roadNetwork
      if (network) {
        const topology = this.layerGroup('road-network-nodes')
        network.nodes.forEach((node) => {
          const [sx, sy] = this.toScreen(node.position[0], node.position[1])
          const junction = node.kind === 'junction' || node.kind === 'entrance'
          const selected = selection?.kind === 'road-node' && selection.id === node.id
          topology.appendChild(svg('circle', {
            cx: sx,
            cy: sy,
            r: selected ? 6 : junction ? 4 : 2.5,
            fill: selected ? '#f43f5e' : junction ? '#f97316' : '#38bdf8',
            stroke: selected ? '#ffffff' : '#0f172a',
            'stroke-width': selected ? 2 : junction ? 1.25 : 0.75,
            opacity: 0.9,
            'data-road-node': node.id,
          }))
        })
      }
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
              'fill-opacity': this.buildingsTransparent ? (selected ? 0.18 : 0.08) : selected ? 0.85 : 0.7,
              stroke: selected ? '#f43f5e' : '#0f172a',
              'stroke-width': selected ? 2 : 0.75,
            }),
          )
        } else {
          this.drawRect(g, b.position, b.size, color, this.buildingsTransparent ? (selected ? 0.18 : 0.08) : selected ? 0.85 : 0.7, selected ? '#f43f5e' : '#0f172a', selected ? 2 : 0.75)
        }
      })
    }
    if (this.layers.pois) {
      const g = this.layerGroup('pois')
      data.pois.forEach((p, i) => {
        const selected = selection?.kind === 'poi' && selection.index === i
        const resolved = pois[i]
        const [sx, sy] = this.toScreen(resolved.position[0], resolved.position[2])
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

    const readout = this.layerGroup('readout')
    readout.appendChild(svg('text', { x: 12, y: 22, fill: '#cbd5e1', 'font-size': 12, 'data-readout': 'scale' }))
    const scaleLabel = readout.lastChild as SVGTextElement
    scaleLabel.textContent = `比例 ${this.view.scale.toFixed(2)} px/单位 · 网格 ${this.gridSettings.spacing}`
    this.drawSelectionHandles(selection)
    this.finishRenderMetrics(started)
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

  protected drawArea(
    g: SVGGElement,
    points: Point[],
    color: string,
    opacity: number,
    selected = false,
  ): void {
    g.appendChild(svg('polygon', {
      points: points.map(([x, z]) => this.toScreen(x, z).join(',')).join(' '),
      fill: color,
      'fill-opacity': selected ? Math.min(1, opacity + 0.2) : opacity,
      stroke: selected ? '#f43f5e' : 'none',
      'stroke-width': selected ? 2 : 0,
    }))
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
    } else if (selection.kind === 'road-node') {
      const node = data.roadNetwork?.nodes.find((candidate) => candidate.id === selection.id)
      if (node) {
        const [sx, sy] = this.toScreen(node.position[0], node.position[1])
        g.appendChild(svg('circle', { cx: sx, cy: sy, r: 8, fill: '#f43f5e', stroke: '#ffffff', 'stroke-width': 2 }))
      }
    } else if (selection.kind === 'zone' || selection.kind === 'water' || selection.kind === 'field') {
      const list =
        selection.kind === 'zone' ? data.zones : selection.kind === 'water' ? data.waters : data.fields
      const item = list[selection.index]
      if (!item) return
      if (item.footprint && item.footprint.length >= 3) {
        for (const [x, z] of item.footprint) {
          const [sx, sy] = this.toScreen(x, z)
          g.appendChild(this.handleMarker(sx, sy, '#fbbf24'))
        }
      } else {
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
    // 活动顶点（最近点击过的点）用醒目描边标出，Delete / 「删除选中点」作用于它。
    if (this.activeVertex) {
      const av = this.activeVertex
      let point: Point | null = null
      if (av.kind === 'road-node') point = data.roadNetwork?.nodes.find((node) => node.id === av.id)?.position ?? null
      else if (av.kind === 'road') point = data.roads[av.index]?.points[av.vertex] ?? null
      else if (av.kind === 'building') point = data.buildings[av.index]?.footprint?.[av.vertex] ?? null
      else {
        const list = av.kind === 'zone' ? data.zones : av.kind === 'water' ? data.waters : data.fields
        point = list[av.index]?.footprint?.[av.vertex] ?? null
      }
      if (point) {
        const [sx, sy] = this.toScreen(point[0], point[1])
        const activeKey = av.kind === 'road-node' ? `${av.kind}:${av.id}` : `${av.kind}:${av.index}:${av.vertex}`
        g.appendChild(svg('circle', { cx: sx, cy: sy, r: 7, fill: '#f43f5e', stroke: '#ffffff', 'stroke-width': 2, 'data-active-vertex': activeKey }))
      }
    }
  }

  // 本地固定底图的世界矩形：基准尺寸首次激活时冻结，之后不受数据 bounds 变化影响。
  private backdropWorldRect(current: ViewBounds): BackdropRect {
    if (!this.backdropBaseBounds) this.backdropBaseBounds = { ...current }
    return localBackdropRect(this.backdropBaseBounds, this.backdropAlign, this.backdropImageAspect)
  }

  private syncMapBackdrop(bounds: ViewBounds): void {
    if (!this.mapBackdropConfig) {
      this.mapBackdrop.style.display = 'none'
      return
    }
    const config = this.mapBackdropConfig

    const aligned = this.backdropWorldRect(bounds)
    const [x1, y1] = this.toScreen(aligned.minX, aligned.minZ)
    const [x2, y2] = this.toScreen(aligned.maxX, aligned.maxZ)
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const width = Math.max(1, Math.abs(x2 - x1))
    const height = Math.max(1, Math.abs(y2 - y1))

    if (config.provider === 'local-file') {
      // 本地 png 底图：只加载一次，不再随数据 bounds 变化请求网络图源（避免卡顿）。
      if (this.mapBackdropRenderKey !== 'local') {
        this.mapBackdropRenderKey = 'local'
        this.mapBackdrop.onload = () => {
          if (this.mapBackdrop.naturalWidth > 0 && this.mapBackdrop.naturalHeight > 0) {
            this.backdropImageAspect = this.mapBackdrop.naturalWidth / this.mapBackdrop.naturalHeight
          }
          this.render()
        }
        this.mapBackdrop.src = config.imageUrl ?? ''
      }
    } else {
      const zToLatitude = config.zToLatitude ?? 1
      const configKey = `${bounds.minX.toFixed(2)},${bounds.maxX.toFixed(2)},${bounds.minZ.toFixed(2)},${bounds.maxZ.toFixed(2)},${config.provider},${config.zoom ?? DEFAULT_SATELLITE_ZOOM},${zToLatitude},${config.metersPerWorldUnit ?? 1}`

      if (this.mapBackdropRenderKey !== configKey) {
        this.mapBackdropRenderKey = configKey
        this.fetchMapBackdropImage(bounds)
      }
    }

    this.mapBackdrop.style.left = `${left}px`
    this.mapBackdrop.style.top = `${top}px`
    this.mapBackdrop.style.width = `${width}px`
    this.mapBackdrop.style.height = `${height}px`
    this.mapBackdrop.style.display = 'block'
  }

  private async fetchMapBackdropImage(bounds: ViewBounds): Promise<void> {
    const config = this.mapBackdropConfig
    if (!config) return
    const requests = this.buildMapBackdropRequest(bounds, config)
    if (requests.length === 0) {
      this.mapBackdrop.style.display = 'none'
      this.mapBackdrop.src = ''
      return
    }

    const requestId = ++this.mapBackdropRequestId

    this.mapBackdrop.style.display = 'none'
    for (const request of requests) {
      if (this.mapBackdropRequestId !== requestId) return

      const loaded = await this.probeMapImage(request.imageUrl)
      if (!loaded || this.mapBackdropRequestId !== requestId) continue

      this.mapBackdrop.src = request.imageUrl
      this.mapBackdrop.style.display = 'block'
      return
    }

    if (this.mapBackdropRequestId === requestId) {
      this.mapBackdrop.style.display = 'none'
      this.mapBackdrop.src = ''
      console.warn('Map backdrop image failed, tried providers:', requests.map((request) => request.provider).join(', '))
    }
  }

  private async probeMapImage(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const probe = new Image()
      probe.onload = () => resolve(true)
      probe.onerror = () => resolve(false)
      probe.src = url
    })
  }

  private buildWorldToGeo(bounds: ViewBounds, config: MapBackdropConfig): MapBoundsGeo {
    const geo = worldBoundsToGeo(bounds, {
      latitude: config.latitude ?? 0,
      longitude: config.longitude ?? 0,
      metersPerWorldUnit: config.metersPerWorldUnit,
      zToLatitude: config.zToLatitude,
    })
    return {
      minLat: clamp(geo.minLat, -85, 85),
      maxLat: clamp(geo.maxLat, -85, 85),
      minLon: clamp(geo.minLon, -180, 180),
      maxLon: clamp(geo.maxLon, -180, 180),
    }
  }

  private buildMapImageSize(bounds: ViewBounds, config: MapBackdropConfig): [number, number] {
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX) * (config.metersPerWorldUnit ?? 1)
    const worldHeight = Math.max(1, bounds.maxZ - bounds.minZ) * (config.metersPerWorldUnit ?? 1)
    const z = config.zoom ?? DEFAULT_SATELLITE_ZOOM
    const metersPerPx = (156543.03392 * Math.cos(((config.latitude ?? 0) * Math.PI) / 180)) / 2 ** z
    const widthPx = Math.round(worldWidth / metersPerPx)
    const heightPx = Math.round(worldHeight / metersPerPx)
    return [
      clamp(Math.max(MIN_MAP_IMAGE_PX, widthPx), MIN_MAP_IMAGE_PX, MAX_MAP_IMAGE_PX),
      clamp(Math.max(MIN_MAP_IMAGE_PX, heightPx), MIN_MAP_IMAGE_PX, MAX_MAP_IMAGE_PX),
    ]
  }

  private buildMapBackdropRequest(bounds: ViewBounds, config: MapBackdropConfig): MapBackdropRequest[] {
    if (config.provider === 'arcgis-imagery') {
      const geo = this.buildWorldToGeo(bounds, config)
      const [width, height] = this.buildMapImageSize(bounds, config)
      const altWidth = Math.max(MIN_MAP_IMAGE_PX, Math.round(width * 0.67))
      const altHeight = Math.max(MIN_MAP_IMAGE_PX, Math.round(height * 0.67))
      const smallWidth = Math.max(MIN_MAP_IMAGE_PX, Math.round(width * 0.5))
      const smallHeight = Math.max(MIN_MAP_IMAGE_PX, Math.round(height * 0.5))
      const worldImageParams = (sizeX: number, sizeY: number) =>
        `bbox=${geo.minLon},${geo.minLat},${geo.maxLon},${geo.maxLat}&bboxSR=4326&size=${sizeX},${sizeY}&imageSR=4326&format=png&f=image`

      const requests: MapBackdropRequest[] = [
        {
          imageUrl: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${worldImageParams(width, height)}`,
          provider: 'arcgis-imagery/server',
        },
        {
          imageUrl: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${worldImageParams(altWidth, altHeight)}`,
          provider: 'arcgis-imagery/server-small',
        },
        {
          imageUrl: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${worldImageParams(smallWidth, smallHeight)}`,
          provider: 'arcgis-imagery/server-smaller',
        },
        {
          imageUrl: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${worldImageParams(width, height)}`,
          provider: 'arcgis-imagery/services',
        },
      ]

      const fallbackWidth = clamp(Math.min(FALLBACK_MAP_IMAGE_PX, width), MIN_MAP_IMAGE_PX, FALLBACK_MAP_IMAGE_PX)
      const fallbackHeight = clamp(Math.min(FALLBACK_MAP_IMAGE_PX, height), MIN_MAP_IMAGE_PX, FALLBACK_MAP_IMAGE_PX)
      return [
        ...requests,
        {
          imageUrl: `https://staticmap.openstreetmap.de/staticmap.php?center=${config.latitude ?? 0},${config.longitude ?? 0}&zoom=${config.zoom ?? DEFAULT_SATELLITE_ZOOM}&size=${fallbackWidth}x${fallbackHeight}&maptype=mapnik&markers=${config.latitude ?? 0},${config.longitude ?? 0},lightblue1`,
          provider: 'openstreetmap-static',
        },
      ]
    }

    if (config.provider === 'bing-aerial') {
      if (!config.bingApiKey) return []
      const zoom = config.zoom ?? DEFAULT_SATELLITE_ZOOM
      const lat = config.latitude ?? 0
      const lon = config.longitude ?? 0
      const [width, height] = this.buildMapImageSize(bounds, config)
      const mapSize = `${Math.min(MAX_MAP_IMAGE_PX, Math.max(MIN_MAP_IMAGE_PX, width))},${Math.min(MAX_MAP_IMAGE_PX, Math.max(MIN_MAP_IMAGE_PX, height))}`
      const baseUrl = 'https://dev.virtualearth.net/REST/v1/Imagery/Map/Aerial'
      return [{
        imageUrl: `${baseUrl}/${lat},${lon}/${zoom}?mapSize=${mapSize}&format=jpeg&dpi=1&pp=${lat},${lon};0;A&key=${encodeURIComponent(config.bingApiKey)}`,
        provider: 'bing-aerial',
      }]
    }

    return []
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

  private viewCenterWorld(): Point {
    const rect = this.host.getBoundingClientRect()
    const w = rect.width || 800
    const h = rect.height || 600
    return this.toWorld(w / 2, h / 2)
  }

  private uniqueId(prefix: string, existing: Set<string>): string {
    let n = existing.size + 1
    let id = `${prefix}-${n}`
    while (existing.has(id)) {
      n += 1
      id = `${prefix}-${n}`
    }
    return id
  }

  addEntityAtViewCenter(type: string): void {
    const [wx, wz] = this.viewCenterWorld()
    let selection: Selection = null

    this.store.mutate(`add-${type}`, (d) => {
      switch (type) {
        case 'building': {
          const id = this.uniqueId('building', new Set(d.buildings.map((b) => b.id)))
          d.buildings.push({
            id,
            name: '新建筑',
            category: 'academic',
            position: [wx, wz],
            size: [20, 20],
            height: 12,
            ...(d.zones[0]?.id ? { zoneId: d.zones[0].id } : {}),
          })
          selection = { kind: 'building', index: d.buildings.length - 1 }
          break
        }
        case 'road': {
          const id = this.uniqueId('road', new Set(d.roads.map((r) => r.id)))
          d.roads.push({ id, points: [[wx - 25, wz], [wx + 25, wz]], width: 3.2, kind: 'road', surface: 'concrete', sourceIds: [id] })
          selection = { kind: 'road', index: d.roads.length - 1 }
          break
        }
        case 'zone': {
          const id = this.uniqueId('zone', new Set(d.zones.map((z) => z.id)))
          d.zones.push({ id, name: '新区域', category: 'academic', center: [wx, wz], size: [60, 60], color: '#93c5fd' })
          selection = { kind: 'zone', index: d.zones.length - 1 }
          break
        }
        case 'water': {
          const id = this.uniqueId('water', new Set(d.waters.map((w) => w.id)))
          d.waters.push({ id, name: '新水体', center: [wx, wz], size: [40, 30], color: '#60a5fa' })
          selection = { kind: 'water', index: d.waters.length - 1 }
          break
        }
        case 'field': {
          const id = this.uniqueId('field', new Set(d.fields.map((f) => f.id)))
          d.fields.push({ id, name: '新操场', center: [wx, wz], size: [80, 50], color: '#22c55e', stripeColor: '#86efac' })
          selection = { kind: 'field', index: d.fields.length - 1 }
          break
        }
        case 'poi': {
          const id = this.uniqueId('poi', new Set(d.pois.map((p) => p.id)))
          d.pois.push({ id, name: '新POI', kind: 'landmark', position: [wx, 12, wz], color: '#fbbf24' })
          selection = { kind: 'poi', index: d.pois.length - 1 }
          break
        }
        default:
          break
      }
    })
    if (selection) this.store.select(selection)
  }

  deleteSelected(): void {
    const sel = this.store.selection
    if (!sel) return
    if (sel.kind === 'road-node') {
      this.activeVertex = { kind: 'road-node', id: sel.id }
      this.deleteActiveVertex()
      return
    }
    this.activeVertex = null
    this.store.mutate('delete', (d) => {
      switch (sel.kind) {
        case 'building':
          d.buildings.splice(sel.index, 1)
          break
        case 'road':
          d.roads.splice(sel.index, 1)
          break
        case 'zone':
          d.zones.splice(sel.index, 1)
          break
        case 'water':
          d.waters.splice(sel.index, 1)
          break
        case 'field':
          d.fields.splice(sel.index, 1)
          break
        case 'poi':
          d.pois.splice(sel.index, 1)
          break
      }
    })
    this.store.select(null)
  }
}
