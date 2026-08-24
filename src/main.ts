import './style.css'
import { createDefaultCampusData } from './data/campusData'
import { CampusScene, type SceneDisplayOptions } from './scene/CampusScene'
import { pickEntity, type PickedEntity } from './interaction'
import { renderEntityList, renderDetails, searchEntities, updateSelectionToast, escapeHtml } from './ui/panel'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

app.innerHTML = `
  <div class="app-shell">
    <div class="scene-wrap">
      <header class="topbar"><span class="brand" id="hero-title"></span><span class="hint">拖拽旋转 · 滚轮缩放 · 右键平移</span></header>
      <div class="map-toolbar" aria-label="地图操作"><button type="button" id="reset-camera">重置视角</button><button type="button" id="fit-camera">适应全图</button></div>
      <div id="scene"></div><div id="label-layer"></div><div class="selection-toast" id="selection-toast">未选择对象</div>
    </div>
    <aside class="panel" aria-label="地图控制面板">
      <section><div class="section-heading"><div><p class="eyebrow">MAP CONTROL</p><h1>校园地图</h1></div><span class="status-dot">可交互</span></div><label class="search-label" for="entity-search">搜索建筑或 POI</label><input id="entity-search" type="search" placeholder="例如：图书馆、东门" autocomplete="off"><div id="search-results" class="search-results" role="status" aria-live="polite"></div></section>
      <section><div class="section-heading"><h2>图层</h2><span class="muted" id="layer-summary"></span></div><div class="layer-grid" id="layer-controls"></div></section>
      <section><h2>对象列表</h2><div id="entity-list" class="entity-list"></div></section>
      <section><h2>选中对象</h2><div id="details" class="details"></div></section>
      <section><h2>图例</h2><div class="legend"><div><span class="swatch lake"></span>水域</div><div><span class="swatch sports"></span>场地</div><div><span class="swatch academic"></span>教学建筑</div><div><span class="swatch dorm"></span>生活建筑</div><div><span class="swatch selected"></span>当前选择</div></div></section>
    </aside>
  </div>`

const $ = <T extends HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error(`UI element missing: ${sel}`); return el }
const sceneHost = $<HTMLDivElement>('#scene'), labelLayer = $<HTMLDivElement>('#label-layer'), heroTitle = $<HTMLElement>('#hero-title'), entityList = $<HTMLDivElement>('#entity-list'), details = $<HTMLDivElement>('#details'), toast = $<HTMLDivElement>('#selection-toast'), search = $<HTMLInputElement>('#entity-search'), searchResults = $<HTMLDivElement>('#search-results'), layerControls = $<HTMLDivElement>('#layer-controls'), layerSummary = $<HTMLSpanElement>('#layer-summary')
const data = createDefaultCampusData()
let selected: PickedEntity | null = data.buildings.length ? { kind: 'building', index: 0 } : null
const display: Required<Pick<SceneDisplayOptions, 'showBuildings' | 'showPaths' | 'showWater' | 'showFields' | 'showTrees' | 'showZones' | 'showPois' | 'showLabels'>> = { showBuildings: true, showPaths: true, showWater: true, showFields: true, showTrees: true, showZones: true, showPois: true, showLabels: true }
const campus = new CampusScene(sceneHost, labelLayer)
if (import.meta.env.DEV) {
  const debugWindow = window as Window & {
    __campusRenderMetrics?: () => ReturnType<CampusScene['getRenderMetrics']>
    __campusRenderBudget?: (budget: Parameters<CampusScene['evaluateRenderBudget']>[0]) => ReturnType<CampusScene['evaluateRenderBudget']>
    __campusRender?: () => void
    __campusResetMetrics?: () => void
  }
  debugWindow.__campusRenderMetrics = () => campus.getRenderMetrics()
  debugWindow.__campusRenderBudget = (budget) => campus.evaluateRenderBudget(budget)
  debugWindow.__campusRender = () => campus.render(performance.now() / 1000)
  debugWindow.__campusResetMetrics = () => campus.resetRenderMetrics()
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
  })
}
campus.controls.addEventListener('change', requestRender)
campus.setDisplayOptions({ ...display, showEditorAids: false })
campus.setDataAndSelection(data, 0)
campus.setOverviewCamera()

const layerDefs = [
  ['showBuildings', '建筑'], ['showPaths', '道路'], ['showWater', '水域'], ['showFields', '场地'], ['showTrees', '树木'], ['showZones', '分区'], ['showPois', 'POI'], ['showLabels', '标签'],
] as const
layerControls.innerHTML = layerDefs.map(([key, label]) => `<label class="toggle"><input type="checkbox" data-layer="${key}" ${display[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')

function syncUi(): void {
  heroTitle.textContent = data.name
  renderEntityList(data, selected, entityList, search.value); renderDetails(data, selected, details); updateSelectionToast(data, selected, toast)
  const active = layerDefs.filter(([key]) => display[key]).length; layerSummary.textContent = `${active}/${layerDefs.length} 开启`
}
function select(entity: PickedEntity, focus = true): void {
  if (entity.kind === 'building' && !data.buildings[entity.index]) return
  const poiIndex = entity.kind === 'poi' ? data.pois.findIndex((poi) => poi.id === entity.id) : -1
  if (entity.kind === 'poi' && poiIndex < 0) return
  selected = entity
  campus.setEditorSelection(entity.kind === 'building' ? entity : { kind: 'poi', index: poiIndex })
  if (focus) entity.kind === 'building' ? campus.focusBuilding(entity.index) : campus.focusPoi(entity.id)
  requestRender()
  syncUi()
}
syncUi()

entityList.addEventListener('click', (event) => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]'); if (!item) return; select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' }) })
search.addEventListener('input', () => { const results = searchEntities(data, search.value); searchResults.innerHTML = results.slice(0, 8).map((item) => `<button type="button" class="search-result" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)}</small></button>`).join(''); renderEntityList(data, selected, entityList, search.value) })
searchResults.addEventListener('click', (event) => { const item = (event.target as HTMLElement).closest<HTMLElement>('[data-kind]'); if (!item) return; select(item.dataset.kind === 'building' ? { kind: 'building', index: Number(item.dataset.index) } : { kind: 'poi', id: item.dataset.id ?? '' }); searchResults.innerHTML = '' })
layerControls.addEventListener('change', (event) => { const input = (event.target as HTMLInputElement).closest<HTMLInputElement>('[data-layer]'); if (!input) return; const key = input.dataset.layer as keyof typeof display; display[key] = input.checked; campus.setDisplayOptions(display); requestRender(); syncUi() })
$<HTMLButtonElement>('#reset-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
$<HTMLButtonElement>('#fit-camera').addEventListener('click', () => { campus.setOverviewCamera(); requestRender() })
campus.renderer.domElement.addEventListener('click', (event) => { const entity = pickEntity(event, campus.renderer.domElement, campus.camera, campus.clickableObjects); if (entity) select(entity) })
const onResize = () => { campus.resize(); requestRender() }; onResize(); window.addEventListener('resize', onResize)
requestRender()
