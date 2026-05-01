import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  createDefaultCampusData,
  type Building,
  type CampusData,
  type PoiMarker,
} from './data/campusData'

type Selection =
  | { kind: 'building'; index: number }
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

setOverviewCamera()
renderAll()

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
  ensureSelectionInBounds()
  heroTitle.textContent = currentData.name
  renderRouteInfo()
  renderEntityList()
  renderScene()
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
      const zoneName = currentData.zones.find((zone) => zone.id === building.zoneId)?.name ?? building.zoneId
      return `
        <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="building" data-index="${index}">
          <span>
            <strong>${escapeHtml(building.name || building.id || `建筑 ${index + 1}`)}</strong>
            <small>${escapeHtml(building.category)} · ${escapeHtml(zoneName)}</small>
            <small>X ${formatCoordinate(building.position[0])} / Z ${formatCoordinate(building.position[1])} · 高 ${formatCoordinate(building.height)}</small>
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

  const target = new THREE.Vector3(
    building.position[0],
    Math.max(8, building.height * 0.55),
    building.position[1],
  )
  const footprintSize = Math.max(building.size[0], building.size[1])
  const distance = Math.max(110, footprintSize * 4.5)

  controls.target.copy(target)
  camera.position.set(target.x - distance * 0.7, target.y + distance * 0.8, target.z + distance)
  camera.updateProjectionMatrix()
  controls.update()
}

function setOverviewCamera() {
  const bounds = computeMapBounds(currentData, 160)
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

function computeMapBounds(data: CampusData, padding = 0) {
  const xs: number[] = []
  const zs: number[] = []

  data.buildings.forEach((building) => {
    xs.push(building.position[0])
    zs.push(building.position[1])
    building.footprint?.forEach(([x, z]) => {
      xs.push(x)
      zs.push(z)
    })
  })

  data.roads.forEach((road) => {
    road.points.forEach(([x, z]) => {
      xs.push(x)
      zs.push(z)
    })
  })

  data.zones.forEach((zone) => {
    xs.push(zone.center[0] - zone.size[0] / 2, zone.center[0] + zone.size[0] / 2)
    zs.push(zone.center[1] - zone.size[1] / 2, zone.center[1] + zone.size[1] / 2)
  })

  data.waters.forEach((water) => {
    xs.push(water.center[0] - water.size[0] / 2, water.center[0] + water.size[0] / 2)
    zs.push(water.center[1] - water.size[1] / 2, water.center[1] + water.size[1] / 2)
  })

  data.fields.forEach((field) => {
    xs.push(field.center[0] - field.size[0] / 2, field.center[0] + field.size[0] / 2)
    zs.push(field.center[1] - field.size[1] / 2, field.center[1] + field.size[1] / 2)
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
  routePulsePoints = []

  const mapBounds = computeMapBounds(currentData, 140)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapBounds.width, mapBounds.depth),
    new THREE.MeshStandardMaterial({ color: '#c8ddb0', roughness: 0.98, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(mapBounds.center[0], -0.01, mapBounds.center[1])
  ground.receiveShadow = true
  campusGroup.add(ground)

	  for (const zone of currentData.zones) {
	    const tile = new THREE.Mesh(
	      new THREE.PlaneGeometry(zone.size[0], zone.size[1]),
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
	    tile.position.set(zone.center[0], 0.025, zone.center[1])
	    campusGroup.add(tile)
	  }

  currentData.roads.forEach((road) => {
    if (road.points.length < 2) {
      return
    }

    const shape = buildRoadShape(road.points, road.width)
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
    routePulsePoints = activeRoute.points.map((point) => new THREE.Vector3(...point))
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
