import './style.css'
import './ui/site-nav.css'
import { createDefaultCampusData } from './data/campusData'
import packDataJson from '../packs/usts-tianping/campus.json'
import { CampusScene } from './scene/CampusScene'
import { ViewState, type LayerKey } from './core/view/state'
import { pickEntity, type PickedEntity } from './interaction'
import { renderEntityList, renderDetails, renderFilterChips, searchEntities, updateSelectionToast, escapeHtml, type EntityFilter } from './ui/panel'
import { chooseScaleBar, metersPerPixel } from './ui/scale'
import { mountWebglFallback, probeWebgl } from './ui/webgl-fallback'
import { siteNavHtml } from './ui/site-nav'
import { parseDeepLink, type DeepLinkState } from './deeplink/index'
import { mountIndoorLevels, normalizeIndoorLevel } from './ui/indoor-levels'
import { planRouteBetweenBuildings } from './navigation/route'
import { createRouteOverlay, mountNavigationUi, navigationPickEntity, type NavigationRouteState } from './ui/navigation-ui'

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('App root not found')
const app: HTMLDivElement = appRoot

// 兜底（§6.5）：壳内白屏查不动，所以建渲染器之前先探一次 WebGL。
// 拿不到就把原因 / 地址 / UA 摆在页面上，人直接截图或复制回来。
const webgl = probeWebgl(document)
if (!webgl.ok) {
  mountWebglFallback(app, { reason: webgl.reason, url: window.location.href, userAgent: navigator.userAgent })
  throw new Error(`WebGL unavailable: ${webgl.reason}`)
}

// 布局按 docs/design-overview-v2.md §6：地图永久占满视区，顶栏 48px，面板浮在图上，
// 窄屏把面板收成底部抽屉（peek / half / full 三档，默认 peek）。
app.innerHTML = `
  <div class="map-pane">
    <div id="scene"></div>
    <div id="label-layer"></div>
  </div>
  <header class="appbar">
    <a class="brand" href="./index.html" aria-label="返回项目首页"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">CampusNav<span class="brand-dim"> 3D</span></span></a>
    <div class="searchbox" role="search">
      <label class="visually-hidden" for="entity-search">搜索建筑或地点</label>
      <input id="entity-search" type="search" placeholder="搜索建筑 / 地点" autocomplete="off" enterkeyhint="search" />
      <div id="search-results" class="search-results" role="listbox" aria-live="polite"></div>
    </div>
    ${siteNavHtml('demo')}
    <button type="button" class="icon-button" id="theme-toggle" aria-label="切换深浅主题" title="切换深浅主题">◐</button>
  </header>
  <div class="indoor-levels" id="indoor-levels" hidden></div>
  <aside class="sidebar" id="sidebar" data-drawer="peek" aria-label="地图面板">
    <button type="button" class="drawer-handle" id="drawer-handle" aria-label="收起或展开面板"><span></span></button>
    <section class="card">
      <div class="section-head"><h2>图层</h2><span class="muted" id="layer-summary"></span></div>
      <div class="layer-grid" id="layer-controls"></div>
    </section>
    <section class="card">
      <div class="section-head"><h2>对象列表</h2><span class="muted">建筑 / 地标</span></div>
      <div id="entity-filters" class="filter-chips" role="group" aria-label="按分类筛选对象"></div>
      <div id="entity-list" class="entity-list"></div>
    </section>
    <div id="navigation-ui"></div>
  </aside>
  <aside class="detail-card" id="detail-card" aria-label="地点详情" hidden>
    <div class="dc-head">
      <div class="dc-title"><h3 id="detail-title"></h3><p class="dc-sub" id="detail-subtitle"></p></div>
      <button type="button" class="dc-close" id="detail-close" aria-label="关闭详情" title="关闭详情">✕</button>
    </div>
    <div class="dc-body" id="details"></div>
  </aside>
  <footer class="status-bar" id="status-bar" role="contentinfo" aria-label="地图状态">
    <p class="sb-credit"><strong>CampusNav 3D</strong><span class="sb-credit-dim" id="hero-title"></span></p>
    <p class="sb-status" id="selection-toast" aria-live="polite">未选择对象</p>
    <div class="sb-legend" aria-label="图例"><div><span class="swatch lake"></span>水域</div><div><span class="swatch sports"></span>场地</div><div><span class="swatch academic"></span>教学建筑</div><div><span class="swatch dorm"></span>生活建筑</div><div><span class="swatch selected"></span>当前选择</div></div>
    <div class="map-scale" role="img" aria-label="地图比例尺"><span class="map-scale-bar" id="map-scale-bar"></span><span class="map-scale-label" id="map-scale-label">—</span></div>
    <div class="sb-tools" aria-label="地图操作">
      <button type="button" id="reset-camera" title="重置视角">重置</button>
      <button type="button" id="fit-camera" title="适应全图">全图</button>
    </div>
  </footer>`

const scaleBarEl = document.querySelector<HTMLElement>('#map-scale-bar')
const scaleLabelEl = document.querySelector<HTMLElement>('#map-scale-label')

const $ = <T extends HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error(`UI element missing: ${sel}`); return el }
const sceneHost = $<HTMLDivElement>('#scene'), labelLayer = $<HTMLDivElement>('#label-layer'), heroTitle = $<HTMLElement>('#hero-title'), entityList = $<HTMLDivElement>('#entity-list'), filterChips = $<HTMLDivElement>('#entity-filters'), details = $<HTMLDivElement>('#details'), toast = $<HTMLDivElement>('#selection-toast'), search = $<HTMLInputElement>('#entity-search'), searchResults = $<HTMLDivElement>('#search-results'), layerControls = $<HTMLDivElement>('#layer-controls'), layerSummary = $<HTMLSpanElement>('#layer-summary'), sidebar = $<HTMLElement>('#sidebar'), detailCard = $<HTMLElement>('#detail-card'), detailClose = $<HTMLButtonElement>('#detail-close')
const data = createDefaultCampusData()

/** M2-A 的 floors 在 packToLegacyData 里没带过来；这里只做内存补齐，不改 schema / packs。 */
type RawFloor = { level: number; name?: string }
type RawBuilding = { id: string; floors?: RawFloor[] }
type RawConnector = { id: string; kind: string; from: { building: string; level: number }; to: { building: string; level: number } }
const rawPack = packDataJson as unknown as { buildings?: RawBuilding[]; connectors?: RawConnector[] }
const floorsById = new Map((rawPack.buildings ?? []).filter((b) => Array.isArray(b.floors) && b.floors.length).map((b) => [b.id, b.floors!]))
for (const building of data.buildings) {
  const floors = floorsById.get(building.id)
  if (floors) Object.assign(building, { floors })
}
if (Array.isArray(rawPack.connectors)) Object.assign(data, { connectors: rawPack.connectors })

/** M2-C + M4-A：?q= 与 ?building=&level= 走同一个解析器，互不覆盖。非法参数整条回落。 */
function resolveDeepLink(href: string): DeepLinkState | null {
  const url = new URL(href, window.location.origin)
  // demo.html 是壳内入口；M4-A 对 .html 只放行单参数 ?q=（遗留锁）。
  // 用包名换掉入口文件名，让同一解析器一次吃下 q + building + level，不另写一套解析。
  const isEntry = /\.html$/.test(url.pathname)
  const normalized = isEntry
    ? `${url.origin}/usts-tianping${url.search}${url.hash}`
    : href
  const parsed = parseDeepLink(normalized)
  if (!parsed || !('pack' in parsed)) return null
  // 老 ?q= 单参数链接：保留 M4-A 的默认 pack 语义。
  return parsed
}
const deepLink = resolveDeepLink(window.location.href)

const deepLinkBuildingIndex = deepLink?.building
  ? data.buildings.findIndex((building) => building.id === deepLink.building)
  : -1
const initialSelection: PickedEntity | null = deepLinkBuildingIndex >= 0
  ? { kind: 'building', index: deepLinkBuildingIndex }
  : data.buildings.length ? { kind: 'building', index: 0 } : null
const view = new ViewState<PickedEntity>(initialSelection)

/** 室内楼层状态：null = 整楼视图；只对带 floors 的建筑开放。 */
let indoorLevel: number | null = null
function applyIndoorState(entity: PickedEntity | null, requestedLevel: number | null): void {
  const building = entity?.kind === 'building' ? data.buildings[entity.index] : undefined
  indoorLevel = requestedLevel === null ? null : normalizeIndoorLevel(building, requestedLevel)
}
// 首屏深链：楼合法才解析层；非法楼/层都优雅回落整楼视图，不白屏。
applyIndoorState(initialSelection, deepLink?.level ?? null)
/** 探测过了也可能在建渲染器时抛（上下文数量到上限、驱动崩）：兜底提示之后照旧把错误抛出去。 */
function createScene(host: HTMLDivElement, labels: HTMLDivElement): CampusScene {
  try {
    return new CampusScene(host, labels)
  } catch (error) {
    mountWebglFallback(app, {
      reason: `WebGL 渲染器创建失败：${error instanceof Error ? error.message : String(error)}`,
      url: window.location.href,
      userAgent: navigator.userAgent,
    })
    throw error
  }
}
const campus = createScene(sceneHost, labelLayer)
if (import.meta.env.DEV) {
  const debugWindow = window as Window & {
    __campusRenderMetrics?: () => ReturnType<CampusScene['getRenderMetrics']>
    __campusRenderBudget?: (budget: Parameters<CampusScene['evaluateRenderBudget']>[0]) => ReturnType<CampusScene['evaluateRenderBudget']>
    __campusRender?: () => void
    __campusResetMetrics?: () => void
    __campusFocus?: (name: string) => boolean
    __m5bRouteOverlay?: () => number
  }
  debugWindow.__campusRenderMetrics = () => campus.getRenderMetrics()
  debugWindow.__campusRenderBudget = (budget) => campus.evaluateRenderBudget(budget)
  debugWindow.__campusRender = () => campus.render(performance.now() / 1000)
  debugWindow.__campusResetMetrics = () => campus.resetRenderMetrics()
  debugWindow.__campusFocus = (name) => {
    const index = data.buildings.findIndex((building) => building.name.includes(name))
    if (index < 0) return false
    campus.setEditorSelection({ kind: 'building', index })
    campus.focusBuilding(index)
    return true
  }
}
let renderScheduled = false
let renderPending = true
const requestRender = (): void => {
  renderPending = true
  if (renderScheduled) return
  renderScheduled = true
  window.requestAnimationFrame((time) => {
    renderScheduled = false
    if (!renderPending) return
    renderPending = false
    campus.render(time / 1000)
    updateScaleBar()
  })
}
campus.controls.addEventListener('change', requestRender)

/* ---------- 比例尺：随相机视距变化，1 场景单位 = 1 米 ---------- */

let scaleKey = ''
function updateScaleBar(): void {
  if (!scaleBarEl || !scaleLabelEl) return
  const height = campus.renderer.domElement.clientHeight || window.innerHeight
  const distance = campus.camera.position.distanceTo(campus.controls.target)
  const bar = chooseScaleBar(metersPerPixel(distance, campus.camera.fov, height))
  const key = `${bar.label}/${bar.pixels}`
  if (key === scaleKey) return
  scaleKey = key
  scaleLabelEl.textContent = bar.label
  scaleBarEl.style.width = `${bar.pixels}px`
}

/* ---------- M5-B 导航 UI：起终点选择 → 聚合路线 → 高亮 + 摘要 ---------- */
const routeOverlay = createRouteOverlay(campus.scene)
const routeState: NavigationRouteState = { origin: null, destination: null, summary: null, error: '' }

function applyRoute(): void {
  if (routeState.origin === null || routeState.destination === null) {
    routeState.summary = null
    routeState.error = ''
    routeOverlay.setRoute(null)
    navUi.update(data, routeState)
    requestRender()
    return
  }
  const summary = planRouteBetweenBuildings(data, routeState.origin, routeState.destination)
  routeState.summary = summary
  routeState.error = summary ? '' : '这两栋建筑之间没有可通行的步行路线'
  routeOverlay.setRoute(summary)
  navUi.update(data, routeState)
  const bounds = routeOverlay.bounds()
  if (bounds) {
    campus.controls.target.set(bounds.center[0], 0, bounds.center[1])
    const distance = Math.max(90, bounds.size * 1.8)
    campus.camera.position.set(bounds.center[0] - distance * 0.65, distance * 0.85, bounds.center[1] + distance * 0.75)
    campus.controls.update()
  }
  requestRender()
}

const navUi = mountNavigationUi($<HTMLElement>('#navigation-ui'), {
  onRouteRequest: (origin, destination) => {
    routeState.origin = origin >= 0 && data.buildings[origin] ? origin : null
    routeState.destination = destination >= 0 && data.buildings[destination] ? destination : null
    applyRoute()
  },
  onClear: () => {
    routeState.origin = null
    routeState.destination = null
    applyRoute()
  },
  onPickModeChange: () => requestRender(),
})
// 摘要卡独立浮在地图上，不放侧栏内：详情卡展开时也不会把路线信息挡住（M5-A 零重叠）。
const navSummaryEl = app.querySelector<HTMLElement>('#nav-summary')
if (navSummaryEl) app.appendChild(navSummaryEl)
navUi.update(data, routeState)
if (import.meta.env.DEV) {
  ;(window as Window & { __m5bRouteOverlay?: () => number }).__m5bRouteOverlay = () => campus.scene.getObjectByName('m5b-route-overlay')?.children.length ?? -1
}

campus.setDisplayOptions({ ...view.layers, showEditorAids: false })
campus.setDataAndSelection(data, 0)
campus.resize()
campus.setOverviewCamera()

/* ---------- 主题：与 landing 共用令牌表（src/theme/tokens.css）与 localStorage 键 ---------- */

type Theme = 'light' | 'dark'
const THEME_KEY = 'campusnav-theme'
const root = document.documentElement
const themeButton = $<HTMLButtonElement>('#theme-toggle')
function readStoredTheme(): string | null {
  try { return localStorage.getItem(THEME_KEY) } catch { return null }
}
function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
function resolveTheme(): Theme {
  const stored = readStoredTheme()
  if (stored === 'dark' || stored === 'light') return stored
  return systemPrefersDark() ? 'dark' : 'light'
}
/** theme-color 跟着 --bg 走：地址栏 / 壳内状态栏与页面底色同色，颜色只在 CSS 令牌里定义 */
function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) meta.setAttribute('content', bg)
}
function applyTheme(theme: Theme): void {
  root.dataset.theme = theme
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* 隐私模式写不进就算了 */ }
  themeButton.textContent = theme === 'dark' ? '☀' : '◐'
  themeButton.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  syncThemeColor()
  requestRender()
}
// 首屏内联脚本已回放过主题；这里只兜底（脚本被拦下时）
if (root.dataset.theme !== 'dark' && root.dataset.theme !== 'light') root.dataset.theme = resolveTheme()
applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
themeButton.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'))
// 用户没手动选过就跟着系统走，别把系统切深色的人锁在浅色里
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!readStoredTheme()) applyTheme(systemPrefersDark() ? 'dark' : 'light')
})

/* ---------- 窄屏抽屉：拖动吸附 + 轻点循环 peek → half → full ---------- */

const drawerOrder = ['peek', 'half', 'full'] as const
type DrawerState = (typeof drawerOrder)[number]
const narrowViewport = (): boolean => window.matchMedia('(max-width: 959px)').matches
/** 三档抽屉高度，与 style.css 里 .sidebar 的取值保持一致；peek 高度走令牌，地图默认是主视区 */
const DRAWER_HEIGHT: Record<DrawerState, string> = { peek: 'var(--drawer-peek-height)', half: '30vh', full: '86vh' }
/** 吸附阈值用的同一套数字（height 百分比），拖动时按落点选最近一档；peek 是固定像素，单独取 */
const DRAWER_VH: Record<Exclude<DrawerState, 'peek'>, number> = { half: 0.3, full: 0.86 }
/** 读 CSS 令牌的像素值（peek 高度只有令牌这一处真值，脚本不许再抄一份数字） */
function cssPx(name: string, fallback: number): number {
  const raw = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(raw) ? raw : fallback
}
/** 地图左下浮层按抽屉高度避让，否则窄屏下比例尺会被抽屉盖住 */
function syncDrawerOffset(height?: string): void {
  const state = (sidebar.dataset.drawer as DrawerState | undefined) ?? 'peek'
  const value = height ?? (narrowViewport() ? DRAWER_HEIGHT[state] ?? DRAWER_HEIGHT.peek : '0px')
  document.documentElement.style.setProperty('--drawer-h', value)
}
function setDrawer(state: DrawerState): void {
  sidebar.dataset.drawer = state
  syncDrawerOffset()
  requestRender()
}
syncDrawerOffset()

// 手柄：按下后上下拖动 = 按落点吸附；没拖动就是轻点，三档循环。
const drawerHandle = $<HTMLButtonElement>('#drawer-handle')
const drawerSnapPx = (state: DrawerState): number =>
  state === 'peek' ? cssPx('--drawer-peek-height', 50) : window.innerHeight * DRAWER_VH[state]
const drawerNearest = (height: number): DrawerState => drawerOrder
  .map((state) => [state, Math.abs(drawerSnapPx(state) - height)] as const)
  .reduce((best, item) => (item[1] < best[1] ? item : best))[0]

let drawerDrag: { pointerId: number; startY: number; startHeight: number; moved: boolean } | null = null
/** 拖动期间 click 会跟在 pointerup 后面，用它判断这次点击要不要当成「轻点循环」 */
let drawerDragged = false

drawerHandle.addEventListener('pointerdown', (event) => {
  if (!narrowViewport() || event.button !== 0) return
  drawerDrag = { pointerId: event.pointerId, startY: event.clientY, startHeight: sidebar.getBoundingClientRect().height, moved: false }
  drawerDragged = false
  drawerHandle.setPointerCapture(event.pointerId)
})

drawerHandle.addEventListener('pointermove', (event) => {
  if (!drawerDrag || event.pointerId !== drawerDrag.pointerId) return
  const delta = drawerDrag.startY - event.clientY
  if (!drawerDrag.moved) {
    if (Math.abs(delta) <= 6) return
    drawerDrag.moved = true
    sidebar.classList.add('dragging')
  }
  const height = Math.min(window.innerHeight * DRAWER_VH.full, Math.max(0, drawerDrag.startHeight + delta))
  sidebar.style.height = `${height}px`
  syncDrawerOffset(`${height}px`)
  event.preventDefault()
})

function endDrawerDrag(event: PointerEvent): void {
  if (!drawerDrag || event.pointerId !== drawerDrag.pointerId) return
  const dragged = drawerDrag.moved
  const height = sidebar.getBoundingClientRect().height
  drawerDrag = null
  if (drawerHandle.hasPointerCapture(event.pointerId)) drawerHandle.releasePointerCapture(event.pointerId)
  if (!dragged) return
  drawerDragged = true
  sidebar.classList.remove('dragging')
  sidebar.style.height = ''
  setDrawer(drawerNearest(height))
}
drawerHandle.addEventListener('pointerup', endDrawerDrag)
drawerHandle.addEventListener('pointercancel', endDrawerDrag)

drawerHandle.addEventListener('click', () => {
  if (drawerDragged) { drawerDragged = false; return }
  const current = (sidebar.dataset.drawer as DrawerState | undefined) ?? 'peek'
  const index = drawerOrder.indexOf(current)
  setDrawer(drawerOrder[(index + 1) % drawerOrder.length])
})

const layerDefs = [
  ['showBuildings', '建筑'], ['showPaths', '道路'], ['showWater', '水域'], ['showFields', '场地'], ['showTrees', '树木'], ['showZones', '分区'], ['showPois', 'POI'], ['showLabels', '标签'],
] as const
layerControls.innerHTML = layerDefs.map(([key, label]) => `<label class="toggle"><input type="checkbox" data-layer="${key}" ${view.layers[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')

// 分类筛选（s4）：chip 选中态与列表同步，搜索框输入时保持当前分类。
let activeFilter: EntityFilter = 'all'

/** 把室内状态写回 URL；只动 building/level 两个键，保留 ?q= 与其它查询参数。 */
function syncIndoorUrl(): void {
  const url = new URL(window.location.href)
  const selected = view.selected
  const building = selected?.kind === 'building' ? data.buildings[selected.index] : undefined
  if (building && indoorLevel !== null) {
    url.searchParams.set('building', building.id)
    url.searchParams.set('level', String(indoorLevel))
  } else {
    url.searchParams.delete('building')
    url.searchParams.delete('level')
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', next)
  }
}

const indoorHost = $<HTMLElement>('#indoor-levels')
const indoorBar = mountIndoorLevels(indoorHost, {
  data,
  onSelect: (level) => {
    if (!view.selected || view.selected.kind !== 'building') return
    applyIndoorState(view.selected, level)
    syncIndoorUrl()
    indoorBar.update(data.buildings[view.selected.index], indoorLevel)
    requestRender()
  },
})

function syncUi(): void {
  heroTitle.textContent = data.name
  renderFilterChips(filterChips, activeFilter)
  renderEntityList(data, view.selected, entityList, search.value, activeFilter)
  // 详情卡是浮在图上的一块独立卡片（§6.3）：选中才出，关掉后重新选中还会再弹。
  renderDetails(data, view.selected, details)
  // 手动关掉的卡片不许被下一次 syncUi（切图层、拉抽屉）又弹回来。
  detailCard.hidden = !view.selected || selectionKey(view.selected) === dismissedDetail
  updateSelectionToast(data, view.selected, toast)
  const active = layerDefs.filter(([key]) => view.layers[key]).length; layerSummary.textContent = `${active}/${layerDefs.length} 开启`
  const indoorBuilding = view.selected?.kind === 'building' ? data.buildings[view.selected.index] : undefined
  indoorBar.update(indoorBuilding, indoorLevel)
}
/** 选中对象的稳定标识，用来记住「这张卡是用户自己关掉的」。 */
const selectionKey = (selected: PickedEntity | null): string => !selected ? '' : selected.kind === 'building' ? `building:${selected.index}` : `poi:${selected.id}`
let dismissedDetail: string | null = null

function select(entity: PickedEntity, focus = true): void {
  if (entity.kind === 'building' && !data.buildings[entity.index]) return
  const poiIndex = entity.kind === 'poi' ? data.pois.findIndex((poi) => poi.id === entity.id) : -1
  if (entity.kind === 'poi' && poiIndex < 0) return
  const sameBuilding = view.selected?.kind === 'building' && entity.kind === 'building' && view.selected.index === entity.index
  view.setSelected(entity)
  dismissedDetail = null
  if (!sameBuilding) applyIndoorState(entity, null)
  syncIndoorUrl()
  campus.setEditorSelection(entity.kind === 'building' ? entity : { kind: 'poi', index: poiIndex })
  if (focus) entity.kind === 'building' ? campus.focusBuilding(entity.index) : campus.focusPoi(entity.id)
  // 窄屏默认 peek：选中对象才把抽屉拉到半屏，否则详情根本看不见。
  if (narrowViewport() && (sidebar.dataset.drawer ?? 'peek') === 'peek') setDrawer('half')
  requestRender()
  syncUi()
}
syncUi()

filterChips.addEventListener('click', (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]')
  if (!chip) return
  activeFilter = (chip.dataset.filter ?? 'all') as EntityFilter
  syncUi()
})
entityList.addEventListener('click', (event) => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]'); if (!item) return; select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' }) })
// 搜索联想浮层（§6.3）：输入即出，↑↓ 选项、Enter 选中、Esc 收起。
let searchIndex = -1
const searchItems = (): HTMLButtonElement[] => Array.from(searchResults.querySelectorAll<HTMLButtonElement>('.search-result'))
function closeSearchResults(): void {
  searchIndex = -1
  searchResults.innerHTML = ''
  searchResults.setAttribute('aria-expanded', 'false')
  search.removeAttribute('aria-activedescendant')
}
function renderSearchResults(): void {
  const results = searchEntities(data, search.value).slice(0, 8)
  searchIndex = -1
  searchResults.innerHTML = results.map((item, index) => `<button type="button" role="option" aria-selected="false" id="search-option-${index}" class="search-result" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)}</small></button>`).join('')
  searchResults.setAttribute('aria-expanded', String(results.length > 0))
  search.setAttribute('aria-controls', 'search-results')
  search.removeAttribute('aria-activedescendant')
}
function highlightSearchResult(step: number): void {
  const items = searchItems()
  if (!items.length) return
  searchIndex = (searchIndex + step + items.length * 2) % items.length
  items.forEach((el, index) => { const active = index === searchIndex; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)) })
  search.setAttribute('aria-activedescendant', items[searchIndex].id)
  items[searchIndex].scrollIntoView({ block: 'nearest' })
}
search.addEventListener('input', () => { renderSearchResults(); renderEntityList(data, view.selected, entityList, search.value, activeFilter) })
search.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); highlightSearchResult(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); highlightSearchResult(-1) }
  else if (event.key === 'Enter' && searchIndex >= 0) { event.preventDefault(); searchItems()[searchIndex]?.click() }
})
search.addEventListener('blur', () => { window.setTimeout(closeSearchResults, 120) })
searchResults.addEventListener('click', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]')
  if (!item) return
  select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' })
  closeSearchResults()
  search.blur()
})
detailClose.addEventListener('click', () => { dismissedDetail = selectionKey(view.selected); detailCard.hidden = true })
layerControls.addEventListener('change', (event) => { const input = (event.target as HTMLInputElement).closest<HTMLInputElement>('[data-layer]'); if (!input) return; const key = input.dataset.layer as LayerKey; view.setLayer(key, input.checked); campus.setDisplayOptions(view.layers); requestRender(); syncUi() })
$<HTMLButtonElement>('#reset-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
$<HTMLButtonElement>('#fit-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
campus.renderer.domElement.addEventListener('click', (event) => {
  const entity = pickEntity(event, campus.renderer.domElement, campus.camera, campus.clickableObjects)
  if (!entity) return
  const mode = navUi.pickMode()
  if (mode) {
    const building = navigationPickEntity(entity)
    if (building === null) return
    if (mode === 'origin') routeState.origin = building
    else routeState.destination = building
    navUi.setPickMode(null)
    applyRoute()
    return
  }
  select(entity)
})
const onResize = () => { campus.resize(); syncDrawerOffset(); requestRender() }; onResize(); window.addEventListener('resize', onResize)
requestRender()

// 键盘：`/` 聚焦搜索、Esc 收起联想或详情卡（§6.4）。
window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) { event.preventDefault(); search.focus() }
  if (event.key !== 'Escape') return
  if (document.activeElement === search) { search.blur(); closeSearchResults() }
  else if (!detailCard.hidden) { dismissedDetail = selectionKey(view.selected); detailCard.hidden = true }
})

// 壳内搜索深链：?q=图书馆 预先填入并跑一次搜索，否则原生壳搜索框只改 URL、页面没反应。
// 与 ?building=&level= 共用上面的 parseDeepLink 结果，两者互不覆盖。
// 遗留锁（PR #29）：?q= 的既有读法与「填入 + 派发 input」这一条保持不变。
const initialQuery = new URLSearchParams(window.location.search).get('q')?.trim()
if (initialQuery && !deepLink?.q) {
  search.value = initialQuery
  search.dispatchEvent(new Event('input'))
}
// M4-A 解析结果优先：?q= 与 ?building&level= 由同一个函数产出，互不覆盖。
// parseDeepLink 给出 q 时（含与 building/level 组合），用它覆盖上面的遗留读法。
if (deepLink?.q) {
  search.value = deepLink.q
  search.dispatchEvent(new Event('input'))
}
syncIndoorUrl()
