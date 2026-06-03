import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  createDefaultCampusData,
  type Building,
  type CampusData,
  type PoiMarker,
  type RouteDefinition,
} from './data/campusData'

type Selection =
  | { kind: 'building'; index: number }
  | null

type AnchorSource = 'footprint' | 'position'

type BuildingAnchor = {
  x: number
  z: number
  source: AnchorSource
}

type RoadAnchorPair = {
  source: [number, number]
  anchor: [number, number]
}

type WorldAlign = {
  scale: number
  rotation: number
  translateX: number
  translateZ: number
}

type RoadAlignmentState = {
  pairs: RoadAnchorPair[]
  transform: WorldAlign
}

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
          <p class="subtitle">以 graph 地点位置为基准，叠加 OpenStreetMap 可确认建筑轮廓，支持从建筑列表快速定位。</p>
        </div>
        <div class="hero-badges">
          <span>Three.js</span>
          <span>Vite + TypeScript</span>
          <span>建筑快速定位</span>
        </div>
      </div>
      <div id="scene"></div>
      <div id="label-layer"></div>
      <div class="scene-help">拖拽旋转 / 滚轮缩放 / 右键平移 / 点击建筑选中</div>
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

const sceneHost = document.querySelector<HTMLDivElement>('#scene')!
const labelLayer = document.querySelector<HTMLDivElement>('#label-layer')!
const heroTitle = document.querySelector<HTMLHeadingElement>('#hero-title')!
const routeName = document.querySelector<HTMLParagraphElement>('#route-name')!
const routeSteps = document.querySelector<HTMLOListElement>('#route-steps')!
const routeLandmarks = document.querySelector<HTMLDivElement>('#route-landmarks')!
const entityList = document.querySelector<HTMLDivElement>('#entity-list')!
const selectionToast = document.querySelector<HTMLDivElement>('#selection-toast')!

if (
  !sceneHost ||
  !labelLayer ||
  !heroTitle ||
  !routeName ||
  !routeSteps ||
  !routeLandmarks ||
  !entityList ||
  !selectionToast
) {
  throw new Error('UI root missing')
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
sceneHost.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#dceefc')

const camera = new THREE.PerspectiveCamera(45, 1, 5, 5000)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.maxPolarAngle = Math.PI / 2.08
controls.minDistance = 35
controls.maxDistance = 4200

const ambient = new THREE.HemisphereLight('#ffffff', '#86a7c2', 1.6)
scene.add(ambient)

const sun = new THREE.DirectionalLight('#fff7db', 2.1)
sun.position.set(-120, 180, 80)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 4000
sun.shadow.camera.left = -1400
sun.shadow.camera.right = 1400
sun.shadow.camera.top = 1400
sun.shadow.camera.bottom = -1400
scene.add(sun)

const campusGroup = new THREE.Group()
scene.add(campusGroup)

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
const FOOTPRINT_EPSILON = 1e-6
const FOOTPRINT_MIN_AREA = 1e-8
const ROAD_WIDTH_DEFAULT = 3.2
const ROAD_ALIGNMENT_RADIUS = 150
const ROAD_ANCHOR_SIGNIFICANCE = 1
const ROAD_ALIGNMENT_MIN_INLIERS = 3
const ROAD_ALIGNMENT_OUTLIER_ITERS = 2
const ROAD_ALIGNMENT_RESIDUAL_MAD_MULTIPLIER = 2.5
const ROAD_ALIGNMENT_MIN_RESIDUAL_CUTOFF = 0.7
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const tempVector = new THREE.Vector3()
const timer = new THREE.Timer()
timer.connect(document)

let currentData = createDefaultCampusData()
let selection: Selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : null
let clickableObjects: THREE.Object3D[] = []
let labelTargets: { marker: PoiMarker; element: HTMLDivElement }[] = []
let routeGlowMaterial: THREE.MeshBasicMaterial | null = null
let routeStart: THREE.Group | null = null
let routeEnd: THREE.Group | null = null
let routePulse: THREE.Mesh | null = null
let routeCurve: THREE.CatmullRomCurve3 | null = null
let routePulsePoints: THREE.Vector3[] = []
let didInitializeCamera = false
let currentRoadAlignment: RoadAlignmentState | null = null
const defaultAlignment: WorldAlign = { scale: 1, rotation: 0, translateX: 0, translateZ: 0 }

currentRoadAlignment = buildRoadAlignmentState(currentData)
setOverviewCamera(currentRoadAlignment)
renderAll()

function getActiveRoadAlignment(): RoadAlignmentState {
  return currentRoadAlignment ?? { pairs: [], transform: defaultAlignment }
}

function resolveWorldPoint(x: number, z: number, roadAlignment: RoadAlignmentState): [number, number] {
  const aligned = applyWorldAlign([x, z], roadAlignment.transform)
  return aligned
}

entityList.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const item = target.closest<HTMLElement>('[data-kind][data-index]')
  if (!item) {
    return
  }

  const index = Number(item.dataset.index)
  if (!Number.isInteger(index)) {
    return
  }

  selection = { kind: 'building', index }
  renderAll()
  focusBuilding(index)
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

  const data = hit.object.userData as { kind: 'building'; index: number }
  selection = { kind: data.kind, index: data.index }
  renderAll()
  focusBuilding(data.index)
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

const animate = (timestamp?: number) => {
  timer.update(timestamp)
  const elapsed = timer.getElapsed()
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
    const progress = Math.min((elapsed * 0.08) % 1, 0.999)
    const pulsePoint = samplePolylinePoint(routePulsePoints, progress)
    routePulse.position.copy(pulsePoint)
    routePulse.scale.setScalar(0.8 + (Math.sin(elapsed * 5.5) + 1) * 0.12)
  }

  renderer.render(scene, camera)
  updateLabels()
  requestAnimationFrame(animate)
}

requestAnimationFrame(animate)

function renderAll() {
  const roadAlignment = buildRoadAlignmentState(currentData)
  currentRoadAlignment = roadAlignment
  if (!didInitializeCamera) {
    setOverviewCamera(roadAlignment)
    didInitializeCamera = true
  }
  ensureSelectionInBounds()
  heroTitle.textContent = currentData.name
  renderRouteInfo()
  renderEntityList()
  renderScene(roadAlignment)
  updateSelectionToast()
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
  entityList.innerHTML = currentData.buildings
    .map((building, index) => {
      const selected = selection?.kind === 'building' && selection.index === index
      const anchor = resolveBuildingRenderAnchor(building, getActiveRoadAlignment())
      const zoneName = currentData.zones.find((zone) => zone.id === building.zoneId)?.name ?? building.zoneId
      return `
        <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="building" data-index="${index}">
          <span>
            <strong>${escapeHtml(building.name || building.id || `建筑 ${index + 1}`)}</strong>
            <small>${escapeHtml(building.category)} · ${escapeHtml(zoneName)}</small>
            <small>X ${formatCoordinate(anchor.x)} / Z ${formatCoordinate(anchor.z)} · 高 ${formatCoordinate(building.height)}</small>
          </span>
          <span class="pill">${index + 1}</span>
        </button>
      `
    })
    .join('')
}

function focusBuilding(index: number) {
  const building = currentData.buildings[index]
  if (!building) {
    return
  }

  const anchor = resolveBuildingRenderAnchor(building, getActiveRoadAlignment())

  const target = new THREE.Vector3(
    anchor.x,
    Math.max(8, building.height * 0.55),
    anchor.z,
  )
  const footprintSize = Math.max(building.size[0], building.size[1])
  const distance = Math.max(110, footprintSize * 4.5)

  controls.target.copy(target)
  camera.position.set(target.x - distance * 0.7, target.y + distance * 0.8, target.z + distance)
  camera.updateProjectionMatrix()
  controls.update()
}

function setOverviewCamera(roadAlignment: RoadAlignmentState) {
  const bounds = computeMapBounds(currentData, 160, roadAlignment)
  const maxDimension = Math.max(bounds.width, bounds.depth)
  const target = new THREE.Vector3(bounds.center[0], 0, bounds.center[1])

  controls.target.copy(target)
  camera.position.set(
    target.x - maxDimension * 0.72,
    maxDimension * 0.42,
    target.z + maxDimension * 0.68,
  )
  camera.near = 5
  camera.far = Math.max(5000, maxDimension * 4)
  camera.updateProjectionMatrix()
  controls.update()
}

function computeMapBounds(data: CampusData, padding = 0, roadAlignment: RoadAlignmentState) {
  const xs: number[] = []
  const zs: number[] = []
  const alignmentScale = Math.abs(roadAlignment.transform.scale)

  data.buildings.forEach((building) => {
    const anchor = resolveBuildingRenderAnchor(building, roadAlignment)
    xs.push(anchor.x)
    zs.push(anchor.z)
    getRenderedBuildingFootprint(building, roadAlignment)?.forEach(([x, z]) => {
      xs.push(x)
      zs.push(z)
    })
  })

  data.roads.forEach((road) => {
    road.points.forEach((point) => {
      const snapped = resolveRoadPoint(point, roadAlignment)
      xs.push(snapped[0])
      zs.push(snapped[1])
    })
  })

  data.routes.forEach((route) => {
    resolveRoutePoints(route, roadAlignment).forEach(([x, z]) => {
      xs.push(x)
      zs.push(z)
    })
  })

  data.zones.forEach((zone) => {
    const [centerX, centerZ] = resolveWorldPoint(zone.center[0], zone.center[1], roadAlignment)
    const halfWidth = (zone.size[0] * alignmentScale) / 2
    const halfDepth = (zone.size[1] * alignmentScale) / 2
    xs.push(centerX - halfWidth, centerX + halfWidth)
    zs.push(centerZ - halfDepth, centerZ + halfDepth)
  })

  data.waters.forEach((water) => {
    const [centerX, centerZ] = resolveWorldPoint(water.center[0], water.center[1], roadAlignment)
    const halfWidth = (water.size[0] * alignmentScale) / 2
    const halfDepth = (water.size[1] * alignmentScale) / 2
    xs.push(centerX - halfWidth, centerX + halfWidth)
    zs.push(centerZ - halfDepth, centerZ + halfDepth)
  })

  data.fields.forEach((field) => {
    const [centerX, centerZ] = resolveWorldPoint(field.center[0], field.center[1], roadAlignment)
    const halfWidth = (field.size[0] * alignmentScale) / 2
    const halfDepth = (field.size[1] * alignmentScale) / 2
    xs.push(centerX - halfWidth, centerX + halfWidth)
    zs.push(centerZ - halfDepth, centerZ + halfDepth)
  })

  const minX = Math.min(...xs) - padding
  const maxX = Math.max(...xs) + padding
  const minZ = Math.min(...zs) - padding
  const maxZ = Math.max(...zs) + padding

  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
  }
}

function renderScene(roadAlignment: RoadAlignmentState) {
  disposeChildren(campusGroup)
  labelLayer.innerHTML = ''
  clickableObjects = []
  labelTargets = []
  routeGlowMaterial = null
  routeStart = null
  routeEnd = null
  routePulse = null
  routeCurve = null
  routePulsePoints = []

  const mapBounds = computeMapBounds(currentData, 140, roadAlignment)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapBounds.width, mapBounds.depth),
    new THREE.MeshStandardMaterial({ color: '#c8ddb0', roughness: 0.98, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(mapBounds.center[0], -0.01, mapBounds.center[1])
  ground.receiveShadow = true
  campusGroup.add(ground)

  for (const zone of currentData.zones) {
    const [zoneCenterX, zoneCenterZ] = resolveWorldPoint(zone.center[0], zone.center[1], roadAlignment)
    const zoneScale = Math.max(0.0001, roadAlignment.transform.scale)
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.size[0] * zoneScale, zone.size[1] * zoneScale),
      new THREE.MeshStandardMaterial({
        color: zone.color,
        transparent: true,
        opacity: 0.55,
        roughness: 1,
        metalness: 0,
        depthWrite: false,
      }),
    )
    tile.rotation.x = -Math.PI / 2
    tile.position.set(zoneCenterX, 0.025, zoneCenterZ)
    campusGroup.add(tile)
  }

  currentData.roads.forEach((road) => {
    if (road.points.length < 2) {
      return
    }

    const routePoints = road.points.map((point) => resolveRoadPoint(point, roadAlignment))
    const roadScale = roadAlignment.transform.scale
    const roadWidth = Math.max(0.0001, roadScale) * normalizeRoadWidth(road.width)
    const shape = buildRoadShape(routePoints, roadWidth)
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: road.color ?? '#9ca3af',
        roughness: 0.95,
        metalness: 0,
        emissive: '#000000',
        emissiveIntensity: 0,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.12
    mesh.receiveShadow = true
    campusGroup.add(mesh)
  })

  for (const water of currentData.waters) {
    const [waterX, waterZ] = resolveWorldPoint(water.center[0], water.center[1], roadAlignment)
    const waterScale = Math.max(0.0001, roadAlignment.transform.scale)
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshStandardMaterial({ color: water.color ?? '#60a5fa', transparent: true, opacity: 0.88, roughness: 0.18, metalness: 0.1 }),
    )
    mesh.scale.set((water.size[0] * waterScale) / 2, (water.size[1] * waterScale) / 2, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(waterX, 0.18, waterZ)
    campusGroup.add(mesh)
  }

  for (const field of currentData.fields) {
    const [fieldX, fieldZ] = resolveWorldPoint(field.center[0], field.center[1], roadAlignment)
    const fieldScale = Math.max(0.0001, roadAlignment.transform.scale)
    const fieldGroup = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(field.size[0] * fieldScale, field.size[1] * fieldScale),
      new THREE.MeshStandardMaterial({ color: field.color ?? '#22c55e', roughness: 1 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = 0.14
    fieldGroup.add(base)

    for (let i = -2; i <= 2; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(field.size[0] * fieldScale, (field.size[1] / 8) * fieldScale),
        new THREE.MeshStandardMaterial({ color: field.stripeColor ?? '#86efac', transparent: true, opacity: 0.85 }),
      )
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.15, i * ((field.size[1] / 5.4) * fieldScale))
      fieldGroup.add(stripe)
    }

    const track = new THREE.Mesh(
      new THREE.RingGeometry((field.size[0] / 2 + 2) * fieldScale, (field.size[0] / 2 + 7) * fieldScale, 48),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.9 }),
    )
    track.scale.set(1, field.size[1] / field.size[0], 1)
    track.rotation.x = -Math.PI / 2
    track.position.y = 0.13
    fieldGroup.add(track)

    fieldGroup.position.set(fieldX, 0, fieldZ)
    campusGroup.add(fieldGroup)
  }

  currentData.buildings.forEach((building, index) => {
    const selected = selection?.kind === 'building' && selection.index === index
    const renderAnchor = resolveBuildingRenderAnchor(building, roadAlignment)
    const mesh = createBuildingMesh(building, renderAnchor, roadAlignment, selected)
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
    const [worldX, worldZ] = resolveWorldPoint(x, z, roadAlignment)
    tree.position.set(worldX, 0, worldZ)
    campusGroup.add(tree)
  }

  for (const poi of resolvePois(currentData, roadAlignment)) {
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
    const resolvedRoute = resolveRoutePoints(activeRoute, roadAlignment)
    routePulsePoints = resolvedRoute.map((point) => new THREE.Vector3(...point))
    routeCurve = new THREE.CatmullRomCurve3(routePulsePoints)
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

    for (const point of resolvedRoute.slice(1, -1)) {
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
    const routeStartPoint = resolvedRoute[0]
    routeStart.position.set(routeStartPoint[0], routeStartPoint[1], routeStartPoint[2])
    routeStart.position.y = 6
    campusGroup.add(routeStart)

    routeEnd = createRouteBeacon('#fde047')
    const routeEndPoint = resolvedRoute[resolvedRoute.length - 1]
    routeEnd.position.set(routeEndPoint[0], routeEndPoint[1], routeEndPoint[2])
    routeEnd.position.y = 6
    campusGroup.add(routeEnd)
  }
}

function createBuildingMesh(building: Building, anchor: BuildingAnchor, roadAlignment: RoadAlignmentState, selected = false) {
  const group = new THREE.Group()
  const color = selected ? '#fb7185' : building.color ?? buildingColorByCategory[building.category] ?? '#cbd5e1'
  const baseHeight = building.height
  const displaySize = resolveBuildingDisplaySize(building)
  const alignedScale = Math.abs(roadAlignment.transform.scale)
  const scaleX = displaySize[0] * alignedScale
  const scaleZ = displaySize[1] * alignedScale
  const renderedFootprint = getRenderedBuildingFootprint(building, roadAlignment)

  if (renderedFootprint) {
    const shape = new THREE.Shape(
      renderedFootprint.map(([x, z]) => new THREE.Vector2(x - anchor.x, anchor.z - z)),
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

    if (building.category === 'library') {
      const accent = new THREE.Mesh(
        new THREE.BoxGeometry(scaleX * 0.22, baseHeight * 1.15, scaleZ * 0.25),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 }),
      )
      accent.position.set(0, baseHeight * 0.58, 0)
      group.add(accent)
    }

    group.position.set(anchor.x, 0, anchor.z)
    return group
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(scaleX, baseHeight, scaleZ),
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
        new THREE.BoxGeometry(scaleX * 0.82, Math.max(1.2, baseHeight * 0.06), scaleZ * 0.82),
        new THREE.MeshStandardMaterial({ color: selected ? '#fff1f2' : '#f8fafc', roughness: 0.85 }),
      )
      roof.position.y = baseHeight + 0.8
      roof.castShadow = true
      group.add(roof)
    }
  }

  if (building.category === 'library') {
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(scaleX * 0.22, baseHeight * 1.15, scaleZ * 0.25),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 }),
    )
    accent.position.set(0, baseHeight * 0.58, 0)
    group.add(accent)
  }

  group.position.set(anchor.x, 0, anchor.z)
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

function resolveBuildingAnchor(building: Building): BuildingAnchor {
  if (building.footprint && building.footprint.length >= 3) {
    const normalizedFootprint = normalizeFootprint(building.footprint)
    if (normalizedFootprint) {
      const centroid = getFootprintCentroid(normalizedFootprint)
      if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
        return { x: centroid[0], z: centroid[1], source: 'footprint' }
      }
    }
  }

  return { x: building.position[0], z: building.position[1], source: 'position' }
}

function normalizeFootprint(points: [number, number][]): [number, number][] | null {
  const normalized: [number, number][] = []
  for (const point of points) {
    const previous = normalized.at(-1)
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue
    }

    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > FOOTPRINT_EPSILON) {
      normalized.push([point[0], point[1]])
    }
  }

  if (normalized.length < 3) {
    return null
  }

  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= FOOTPRINT_EPSILON) {
    normalized.pop()
  }

  return normalized.length >= 3 ? normalized : null
}

function getFootprintCentroid(points: [number, number][]): [number, number] {
  let area2 = 0
  let cx = 0
  let cz = 0

  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index]
    const [x2, z2] = points[(index + 1) % points.length]
    const cross = x1 * z2 - x2 * z1
    area2 += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  }

  if (Math.abs(area2) <= FOOTPRINT_MIN_AREA) {
    let sx = 0
    let sz = 0
    for (const [x, z] of points) {
      sx += x
      sz += z
    }
    return [sx / points.length, sz / points.length]
  }

  const area = area2 * 0.5
  return [cx / (6 * area), cz / (6 * area)]
}

function resolveBuildingRenderAnchor(building: Building, roadAlignment: RoadAlignmentState): BuildingAnchor {
  const sourceAnchor = resolveBuildingAnchor(building)
  const [x, z] = applyWorldAlign([sourceAnchor.x, sourceAnchor.z], roadAlignment.transform)
  return { ...sourceAnchor, x, z }
}

function getRenderedBuildingFootprint(building: Building, roadAlignment: RoadAlignmentState): [number, number][] | null {
  if (building.footprint && building.footprint.length >= 3) {
    const normalizedFootprint = normalizeFootprint(building.footprint)
    if (normalizedFootprint) {
      return normalizedFootprint.map((point) => applyWorldAlign(point, roadAlignment.transform))
    }
  }

  const anchor = resolveBuildingRenderAnchor(building, roadAlignment)
  const size = resolveBuildingDisplaySize(building)
  const scale = Math.abs(roadAlignment.transform.scale)
  const halfWidth = (size[0] * scale) / 2
  const halfDepth = (size[1] * scale) / 2

  return [
    [anchor.x - halfWidth, anchor.z - halfDepth],
    [anchor.x + halfWidth, anchor.z - halfDepth],
    [anchor.x + halfWidth, anchor.z + halfDepth],
    [anchor.x - halfWidth, anchor.z + halfDepth],
  ]
}

function buildRoadAlignmentState(data: CampusData): RoadAlignmentState {
  const pairs: RoadAnchorPair[] = []

  for (const building of data.buildings) {
    const anchor = resolveBuildingAnchor(building)
    const mismatch = Math.hypot(anchor.x - building.position[0], anchor.z - building.position[1])
    if (mismatch <= ROAD_ANCHOR_SIGNIFICANCE) {
      continue
    }

    const source: [number, number] = [building.position[0], building.position[1]]
    const target: [number, number] = [anchor.x, anchor.z]
    pairs.push({ source, anchor: target })
  }

  const { transform, usedPairs } = buildRoadAlignmentResult(pairs)
  return { pairs: usedPairs, transform }
}

function buildRoadAlignmentResult(pairs: RoadAnchorPair[]): { transform: WorldAlign, usedPairs: RoadAnchorPair[] } {
  if (pairs.length < ROAD_ALIGNMENT_MIN_INLIERS) {
    return { transform: defaultAlignment, usedPairs: pairs }
  }

  let candidatePairs: RoadAnchorPair[] = pairs
  let transform: WorldAlign = defaultAlignment

  for (let iteration = 0; iteration <= ROAD_ALIGNMENT_OUTLIER_ITERS; iteration += 1) {
    const estimate = estimateWorldAlignTransform(candidatePairs)
    if (!estimate) {
      return { transform: defaultAlignment, usedPairs: candidatePairs }
    }
    transform = estimate

    const residuals = candidatePairs.map((pair) => measureAlignmentResidual(pair, transform))
    if (residuals.length <= ROAD_ALIGNMENT_MIN_INLIERS) {
      break
    }

    const threshold = computeRobustResidualCutoff(residuals)
    const nextPairs = candidatePairs.filter((_, index) => residuals[index] <= threshold)
    if (nextPairs.length === candidatePairs.length || nextPairs.length < ROAD_ALIGNMENT_MIN_INLIERS) {
      break
    }

    candidatePairs = nextPairs
  }

  return { transform, usedPairs: candidatePairs }
}

function computeRobustResidualCutoff(values: number[]): number {
  const threshold = values.length > 0
    ? calculateMedian(values) + ROAD_ALIGNMENT_RESIDUAL_MAD_MULTIPLIER * calculateMedianAbsoluteDeviation(values)
    : ROAD_ALIGNMENT_MIN_RESIDUAL_CUTOFF
  return Math.max(ROAD_ALIGNMENT_MIN_RESIDUAL_CUTOFF, threshold)
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function calculateMedianAbsoluteDeviation(values: number[]): number {
  const median = calculateMedian(values)
  return calculateMedian(values.map((value) => Math.abs(value - median)))
}

function estimateWorldAlignTransform(pairs: RoadAnchorPair[]): WorldAlign | null {
  if (pairs.length < 2) {
    return defaultAlignment
  }

  let sourceSumX = 0
  let sourceSumZ = 0
  let targetSumX = 0
  let targetSumZ = 0
  for (const pair of pairs) {
    sourceSumX += pair.source[0]
    sourceSumZ += pair.source[1]
    targetSumX += pair.anchor[0]
    targetSumZ += pair.anchor[1]
  }

  const n = pairs.length
  const sourceCx = sourceSumX / n
  const sourceCz = sourceSumZ / n
  const targetCx = targetSumX / n
  const targetCz = targetSumZ / n

  let cross = 0
  let dot = 0
  let sourceVariance = 0

  for (const pair of pairs) {
    const sx = pair.source[0] - sourceCx
    const sz = pair.source[1] - sourceCz
    const tx = pair.anchor[0] - targetCx
    const tz = pair.anchor[1] - targetCz

    dot += sx * tx + sz * tz
    cross += sx * tz - sz * tx
    sourceVariance += sx * sx + sz * sz
  }

  if (!Number.isFinite(sourceVariance) || sourceVariance <= 0) {
    return defaultAlignment
  }

  const scale = Math.hypot(dot, cross) / sourceVariance
  const rotation = Math.atan2(cross, dot)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const translateX = targetCx - scale * (cos * sourceCx - sin * sourceCz)
  const translateZ = targetCz - scale * (sin * sourceCx + cos * sourceCz)

  if (!Number.isFinite(scale) || !Number.isFinite(rotation) || !Number.isFinite(translateX) || !Number.isFinite(translateZ)) {
    return defaultAlignment
  }

  return { scale, rotation, translateX, translateZ }
}

function measureAlignmentResidual(pair: RoadAnchorPair, align: WorldAlign): number {
  const sourceAligned = applyWorldAlign(pair.source, align)
  const anchorAligned = applyWorldAlign(pair.anchor, align)
  return Math.hypot(anchorAligned[0] - sourceAligned[0], anchorAligned[1] - sourceAligned[1])
}

function applyWorldAlign(point: [number, number], align: WorldAlign): [number, number] {
  const cos = Math.cos(align.rotation)
  const sin = Math.sin(align.rotation)
  const x = align.scale * (cos * point[0] - sin * point[1]) + align.translateX
  const z = align.scale * (sin * point[0] + cos * point[1]) + align.translateZ
  return [x, z]
}

function resolveRoadPoint(point: [number, number], roadAlign: RoadAlignmentState): [number, number] {
  const aligned = applyWorldAlign(point, roadAlign.transform)
  const radius = ROAD_ALIGNMENT_RADIUS
  const maxDistance2 = radius * radius
  let totalWeight = 0
  let offsetX = 0
  let offsetZ = 0

  for (const pair of roadAlign.pairs) {
    const sourceAligned = applyWorldAlign(pair.source, roadAlign.transform)
    const targetAligned = applyWorldAlign(pair.anchor, roadAlign.transform)
    const dx = aligned[0] - sourceAligned[0]
    const dz = aligned[1] - sourceAligned[1]
    const distance2 = dx * dx + dz * dz
    if (distance2 > maxDistance2) continue
    const weight = 1 / (1 + distance2 / 5000)
    const residualX = targetAligned[0] - sourceAligned[0]
    const residualZ = targetAligned[1] - sourceAligned[1]
    totalWeight += weight
    offsetX += residualX * weight
    offsetZ += residualZ * weight
  }

  if (totalWeight <= 0.0001) {
    return aligned
  }

  const blend = Math.min(1, totalWeight / roadAlign.pairs.length)
  return [aligned[0] + (offsetX / totalWeight) * blend, aligned[1] + (offsetZ / totalWeight) * blend]
}

function resolveRoutePoint(point: [number, number, number], roadAlign: RoadAlignmentState): [number, number, number] {
  const snapped = resolveRoadPoint([point[0], point[2]], roadAlign)
  return [snapped[0], point[1], snapped[1]]
}

function resolveRoutePoints(route: RouteDefinition, roadAlign: RoadAlignmentState): [number, number, number][] {
  return route.points.map((point) => resolveRoutePoint(point, roadAlign))
}

function resolveBuildingDisplaySize(building: Building): [number, number] {
  if (building.footprint && building.footprint.length >= 3) {
    const size = getFootprintBounds(building.footprint)
    if (size) {
      return size
    }
  }

  return building.size
}

function getFootprintBounds(points: [number, number][]): [number, number] | null {
  const normalized = normalizeFootprint(points)
  if (!normalized || normalized.length < 3) {
    return null
  }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const [x, z] of normalized) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  const width = maxX - minX
  const depth = maxZ - minZ

  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
    return null
  }

  return [width, depth]
}

function normalizeRoadWidth(width: number | undefined) {
  const candidate = Number(width)
  return Number.isFinite(candidate) && candidate > 0 ? candidate : ROAD_WIDTH_DEFAULT
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

function samplePolylinePoint(points: THREE.Vector3[], progress: number) {
  if (points.length === 0) {
    return new THREE.Vector3()
  }
  if (points.length === 1) {
    return points[0].clone()
  }

  let totalLength = 0
  const segmentLengths: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const length = points[index - 1].distanceTo(points[index])
    segmentLengths.push(length)
    totalLength += length
  }

  let targetDistance = totalLength * progress
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]
    if (targetDistance <= length || index === segmentLengths.length - 1) {
      const ratio = length > 0 ? targetDistance / length : 0
      return points[index].clone().lerp(points[index + 1], Math.max(0, Math.min(1, ratio)))
    }
    targetDistance -= length
  }

  return points[points.length - 1].clone()
}

function resolvePois(data: CampusData, roadAlignment: RoadAlignmentState) {
  const buildingMap = new Map(data.buildings.map((building) => [building.id, building]))
  return data.pois.map((poi) => {
    if (!poi.sourceBuildingId) {
      const [x, z] = applyWorldAlign([poi.position[0], poi.position[2]], roadAlignment.transform)
      return {
        ...poi,
        position: [x, poi.position[1], z] as [number, number, number],
      }
    }
    const building = buildingMap.get(poi.sourceBuildingId)
    if (!building) {
      return poi
    }
    const anchor = resolveBuildingRenderAnchor(building, roadAlignment)
    return {
      ...poi,
      name: building.name,
      color: poi.color ?? building.color,
      position: [anchor.x, building.height + 2, anchor.z] as [number, number, number],
    }
  })
}

function ensureSelectionInBounds() {
  if (!selection) {
    return
  }

  if (selection.kind === 'building' && !currentData.buildings[selection.index]) {
    selection = currentData.buildings.length > 0 ? { kind: 'building', index: 0 } : null
  }
}

function updateSelectionToast() {
  if (!selection) {
    selectionToast.textContent = '未选择对象'
    return
  }

  const building = currentData.buildings[selection.index]
  selectionToast.textContent = building ? `已选中建筑：${building.name}` : '未选择对象'
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatCoordinate(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
