import './style.css'
import { createDefaultCampusData } from './data/campusData'
import { CampusScene } from './scene/CampusScene'
import { ViewState, type LayerKey } from './core/view/state'
import { pickEntity, type PickedEntity } from './interaction'
import { renderEntityList, renderDetails, searchEntities, updateSelectionToast, escapeHtml } from './ui/panel'
import { chooseScaleBar, metersPerPixel } from './ui/scale'
import { mountWebglFallback, probeWebgl } from './ui/webgl-fallback'

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
  </aside>
  <aside class="detail-card" id="detail-card" aria-label="地点详情" hidden>
    <div class="dc-head">
      <div class="dc-title"><h3 id="detail-title"></h3><p class="dc-sub" id="detail-subtitle"></p></div>
      <button type="button" class="dc-close" id="detail-close" aria-label="关闭详情" title="关闭详情">✕</button>
    </div>
    <div class="dc-body" id="details"></div>
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
const sceneHost = $<HTMLDivElement>('#scene'), labelLayer = $<HTMLDivElement>('#label-layer'), heroTitle = $<HTMLElement>('#hero-title'), entityList = $<HTMLDivElement>('#entity-list'), details = $<HTMLDivElement>('#details'), toast = $<HTMLDivElement>('#selection-toast'), search = $<HTMLInputElement>('#entity-search'), searchResults = $<HTMLDivElement>('#search-results'), layerControls = $<HTMLDivElement>('#layer-controls'), layerSummary = $<HTMLSpanElement>('#layer-summary'), sidebar = $<HTMLElement>('#sidebar'), detailCard = $<HTMLElement>('#detail-card'), detailTitle = $<HTMLElement>('#detail-title'), detailSubtitle = $<HTMLElement>('#detail-subtitle'), detailClose = $<HTMLButtonElement>('#detail-close')
const data = createDefaultCampusData()
const initialSelection: PickedEntity | null = data.buildings.length ? { kind: 'building', index: 0 } : null
const view = new ViewState<PickedEntity>(initialSelection)
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

/* ---------- 窄屏抽屉：拖动吸附 + 轻点循环 closed → half → full ---------- */

const drawerOrder = ['closed', 'half', 'full'] as const
type DrawerState = (typeof drawerOrder)[number]
const narrowViewport = (): boolean => window.matchMedia('(max-width: 959px)').matches
/** 三档抽屉高度，与 style.css 里 .sidebar 的取值保持一致；half 收到 30vh，地图默认多留一截 */
const DRAWER_HEIGHT: Record<DrawerState, string> = { closed: 'calc(var(--tap) + 6px)', half: '30vh', full: '86vh' }
/** 吸附阈值用的同一套数字（height 百分比），拖动时按落点选最近一档 */
const DRAWER_VH: Record<Exclude<DrawerState, 'closed'>, number> = { half: 0.3, full: 0.86 }
/** 地图左下浮层按抽屉高度避让，否则窄屏下比例尺会被抽屉盖住 */
function syncDrawerOffset(height?: string): void {
  const state = (sidebar.dataset.drawer as DrawerState | undefined) ?? 'half'
  const value = height ?? (narrowViewport() ? DRAWER_HEIGHT[state] ?? DRAWER_HEIGHT.half : '0px')
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
const drawerSnapPx = (state: DrawerState): number => {
  const h = window.innerHeight
  return state === 'closed' ? 0 : h * DRAWER_VH[state]
}
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
  renderEntityList(data, view.selected, entityList, search.value)
  // 详情卡是浮在图上的一块独立卡片（§6.3）：选中才出，关掉后重新选中还会再弹。
  const summary = renderDetails(data, view.selected, details)
  detailTitle.textContent = summary?.name ?? ''
  detailSubtitle.textContent = summary?.subtitle ?? ''
  // 手动关掉的卡片不许被下一次 syncUi（切图层、拉抽屉）又弹回来。
  detailCard.hidden = !summary || selectionKey(view.selected) === dismissedDetail
  updateSelectionToast(data, view.selected, toast)
  const active = layerDefs.filter(([key]) => view.layers[key]).length; layerSummary.textContent = `${active}/${layerDefs.length} 开启`
}
/** 选中对象的稳定标识，用来记住「这张卡是用户自己关掉的」。 */
const selectionKey = (selected: PickedEntity | null): string => !selected ? '' : selected.kind === 'building' ? `building:${selected.index}` : `poi:${selected.id}`
let dismissedDetail: string | null = null

function select(entity: PickedEntity, focus = true): void {
  if (entity.kind === 'building' && !data.buildings[entity.index]) return
  const poiIndex = entity.kind === 'poi' ? data.pois.findIndex((poi) => poi.id === entity.id) : -1
  if (entity.kind === 'poi' && poiIndex < 0) return
  view.setSelected(entity)
  dismissedDetail = null
  campus.setEditorSelection(entity.kind === 'building' ? entity : { kind: 'poi', index: poiIndex })
  if (focus) entity.kind === 'building' ? campus.focusBuilding(entity.index) : campus.focusPoi(entity.id)
  // 窄屏抽屉收起时选中对象，自动拉到半屏，否则详情根本看不见。
  if (narrowViewport() && (sidebar.dataset.drawer ?? 'half') === 'closed') setDrawer('half')
  requestRender()
  syncUi()
}
syncUi()

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
search.addEventListener('input', () => { renderSearchResults(); renderEntityList(data, view.selected, entityList, search.value) })
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
campus.renderer.domElement.addEventListener('click', (event) => { const entity = pickEntity(event, campus.renderer.domElement, campus.camera, campus.clickableObjects); if (entity) select(entity) })
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
const initialQuery = new URLSearchParams(window.location.search).get('q')?.trim()
if (initialQuery) {
  search.value = initialQuery
  search.dispatchEvent(new Event('input'))
}
