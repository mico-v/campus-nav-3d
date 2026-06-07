import './style.css'
import * as THREE from 'three'
import { createDefaultCampusData } from './data/campusData'
import { CampusScene } from './scene/CampusScene'
import { pickBuilding } from './interaction'
import { renderRouteInfo, renderEntityList, updateSelectionToast } from './ui/panel'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

app.innerHTML = `
  <div class="app-shell">
    <div class="scene-wrap">
      <header class="topbar">
        <span class="brand" id="hero-title"></span>
        <span class="hint">拖拽旋转 · 滚轮缩放 · 右键平移 · 点击建筑</span>
      </header>
      <div id="scene"></div>
      <div id="label-layer"></div>
      <div class="selection-toast" id="selection-toast">未选择对象</div>
    </div>
    <aside class="panel">
      <section>
        <h2>示例路线</h2>
        <p class="route-name" id="route-name"></p>
        <ol class="route-steps" id="route-steps"></ol>
      </section>
      <section>
        <h2>沿途地标</h2>
        <div class="chip-list" id="route-landmarks"></div>
      </section>
      <section>
        <h2>建筑信息列表</h2>
        <div id="entity-list" class="entity-list"></div>
      </section>
    </aside>
  </div>
`

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel)
  if (!el) throw new Error(`UI element missing: ${sel}`)
  return el
}

const sceneHost = $<HTMLDivElement>('#scene')
const labelLayer = $<HTMLDivElement>('#label-layer')
const heroTitle = $<HTMLElement>('#hero-title')
const entityList = $<HTMLDivElement>('#entity-list')
const selectionToast = $<HTMLDivElement>('#selection-toast')
const panelEls = {
  routeName: $<HTMLElement>('#route-name'),
  routeSteps: $<HTMLElement>('#route-steps'),
  routeLandmarks: $<HTMLElement>('#route-landmarks'),
}

const data = createDefaultCampusData()
let selectedIndex = data.buildings.length > 0 ? 0 : -1

const campus = new CampusScene(sceneHost, labelLayer)
campus.setData(data)
campus.setSelected(selectedIndex)
campus.setOverviewCamera()

function syncUi(): void {
  heroTitle.textContent = data.name
  renderRouteInfo(data, panelEls)
  renderEntityList(data, selectedIndex, entityList)
  updateSelectionToast(data, selectedIndex, selectionToast)
}

function select(index: number): void {
  if (!data.buildings[index]) return
  selectedIndex = index
  campus.setSelected(index)
  syncUi()
  campus.focusBuilding(index)
}

syncUi()

entityList.addEventListener('click', (event) => {
  const item = (event.target as HTMLElement)?.closest<HTMLElement>('[data-kind][data-index]')
  if (!item) return
  const index = Number(item.dataset.index)
  if (Number.isInteger(index)) select(index)
})

campus.renderer.domElement.addEventListener('click', (event) => {
  const index = pickBuilding(event, campus.renderer.domElement, campus.camera, campus.clickableObjects)
  if (index !== null) select(index)
})

const onResize = () => campus.resize()
onResize()
window.addEventListener('resize', onResize)

const timer = new THREE.Timer()
timer.connect(document)
const animate = (t?: number) => {
  timer.update(t)
  campus.render(timer.getElapsed())
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
