import './style.css'
import { createDefaultCampusData } from './data/campusData'
import { CampusScene } from './scene/CampusScene'
import { ViewState, type LayerKey } from './core/view/state'
import { pickEntity, type PickedEntity } from './interaction'
import { renderEntityList, renderDetails, searchEntities, updateSelectionToast, escapeHtml } from './ui/panel'
import { chooseScaleBar, metersPerPixel } from './ui/scale'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

// 布局按 docs/design-overview-v2.md §6：地图永久占满视区，顶栏 48px，面板浮在图上，
// 窄屏把面板收成底部抽屉（closed / half / full 三档）。
app.innerHTML = `
  <div class="map-pane">
    <div id="scene"></div>
    <div id="label-layer"></div>
  </div>
  <header class="appbar">
    <a class="brand" href="./index.html" aria-label="返回项目首页"><span class="brand-mark" aria-hidden="true"></span><span>CampusNav<span class="brand-dim"> 3D</span></span></a>
    <span class="campus-name" id="hero-title"></span>
    <div class="searchbox" role="search">
      <label class="visually-hidden" for="entity-search">搜索建筑或地点</label>
      <input id="entity-search" type="search" placeholder="搜索建筑 / 地点" autocomplete="off" enterkeyhint="search" />
      <div id="search-results" class="search-results" role="listbox" aria-live="polite"></div>
    </div>
    <button type="button" class="icon-button" id="theme-toggle" aria-label="切换深浅主题" title="切换深浅主题">◐</button>
  </header>
  <aside class="sidebar" id="sidebar" data-drawer="half" aria-label="地图面板">
    <button type="button" class="drawer-handle" id="drawer-handle" aria-label="收起或展开面板"><span></span></button>
    <section class="card">
      <div class="section-head"><h2>图层</h2><span class="muted" id="layer-summary"></span></div>
      <div class="layer-grid" id="layer-controls"></div>
    </section>
    <section class="card">
      <div class="section-head"><h2>对象列表</h2><span class="muted">建筑 / 地标</span></div>
      <div id="entity-list" class="entity-list"></div>
    </section>
    <section class="card">
      <div class="section-head"><h2>选中对象</h2></div>
      <div id="details" class="details"></div>
    </section>
  </aside>
  <div class="map-status" id="selection-toast">未选择对象</div>
  <div class="map-tools" aria-label="地图操作">
    <button type="button" id="reset-camera" title="重置视角">重置</button>
    <button type="button" id="fit-camera" title="适应全图">全图</button>
  </div>
  <div class="map-overlay" id="map-overlay">
    <div class="legend" aria-label="图例"><div><span class="swatch lake"></span>水域</div><div><span class="swatch sports"></span>场地</div><div><span class="swatch academic"></span>教学建筑</div><div><span class="swatch dorm"></span>生活建筑</div><div><span class="swatch selected"></span>当前选择</div></div>
    <div class="map-scale" role="img" aria-label="地图比例尺"><span class="map-scale-bar" id="map-scale-bar"></span><span class="map-scale-label" id="map-scale-label">—</span></div>
  </div>`

const scaleBarEl = document.querySelector<HTMLElement>('#map-scale-bar')
const scaleLabelEl = document.querySelector<HTMLElement>('#map-scale-label')

const $ = <T extends HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error(`UI element missing: ${sel}`); return el }
const sceneHost = $<HTMLDivElement>('#scene'), labelLayer = $<HTMLDivElement>('#label-layer'), heroTitle = $<HTMLElement>('#hero-title'), entityList = $<HTMLDivElement>('#entity-list'), details = $<HTMLDivElement>('#details'), toast = $<HTMLDivElement>('#selection-toast'), search = $<HTMLInputElement>('#entity-search'), searchResults = $<HTMLDivElement>('#search-results'), layerControls = $<HTMLDivElement>('#layer-controls'), layerSummary = $<HTMLSpanElement>('#layer-summary'), sidebar = $<HTMLElement>('#sidebar')
const data = createDefaultCampusData()
const initialSelection: PickedEntity | null = data.buildings.length ? { kind: 'building', index: 0 } : null
const view = new ViewState<PickedEntity>(initialSelection)
const campus = new CampusScene(sceneHost, labelLayer)
if (import.meta.env.DEV) {
  const debugWindow = window as Window & {
    __campusRenderMetrics?: () => ReturnType<CampusScene['getRenderMetrics']>
    __campusRenderBudget?: (budget: Parameters<CampusScene['evaluateRenderBudget']>[0]) => ReturnType<CampusScene['evaluateRenderBudget']>
    __campusRender?: () => void
    __campusResetMetrics?: () => void
    __campusFocus?: (name: string) => boolean
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
campus.setDisplayOptions({ ...view.layers, showEditorAids: false })
campus.setDataAndSelection(data, 0)
campus.resize()
campus.setOverviewCamera()

/* ---------- 主题：与 landing 共用 localStorage 键，深浅两套令牌在 style.css 里同表 ---------- */

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
if (!root.dataset.theme) {
  const stored = readStoredTheme()
  root.dataset.theme = stored === 'dark' || (!stored && systemPrefersDark()) ? 'dark' : 'light'
}
function applyTheme(theme: Theme): void {
  root.dataset.theme = theme
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* 隐私模式写不进就算了 */ }
  themeButton.textContent = theme === 'dark' ? '☀' : '◐'
  requestRender()
}
applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
themeButton.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'))

/* ---------- 窄屏抽屉：closed → half → full 循环 ---------- */

const drawerOrder = ['closed', 'half', 'full'] as const
type DrawerState = (typeof drawerOrder)[number]
const narrowViewport = (): boolean => window.matchMedia('(max-width: 959px)').matches
/** 三档抽屉高度，与 style.css 里 .sidebar 的取值保持一致 */
const DRAWER_HEIGHT: Record<DrawerState, string> = { closed: 'calc(var(--tap) + 6px)', half: '44vh', full: '86vh' }
/** 地图左下浮层按抽屉高度避让，否则窄屏下比例尺会被抽屉盖住 */
function syncDrawerOffset(): void {
  const state = (sidebar.dataset.drawer as DrawerState | undefined) ?? 'half'
  document.documentElement.style.setProperty('--drawer-h', narrowViewport() ? DRAWER_HEIGHT[state] ?? DRAWER_HEIGHT.half : '0px')
}
function setDrawer(state: DrawerState): void {
  sidebar.dataset.drawer = state
  syncDrawerOffset()
  requestRender()
}
syncDrawerOffset()
$<HTMLButtonElement>('#drawer-handle').addEventListener('click', () => {
  const current = (sidebar.dataset.drawer as DrawerState | undefined) ?? 'half'
  const index = drawerOrder.indexOf(current)
  setDrawer(drawerOrder[(index + 1) % drawerOrder.length])
})

const layerDefs = [
  ['showBuildings', '建筑'], ['showPaths', '道路'], ['showWater', '水域'], ['showFields', '场地'], ['showTrees', '树木'], ['showZones', '分区'], ['showPois', 'POI'], ['showLabels', '标签'],
] as const
layerControls.innerHTML = layerDefs.map(([key, label]) => `<label class="toggle"><input type="checkbox" data-layer="${key}" ${view.layers[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')

function syncUi(): void {
  heroTitle.textContent = data.name
  renderEntityList(data, view.selected, entityList, search.value); renderDetails(data, view.selected, details); updateSelectionToast(data, view.selected, toast)
  const active = layerDefs.filter(([key]) => view.layers[key]).length; layerSummary.textContent = `${active}/${layerDefs.length} 开启`
}
function select(entity: PickedEntity, focus = true): void {
  if (entity.kind === 'building' && !data.buildings[entity.index]) return
  const poiIndex = entity.kind === 'poi' ? data.pois.findIndex((poi) => poi.id === entity.id) : -1
  if (entity.kind === 'poi' && poiIndex < 0) return
  view.setSelected(entity)
  campus.setEditorSelection(entity.kind === 'building' ? entity : { kind: 'poi', index: poiIndex })
  if (focus) entity.kind === 'building' ? campus.focusBuilding(entity.index) : campus.focusPoi(entity.id)
  // 窄屏抽屉收起时选中对象，自动拉到半屏，否则详情根本看不见。
  if (narrowViewport() && (sidebar.dataset.drawer ?? 'half') === 'closed') setDrawer('half')
  requestRender()
  syncUi()
}
syncUi()

entityList.addEventListener('click', (event) => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]'); if (!item) return; select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' }) })
search.addEventListener('input', () => { const results = searchEntities(data, search.value); searchResults.innerHTML = results.slice(0, 8).map((item) => `<button type="button" class="search-result" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)}</small></button>`).join(''); renderEntityList(data, view.selected, entityList, search.value) })
searchResults.addEventListener('click', (event) => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]'); if (!item) return; select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' }); searchResults.innerHTML = '' })
layerControls.addEventListener('change', (event) => { const input = (event.target as HTMLInputElement).closest<HTMLInputElement>('[data-layer]'); if (!input) return; const key = input.dataset.layer as LayerKey; view.setLayer(key, input.checked); campus.setDisplayOptions(view.layers); requestRender(); syncUi() })
$<HTMLButtonElement>('#reset-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
$<HTMLButtonElement>('#fit-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
campus.renderer.domElement.addEventListener('click', (event) => { const entity = pickEntity(event, campus.renderer.domElement, campus.camera, campus.clickableObjects); if (entity) select(entity) })
const onResize = () => { campus.resize(); syncDrawerOffset(); requestRender() }; onResize(); window.addEventListener('resize', onResize)
requestRender()

// 键盘：`/` 聚焦搜索、Esc 收起联想（§6.4）。
window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) { event.preventDefault(); search.focus() }
  if (event.key === 'Escape' && document.activeElement === search) { search.blur(); searchResults.innerHTML = '' }
})

// 壳内搜索深链：?q=图书馆 预先填入并跑一次搜索，否则原生壳搜索框只改 URL、页面没反应。
const initialQuery = new URLSearchParams(window.location.search).get('q')?.trim()
if (initialQuery) {
  search.value = initialQuery
  search.dispatchEvent(new Event('input'))
}
