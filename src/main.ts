import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  buildingCategoryOptions,
  campusData,
  cloneCampusData,
  createDefaultCampusData,
  type Building,
  type CampusData,
  type PoiMarker,
  type Road,
} from './data/campusData'

const STORAGE_KEY = 'campus-nav-3d-map'

type Selection =
  | { kind: 'building'; index: number }
  | { kind: 'road'; index: number }
  | null

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <div class="app-shell">
    <div class="scene-wrap">
      <div class="hero-copy">
        <div>
          <p class="eyebrow">GitHub Pages 友好的静态 3D 原型</p>
          <h1 id="hero-title"></h1>
          <p class="subtitle">单一地图数据文件 + 浏览器内编辑。保留 OSM 风格道路与建筑落位、POI、路线高亮，并支持本地保存、导入导出与重置。</p>
        </div>
        <div class="hero-badges">
          <span>Three.js</span>
          <span>Vite + TypeScript</span>
          <span>场景内可选中编辑</span>
        </div>
      </div>
      <div id="scene"></div>
      <div id="label-layer"></div>
      <div class="scene-help">拖拽旋转 / 滚轮缩放 / 右键平移 / 点击建筑或道路选中</div>
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
        <h2>编辑器</h2>
        <div class="editor-toolbar">
          <button type="button" class="button button-primary" id="save-browser">保存到浏览器</button>
          <button type="button" class="button" id="reset-defaults">重置默认</button>
        </div>
        <div class="editor-toolbar compact">
          <button type="button" class="button" id="export-json">导出 JSON</button>
          <button type="button" class="button" id="import-json">导入 JSON</button>
        </div>
        <textarea id="import-export-json" class="json-box" spellcheck="false" placeholder="这里会显示导出的地图 JSON，也可以粘贴 JSON 后点击“导入 JSON”。"></textarea>
        <p class="status-line" id="editor-status">已加载默认地图数据。</p>
      </section>
      <section>
        <h2>对象列表</h2>
        <div class="entity-switch">
          <button type="button" class="segmented active" data-entity-tab="buildings">建筑</button>
          <button type="button" class="segmented" data-entity-tab="roads">道路</button>
        </div>
        <div id="entity-list" class="entity-list"></div>
      </section>
      <section>
        <h2>属性编辑</h2>
        <div id="selection-details" class="selection-details"></div>
      </section>
      <section>
        <h2>功能说明</h2>
        <ul class="feature-list">
          <li>单一数据入口：<code>src/data/campusData.ts</code></li>
          <li>支持列表选择与场景点击选择建筑/道路</li>
          <li>建筑可编辑名称、位置、尺寸、高度、分类、颜色、分区与 footprint JSON</li>
          <li>道路可编辑名称、宽度、颜色、points JSON</li>
          <li>可保存到 localStorage、导出/导入 JSON、重置到 bundled defaults</li>
        </ul>
      </section>
      <section>
        <h2>图例</h2>
        <div class="legend">
          <div><span class="swatch route"></span>导航路线</div>
          <div><span class="swatch lake"></span>景观水景</div>
          <div><span class="swatch sports"></span>运动设施</div>
          <div><span class="swatch academic"></span>教学/行政</div>
          <div><span class="swatch dorm"></span>宿舍/生活区</div>
          <div><span class="swatch selected"></span>当前选中</div>
        </div>
      </section>
    </aside>
  </div>
`

const sceneHost = document.querySelector<HTMLDivElement>('#scene')!
const labelLayer = document.querySelector<HTMLDivElement>('#label-layer')!
const heroTitle = document.querySelector<HTMLHeadingElement>('#hero-title')!
const routeName = document.querySelector<HTMLParagraphElement>('#route-name')!
const routeSteps = document.querySelector<HTMLOListElement>('#route-steps')!
const routeLandmarks = document.querySelector<HTMLDivElement>('#route-landmarks')!
const entityList = document.querySelector<HTMLDivElement>('#entity-list')!
const selectionDetails = document.querySelector<HTMLDivElement>('#selection-details')!
const statusLine = document.querySelector<HTMLParagraphElement>('#editor-status')!
const selectionToast = document.querySelector<HTMLDivElement>('#selection-toast')!
const importExportBox = document.querySelector<HTMLTextAreaElement>('#import-export-json')!
const saveBrowserButton = document.querySelector<HTMLButtonElement>('#save-browser')!
const resetDefaultsButton = document.querySelector<HTMLButtonElement>('#reset-defaults')!
const exportJsonButton = document.querySelector<HTMLButtonElement>('#export-json')!
const importJsonButton = document.querySelector<HTMLButtonElement>('#import-json')!
const segmentedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-entity-tab]'))

if (
  !sceneHost ||
  !labelLayer ||
  !heroTitle ||
  !routeName ||
  !routeSteps ||
  !routeLandmarks ||
  !entityList ||
  !selectionDetails ||
  !statusLine ||
  !selectionToast ||
  !importExportBox ||
  !saveBrowserButton ||
  !resetDefaultsButton ||
  !exportJsonButton ||
  !importJsonButton
) {
  throw new Error('UI root missing')
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
sceneHost.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#dceefc')
scene.fog = new THREE.Fog('#dceefc', 220, 420)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
camera.position.set(-120, 155, 185)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.maxPolarAngle = Math.PI / 2.08
controls.minDistance = 90
controls.maxDistance = 360
controls.target.set(5, 10, -4)

const ambient = new THREE.HemisphereLight('#ffffff', '#86a7c2', 1.6)
scene.add(ambient)

const sun = new THREE.DirectionalLight('#fff7db', 2.1)
sun.position.set(-120, 180, 80)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 500
sun.shadow.camera.left = -220
sun.shadow.camera.right = 220
sun.shadow.camera.top = 220
sun.shadow.camera.bottom = -220
scene.add(sun)

const campusGroup = new THREE.Group()
scene.add(campusGroup)

const axesShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(campusData.bounds.width + 20, campusData.bounds.depth + 20),
  new THREE.ShadowMaterial({ opacity: 0.15 }),
)
axesShadow.rotation.x = -Math.PI / 2
axesShadow.position.y = 0.01
scene.add(axesShadow)

const buildingColorByCategory: Record<string, string> = {
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

const markerGeometry = new THREE.CylinderGeometry(0.9, 0.9, 7, 12)
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const tempVector = new THREE.Vector3()
const clock = new THREE.Clock()

let currentData = loadCampusData()
let selection: Selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : null
let activeEntityTab: 'buildings' | 'roads' = 'buildings'
let clickableObjects: THREE.Object3D[] = []
let labelTargets: { marker: PoiMarker; element: HTMLDivElement }[] = []
let routeGlowMaterial: THREE.MeshBasicMaterial | null = null
let routeStart: THREE.Group | null = null
let routeEnd: THREE.Group | null = null
let routePulse: THREE.Mesh | null = null
let routeCurve: THREE.CatmullRomCurve3 | null = null

renderAll('已加载地图。')

segmentedButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextTab = button.dataset.entityTab === 'roads' ? 'roads' : 'buildings'
    activeEntityTab = nextTab
    renderEntityList()
    updateSegmentedButtons()
  })
})

saveBrowserButton.addEventListener('click', () => {
  persistCurrentData()
  setStatus('已保存到浏览器 localStorage。')
})

resetDefaultsButton.addEventListener('click', () => {
  currentData = createDefaultCampusData()
  selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : null
  activeEntityTab = 'buildings'
  persistCurrentData()
  renderAll('已重置为 bundled 默认地图。')
})

exportJsonButton.addEventListener('click', () => {
  const text = JSON.stringify(currentData, null, 2)
  importExportBox.value = text
  downloadTextFile('campus-map.json', text)
  setStatus('已导出当前地图 JSON。')
})

importJsonButton.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(importExportBox.value)
    currentData = normalizeCampusData(parsed)
    selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : currentData.roads.length > 0 ? { kind: 'road', index: 0 } : null
    activeEntityTab = currentData.buildings.length > 0 ? 'buildings' : 'roads'
    persistCurrentData()
    renderAll('已导入并替换当前浏览器内地图。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知 JSON 错误'
    setStatus(`导入失败：${message}`)
  }
})

entityList.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const item = target.closest<HTMLElement>('[data-kind][data-index]')
  if (!item) {
    return
  }

  const kind = item.dataset.kind === 'road' ? 'road' : 'building'
  const index = Number(item.dataset.index)
  if (!Number.isInteger(index)) {
    return
  }

  selection = { kind, index }
  activeEntityTab = kind === 'road' ? 'roads' : 'buildings'
  renderAll(`${kind === 'road' ? '已选中道路' : '已选中建筑'}。`)
})

selectionDetails.addEventListener('change', (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return
  }

  if (!selection) {
    return
  }

  const field = target.name
  const value = target.value

  try {
    if (selection.kind === 'building') {
      updateBuildingField(selection.index, field, value)
      persistCurrentData()
      renderAll('建筑修改已应用。')
    } else {
      updateRoadField(selection.index, field, value)
      persistCurrentData()
      renderAll('道路修改已应用。')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败'
    setStatus(message)
    renderSelectionEditor()
  }
})

renderer.domElement.addEventListener('click', (event) => {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects(clickableObjects, true)
  const hit = intersections.find((candidate) => {
    const data = candidate.object.userData as { kind?: string; index?: number }
    return typeof data.kind === 'string' && typeof data.index === 'number'
  })

  if (!hit) {
    return
  }

  const data = hit.object.userData as { kind: 'building' | 'road'; index: number }
  selection = { kind: data.kind, index: data.index }
  activeEntityTab = data.kind === 'road' ? 'roads' : 'buildings'
  renderAll(`${data.kind === 'road' ? '已从场景中选中道路' : '已从场景中选中建筑'}。`)
})

const resize = () => {
  const width = sceneHost.clientWidth
  const height = sceneHost.clientHeight
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

resize()
window.addEventListener('resize', resize)

const animate = () => {
  const elapsed = clock.getElapsedTime()
  controls.update()

  if (routeGlowMaterial) {
    routeGlowMaterial.opacity = 0.14 + Math.sin(elapsed * 2.2) * 0.06
  }

  if (routeStart) {
    routeStart.rotation.y = elapsed * 1.2
  }

  if (routeEnd) {
    routeEnd.rotation.y = -elapsed * 1.2
  }

  if (routeCurve && routePulse) {
    const progress = (elapsed * 0.08) % 1
    const pulsePoint = routeCurve.getPointAt(progress)
    routePulse.position.copy(pulsePoint)
    routePulse.scale.setScalar(0.8 + (Math.sin(elapsed * 5.5) + 1) * 0.12)
  }

  renderer.render(scene, camera)
  updateLabels()
  requestAnimationFrame(animate)
}

animate()

function renderAll(statusMessage?: string) {
  ensureSelectionInBounds()
  heroTitle.textContent = currentData.name
  renderRouteInfo()
  renderEntityList()
  renderSelectionEditor()
  updateSegmentedButtons()
  renderScene()
  updateSelectionToast()
  if (statusMessage) {
    setStatus(statusMessage)
  }
}

function renderRouteInfo() {
  const activeRoute = currentData.routes[0]
  if (!activeRoute) {
    routeName.textContent = '无路线数据'
    routeSteps.innerHTML = ''
    routeLandmarks.innerHTML = '<span class="chip">无</span>'
    return
  }

  routeName.textContent = activeRoute.name
  routeSteps.innerHTML = activeRoute.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')
  routeLandmarks.innerHTML = activeRoute.landmarks.map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join('')
}

function renderEntityList() {
  if (activeEntityTab === 'buildings') {
    entityList.innerHTML = currentData.buildings
      .map((building, index) => {
        const selected = selection?.kind === 'building' && selection.index === index
        return `
          <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="building" data-index="${index}">
            <span>
              <strong>${escapeHtml(building.name || building.id || `建筑 ${index + 1}`)}</strong>
              <small>${escapeHtml(building.id)} · ${escapeHtml(building.category)}</small>
            </span>
            <span class="pill">${index + 1}</span>
          </button>
        `
      })
      .join('')
    return
  }

  entityList.innerHTML = currentData.roads
    .map((road, index) => {
      const selected = selection?.kind === 'road' && selection.index === index
      return `
        <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="road" data-index="${index}">
          <span>
            <strong>${escapeHtml(road.id || `道路 ${index + 1}`)}</strong>
            <small>${road.points.length} 点 · 宽度 ${road.width}</small>
          </span>
          <span class="pill">${index + 1}</span>
        </button>
      `
    })
    .join('')
}

function renderSelectionEditor() {
  if (!selection) {
    selectionDetails.innerHTML = '<p class="empty-state">请选择一个建筑或道路。</p>'
    return
  }

  if (selection.kind === 'building') {
    const building = currentData.buildings[selection.index]
    if (!building) {
      selectionDetails.innerHTML = '<p class="empty-state">当前建筑不存在。</p>'
      return
    }

    selectionDetails.innerHTML = `
      <div class="editor-grid">
        <label>
          <span>名称</span>
          <input name="name" value="${escapeAttribute(building.name)}" />
        </label>
        <label>
          <span>ID（只读）</span>
          <input value="${escapeAttribute(building.id)}" disabled />
        </label>
        <label>
          <span>X</span>
          <input type="number" step="0.1" name="positionX" value="${building.position[0]}" />
        </label>
        <label>
          <span>Z</span>
          <input type="number" step="0.1" name="positionZ" value="${building.position[1]}" />
        </label>
        <label>
          <span>宽度</span>
          <input type="number" step="0.1" min="0.1" name="sizeWidth" value="${building.size[0]}" />
        </label>
        <label>
          <span>进深</span>
          <input type="number" step="0.1" min="0.1" name="sizeDepth" value="${building.size[1]}" />
        </label>
        <label>
          <span>高度</span>
          <input type="number" step="0.1" min="0.1" name="height" value="${building.height}" />
        </label>
        <label>
          <span>颜色</span>
          <input name="color" value="${escapeAttribute(building.color ?? '')}" placeholder="#93c5fd" />
        </label>
        <label>
          <span>分类</span>
          <select name="category">
            ${buildingCategoryOptions
              .map((category) => `<option value="${category}"${building.category === category ? ' selected' : ''}>${category}</option>`)
              .join('')}
          </select>
        </label>
        <label>
          <span>分区</span>
          <select name="zoneId">
            ${currentData.zones
              .map((zone) => `<option value="${zone.id}"${building.zoneId === zone.id ? ' selected' : ''}>${escapeHtml(zone.name)}</option>`)
              .join('')}
          </select>
        </label>
      </div>
      <label class="stacked-label">
        <span>Footprint JSON（可选）</span>
        <textarea name="footprint">${escapeTextarea(JSON.stringify(building.footprint ?? [], null, 2))}</textarea>
      </label>
      <p class="field-hint">footprint 留空或 [] 时将使用规则体块；填写 [[x,z], ...] 可恢复不规则轮廓。</p>
    `
    return
  }

  const road = currentData.roads[selection.index]
  if (!road) {
    selectionDetails.innerHTML = '<p class="empty-state">当前道路不存在。</p>'
    return
  }

  selectionDetails.innerHTML = `
    <div class="editor-grid">
      <label>
        <span>名称 / ID</span>
        <input name="id" value="${escapeAttribute(road.id)}" />
      </label>
      <label>
        <span>宽度</span>
        <input type="number" step="0.1" min="0.1" name="width" value="${road.width}" />
      </label>
      <label class="full-width">
        <span>颜色</span>
        <input name="color" value="${escapeAttribute(road.color ?? '')}" placeholder="#9ca3af" />
      </label>
    </div>
    <label class="stacked-label">
      <span>Points JSON</span>
      <textarea name="points">${escapeTextarea(JSON.stringify(road.points, null, 2))}</textarea>
    </label>
    <p class="field-hint">points 需为 [[x,z], ...]，至少 2 个点。</p>
  `
}

function renderScene() {
  disposeChildren(campusGroup)
  labelLayer.innerHTML = ''
  clickableObjects = []
  labelTargets = []
  routeGlowMaterial = null
  routeStart = null
  routeEnd = null
  routePulse = null
  routeCurve = null

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(currentData.bounds.width, currentData.bounds.depth),
    new THREE.MeshStandardMaterial({ color: '#c8ddb0', roughness: 0.98, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  campusGroup.add(ground)

  for (const zone of currentData.zones) {
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.size[0], zone.size[1]),
      new THREE.MeshStandardMaterial({
        color: zone.color,
        transparent: true,
        opacity: 0.92,
        roughness: 1,
        metalness: 0,
      }),
    )
    tile.rotation.x = -Math.PI / 2
    tile.position.set(zone.center[0], 0.06, zone.center[1])
    campusGroup.add(tile)
  }

  currentData.roads.forEach((road, index) => {
    if (road.points.length < 2) {
      return
    }

    const shape = buildRoadShape(road.points, road.width)
    const selected = selection?.kind === 'road' && selection.index === index
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: selected ? '#f97316' : road.color ?? '#9ca3af',
        roughness: 0.95,
        metalness: 0,
        emissive: selected ? '#f59e0b' : '#000000',
        emissiveIntensity: selected ? 0.22 : 0,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = selected ? 0.16 : 0.12
    mesh.receiveShadow = true
    mesh.userData = { kind: 'road', index }
    clickableObjects.push(mesh)
    campusGroup.add(mesh)
  })

  for (const water of currentData.waters) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshStandardMaterial({ color: water.color ?? '#60a5fa', transparent: true, opacity: 0.88, roughness: 0.18, metalness: 0.1 }),
    )
    mesh.scale.set(water.size[0] / 2, water.size[1] / 2, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(water.center[0], 0.18, water.center[1])
    campusGroup.add(mesh)
  }

  for (const field of currentData.fields) {
    const fieldGroup = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(field.size[0], field.size[1]),
      new THREE.MeshStandardMaterial({ color: field.color ?? '#22c55e', roughness: 1 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = 0.14
    fieldGroup.add(base)

    for (let i = -2; i <= 2; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(field.size[0], field.size[1] / 8),
        new THREE.MeshStandardMaterial({ color: field.stripeColor ?? '#86efac', transparent: true, opacity: 0.85 }),
      )
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.15, i * (field.size[1] / 5.4))
      fieldGroup.add(stripe)
    }

    const track = new THREE.Mesh(
      new THREE.RingGeometry(field.size[0] / 2 + 2, field.size[0] / 2 + 7, 48),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.9 }),
    )
    track.scale.set(1, field.size[1] / field.size[0], 1)
    track.rotation.x = -Math.PI / 2
    track.position.y = 0.13
    fieldGroup.add(track)

    fieldGroup.position.set(field.center[0], 0, field.center[1])
    campusGroup.add(fieldGroup)
  }

  currentData.buildings.forEach((building, index) => {
    const selected = selection?.kind === 'building' && selection.index === index
    const mesh = createBuildingMesh(building, selected)
    mesh.userData = { kind: 'building', index }
    mesh.traverse((child) => {
      child.userData = { kind: 'building', index }
      if (child instanceof THREE.Mesh) {
        clickableObjects.push(child)
      }
    })
    campusGroup.add(mesh)
  })

  for (const [x, z] of currentData.trees) {
    const tree = createTree()
    tree.position.set(x, 0, z)
    campusGroup.add(tree)
  }

  for (const poi of resolvePois(currentData)) {
    const marker = new THREE.Mesh(
      markerGeometry,
      new THREE.MeshStandardMaterial({ color: poi.color ?? '#ffffff', emissive: poi.color ?? '#ffffff', emissiveIntensity: 0.25 }),
    )
    marker.position.set(poi.position[0], poi.position[1] - 3.2, poi.position[2])
    marker.castShadow = true
    campusGroup.add(marker)

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 20, 20),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: poi.color ?? '#ffffff', emissiveIntensity: 0.55 }),
    )
    cap.position.copy(new THREE.Vector3(...poi.position))
    campusGroup.add(cap)

    const element = document.createElement('div')
    element.className = `map-label ${poi.kind}`
    element.textContent = poi.name
    labelLayer.appendChild(element)
    labelTargets.push({ marker: poi, element })
  }

  const activeRoute = currentData.routes[0]
  if (activeRoute && activeRoute.points.length >= 2) {
    routeCurve = new THREE.CatmullRomCurve3(activeRoute.points.map((point) => new THREE.Vector3(...point)))
    const routeGeometry = new THREE.TubeGeometry(routeCurve, 220, 1.55, 20, false)
    const routeMesh = new THREE.Mesh(
      routeGeometry,
      new THREE.MeshStandardMaterial({ color: '#ff4fa3', emissive: '#ff6ab7', emissiveIntensity: 1.25, transparent: true, opacity: 0.98 }),
    )
    routeMesh.castShadow = false
    campusGroup.add(routeMesh)

    routeGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ff9dce', transparent: true, opacity: 0.2 })
    const routeGlow = new THREE.Mesh(new THREE.TubeGeometry(routeCurve, 220, 3.1, 20, false), routeGlowMaterial)
    campusGroup.add(routeGlow)

    for (const point of activeRoute.points.slice(1, -1)) {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 14, 14),
        new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      )
      node.position.set(point[0], point[1], point[2])
      campusGroup.add(node)
    }

    routePulse = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 24, 24),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff4fa3', emissiveIntensity: 1.4, transparent: true, opacity: 0.95 }),
    )
    campusGroup.add(routePulse)

    routeStart = createRouteBeacon('#f97316')
    routeStart.position.set(...activeRoute.points[0])
    routeStart.position.y = 6
    campusGroup.add(routeStart)

    routeEnd = createRouteBeacon('#fde047')
    routeEnd.position.set(...activeRoute.points[activeRoute.points.length - 1])
    routeEnd.position.y = 6
    campusGroup.add(routeEnd)
  }
}

function createBuildingMesh(building: Building, selected = false) {
  const group = new THREE.Group()
  const color = selected ? '#fb7185' : building.color ?? buildingColorByCategory[building.category] ?? '#cbd5e1'
  const baseHeight = building.height

  if (building.footprint && building.footprint.length >= 3) {
    const shape = new THREE.Shape(
      building.footprint.map(([x, z]) => new THREE.Vector2(x - building.position[0], z - building.position[1])),
    )

    const bodyGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: baseHeight,
      bevelEnabled: false,
    })
    bodyGeometry.rotateX(-Math.PI / 2)

    const body = new THREE.Mesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.76,
        metalness: 0.06,
        emissive: selected ? '#fb7185' : '#000000',
        emissiveIntensity: selected ? 0.18 : 0,
      }),
    )
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    const roof = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: selected ? '#fff1f2' : '#f8fafc', roughness: 0.88, transparent: true, opacity: 0.92 }),
    )
    roof.rotation.x = -Math.PI / 2
    roof.position.y = baseHeight + 0.06
    group.add(roof)
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0], baseHeight, building.size[1]),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.08,
        emissive: selected ? '#fb7185' : '#000000',
        emissiveIntensity: selected ? 0.2 : 0,
      }),
    )
    body.position.y = baseHeight / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    if (baseHeight > 8) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(building.size[0] * 0.82, Math.max(1.2, baseHeight * 0.06), building.size[1] * 0.82),
        new THREE.MeshStandardMaterial({ color: selected ? '#fff1f2' : '#f8fafc', roughness: 0.85 }),
      )
      roof.position.y = baseHeight + 0.8
      roof.castShadow = true
      group.add(roof)
    }
  }

  if (building.category === 'library') {
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0] * 0.22, baseHeight * 1.15, building.size[1] * 0.25),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 }),
    )
    accent.position.set(0, baseHeight * 0.58, 0)
    group.add(accent)
  }

  group.position.set(building.position[0], 0, building.position[1])
  return group
}

function createTree() {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.9, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1 }),
  )
  trunk.position.y = 2.2
  group.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 14, 14),
    new THREE.MeshStandardMaterial({ color: '#3f9c58', roughness: 1 }),
  )
  crown.position.y = 5.4
  group.add(crown)
  return group
}

function createRouteBeacon(color: string) {
  const group = new THREE.Group()
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.5, 12, 40),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }),
  )
  ring.rotation.x = Math.PI / 2
  group.add(ring)

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.75 }),
  )
  orb.position.y = 1.2
  group.add(orb)
  return group
}

function buildRoadShape(points: [number, number][], width: number) {
  const leftPoints: THREE.Vector2[] = []
  const rightPoints: THREE.Vector2[] = []

  for (let index = 0; index < points.length; index += 1) {
    const prev = points[Math.max(index - 1, 0)]
    const current = points[index]
    const next = points[Math.min(index + 1, points.length - 1)]

    const dirPrev = new THREE.Vector2(current[0] - prev[0], current[1] - prev[1]).normalize()
    const dirNext = new THREE.Vector2(next[0] - current[0], next[1] - current[1]).normalize()
    const dir = dirPrev.add(dirNext).normalize()

    const fallback = new THREE.Vector2(next[0] - prev[0], next[1] - prev[1]).normalize()
    const tangent = Number.isFinite(dir.x) && Number.isFinite(dir.y) && dir.lengthSq() > 0 ? dir : fallback
    const normal = new THREE.Vector2(-tangent.y, tangent.x).normalize().multiplyScalar(width / 2)

    leftPoints.push(new THREE.Vector2(current[0] + normal.x, current[1] + normal.y))
    rightPoints.unshift(new THREE.Vector2(current[0] - normal.x, current[1] - normal.y))
  }

  const outline = [...leftPoints, ...rightPoints]
  const shape = new THREE.Shape(outline)
  shape.autoClose = true
  return shape
}

function updateLabels() {
  const width = sceneHost.clientWidth
  const height = sceneHost.clientHeight
  for (const target of labelTargets) {
    tempVector.set(...target.marker.position).project(camera)
    const visible = tempVector.z < 1 && tempVector.z > -1
    const left = ((tempVector.x + 1) / 2) * width
    const top = ((-tempVector.y + 1) / 2) * height
    const inside = left >= -80 && left <= width + 80 && top >= -30 && top <= height + 30
    target.element.style.opacity = visible && inside ? '1' : '0'
    target.element.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`
  }
}

function updateBuildingField(index: number, field: string, value: string) {
  const building = currentData.buildings[index]
  if (!building) {
    throw new Error('建筑不存在。')
  }

  switch (field) {
    case 'name':
      building.name = value
      syncPoiWithBuilding(building)
      return
    case 'positionX':
      building.position[0] = parseNumber(value, '建筑 X')
      syncPoiWithBuilding(building)
      return
    case 'positionZ':
      building.position[1] = parseNumber(value, '建筑 Z')
      syncPoiWithBuilding(building)
      return
    case 'sizeWidth':
      building.size[0] = parsePositiveNumber(value, '建筑宽度')
      return
    case 'sizeDepth':
      building.size[1] = parsePositiveNumber(value, '建筑进深')
      return
    case 'height':
      building.height = parsePositiveNumber(value, '建筑高度')
      syncPoiWithBuilding(building)
      return
    case 'color':
      building.color = value.trim() || undefined
      syncPoiWithBuilding(building)
      return
    case 'category':
      building.category = value as Building['category']
      return
    case 'zoneId':
      building.zoneId = value
      return
    case 'footprint':
      building.footprint = parseOptionalPointArray(value, '建筑 footprint')
      return
    default:
      throw new Error(`未知建筑字段：${field}`)
  }
}

function updateRoadField(index: number, field: string, value: string) {
  const road = currentData.roads[index]
  if (!road) {
    throw new Error('道路不存在。')
  }

  switch (field) {
    case 'id':
      road.id = value
      return
    case 'width':
      road.width = parsePositiveNumber(value, '道路宽度')
      return
    case 'color':
      road.color = value.trim() || undefined
      return
    case 'points':
      road.points = parseRequiredPointArray(value, '道路 points', 2)
      return
    default:
      throw new Error(`未知道路字段：${field}`)
  }
}

function syncPoiWithBuilding(building: Building) {
  currentData.pois.forEach((poi) => {
    if (poi.sourceBuildingId !== building.id) {
      return
    }
    poi.name = building.name
    poi.position = [building.position[0], building.height + 2, building.position[1]]
    if (building.color) {
      poi.color = building.color
    }
  })
}

function resolvePois(data: CampusData) {
  const buildingMap = new Map(data.buildings.map((building) => [building.id, building]))
  return data.pois.map((poi) => {
    if (!poi.sourceBuildingId) {
      return poi
    }
    const building = buildingMap.get(poi.sourceBuildingId)
    if (!building) {
      return poi
    }
    return {
      ...poi,
      name: building.name,
      color: poi.color ?? building.color,
      position: [building.position[0], building.height + 2, building.position[1]] as [number, number, number],
    }
  })
}

function ensureSelectionInBounds() {
  if (!selection) {
    return
  }

  if (selection.kind === 'building' && !currentData.buildings[selection.index]) {
    selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : currentData.roads.length > 0 ? { kind: 'road', index: 0 } : null
  }

  if (selection?.kind === 'road' && !currentData.roads[selection.index]) {
    selection = currentData.roads.length > 0 ? { kind: 'road', index: 0 } : currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : null
  }
}

function updateSelectionToast() {
  if (!selection) {
    selectionToast.textContent = '未选择对象'
    return
  }

  if (selection.kind === 'building') {
    const building = currentData.buildings[selection.index]
    selectionToast.textContent = building ? `已选中建筑：${building.name}` : '未选择对象'
    return
  }

  const road = currentData.roads[selection.index]
  selectionToast.textContent = road ? `已选中道路：${road.id}` : '未选择对象'
}

function persistCurrentData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData))
}

function loadCampusData(): CampusData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return cloneCampusData(campusData)
  }

  try {
    return normalizeCampusData(JSON.parse(stored))
  } catch {
    return cloneCampusData(campusData)
  }
}

function normalizeCampusData(input: unknown): CampusData {
  if (!input || typeof input !== 'object') {
    throw new Error('地图 JSON 不是对象。')
  }

  const source = input as Partial<CampusData>
  if (!Array.isArray(source.buildings) || !Array.isArray(source.roads)) {
    throw new Error('地图 JSON 缺少 buildings 或 roads。')
  }

  const defaults = createDefaultCampusData()
  return {
    name: typeof source.name === 'string' ? source.name : defaults.name,
    bounds: source.bounds && typeof source.bounds.width === 'number' && typeof source.bounds.depth === 'number'
      ? { width: source.bounds.width, depth: source.bounds.depth }
      : defaults.bounds,
    zones: Array.isArray(source.zones) ? cloneCampusData({ ...defaults, zones: source.zones }).zones : defaults.zones,
    buildings: source.buildings.map((building, index) => normalizeBuilding(building, defaults.buildings[index] ?? defaults.buildings[0])),
    roads: source.roads.map((road, index) => normalizeRoad(road, defaults.roads[index] ?? defaults.roads[0])),
    waters: Array.isArray(source.waters) ? cloneCampusData({ ...defaults, waters: source.waters }).waters : defaults.waters,
    fields: Array.isArray(source.fields) ? cloneCampusData({ ...defaults, fields: source.fields }).fields : defaults.fields,
    trees: Array.isArray(source.trees) ? source.trees.map((point) => normalizePointPair(point, 'tree')) : defaults.trees,
    pois: Array.isArray(source.pois) ? source.pois.map((poi) => normalizePoi(poi)) : defaults.pois,
    routes: Array.isArray(source.routes) ? source.routes.map((route) => normalizeRoute(route)) : defaults.routes,
  }
}

function normalizeBuilding(input: unknown, fallback?: Building): Building {
  if (!input || typeof input !== 'object') {
    if (fallback) {
      return cloneCampusData({ ...createDefaultCampusData(), buildings: [fallback] }).buildings[0]
    }
    throw new Error('建筑条目无效。')
  }

  const source = input as Partial<Building>
  const base = fallback ?? createDefaultCampusData().buildings[0]
  return {
    id: typeof source.id === 'string' ? source.id : base.id,
    name: typeof source.name === 'string' ? source.name : base.name,
    category: typeof source.category === 'string' ? source.category as Building['category'] : base.category,
    position: normalizePointPair(source.position, 'building.position'),
    size: normalizePointPair(source.size, 'building.size'),
    height: typeof source.height === 'number' ? source.height : base.height,
    color: typeof source.color === 'string' ? source.color : undefined,
    zoneId: typeof source.zoneId === 'string' ? source.zoneId : base.zoneId,
    footprint: Array.isArray(source.footprint) ? source.footprint.map((point) => normalizePointPair(point, 'building.footprint')) : undefined,
  }
}

function normalizeRoad(input: unknown, fallback?: Road): Road {
  if (!input || typeof input !== 'object') {
    if (fallback) {
      return { ...fallback, points: fallback.points.map((point) => [...point] as [number, number]) }
    }
    throw new Error('道路条目无效。')
  }

  const source = input as Partial<Road>
  const base = fallback ?? createDefaultCampusData().roads[0]
  return {
    id: typeof source.id === 'string' ? source.id : base.id,
    width: typeof source.width === 'number' ? source.width : base.width,
    color: typeof source.color === 'string' ? source.color : undefined,
    points: Array.isArray(source.points) ? source.points.map((point) => normalizePointPair(point, 'road.points')) : base.points,
  }
}

function normalizePoi(input: unknown): PoiMarker {
  if (!input || typeof input !== 'object') {
    throw new Error('POI 条目无效。')
  }

  const source = input as Partial<PoiMarker>
  if (typeof source.id !== 'string' || typeof source.name !== 'string' || !Array.isArray(source.position)) {
    throw new Error('POI 缺少必要字段。')
  }

  return {
    id: source.id,
    name: source.name,
    kind: source.kind === 'service' || source.kind === 'gate' ? source.kind : 'landmark',
    position: normalizePointTriple(source.position, 'poi.position'),
    color: typeof source.color === 'string' ? source.color : undefined,
    sourceBuildingId: typeof source.sourceBuildingId === 'string' ? source.sourceBuildingId : undefined,
  }
}

function normalizeRoute(input: unknown) {
  if (!input || typeof input !== 'object') {
    throw new Error('路线条目无效。')
  }
  const source = input as CampusData['routes'][number]
  return {
    id: typeof source.id === 'string' ? source.id : 'route',
    name: typeof source.name === 'string' ? source.name : '路线',
    points: Array.isArray(source.points) ? source.points.map((point) => normalizePointTriple(point, 'route.points')) : [],
    steps: Array.isArray(source.steps) ? source.steps.filter((step): step is string => typeof step === 'string') : [],
    landmarks: Array.isArray(source.landmarks) ? source.landmarks.filter((item): item is string => typeof item === 'string') : [],
  }
}

function normalizePointPair(value: unknown, label: string): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`${label} 需要两个数字。`)
  }
  const [x, z] = value
  if (typeof x !== 'number' || typeof z !== 'number') {
    throw new Error(`${label} 需要数字。`)
  }
  return [x, z]
}

function normalizePointTriple(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    throw new Error(`${label} 需要三个数字。`)
  }
  const [x, y, z] = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    throw new Error(`${label} 需要数字。`)
  }
  return [x, y, z]
}

function parseNumber(value: string, label: string) {
  const result = Number(value)
  if (!Number.isFinite(result)) {
    throw new Error(`${label} 不是有效数字。`)
  }
  return result
}

function parsePositiveNumber(value: string, label: string) {
  const result = parseNumber(value, label)
  if (result <= 0) {
    throw new Error(`${label} 需要大于 0。`)
  }
  return result
}

function parseOptionalPointArray(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return undefined
  }
  return parsed.map((point) => normalizePointPair(point, label))
}

function parseRequiredPointArray(value: string, label: string, minimum: number) {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed) || parsed.length < minimum) {
    throw new Error(`${label} 至少需要 ${minimum} 个点。`)
  }
  return parsed.map((point) => normalizePointPair(point, label))
}

function disposeChildren(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0]
    group.remove(child)
    disposeObject(child)
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose()
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => material.dispose())
      } else {
        node.material.dispose()
      }
    }
  })
}

function setStatus(message: string) {
  statusLine.textContent = message
}

function updateSegmentedButtons() {
  segmentedButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.entityTab === activeEntityTab)
  })
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
}

function escapeTextarea(value: string) {
  return escapeHtml(value)
}
