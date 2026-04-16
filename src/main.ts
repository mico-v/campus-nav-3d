import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { campusData, type Building, type PoiMarker } from './data/campusData'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

const activeRoute = campusData.routes[0]

app.innerHTML = `
  <div class="app-shell">
    <div class="scene-wrap">
      <div class="hero-copy">
        <div>
          <p class="eyebrow">GitHub Pages 友好的静态 3D 原型</p>
          <h1>${campusData.name}</h1>
          <p class="subtitle">依据参考拓扑图重新校准建筑与分区位置的可浏览 3D 视图，便于后续继续微调建筑高度、位置与路线。</p>
        </div>
        <div class="hero-badges">
          <span>Three.js</span>
          <span>Vite + TypeScript</span>
          <span>可编辑数据驱动</span>
        </div>
      </div>
      <div id="scene"></div>
      <div id="label-layer"></div>
      <div class="scene-help">拖拽旋转 / 滚轮缩放 / 右键平移</div>
    </div>
    <aside class="panel">
      <section>
        <h2>示例路线</h2>
        <p class="route-name">${activeRoute.name}</p>
        <ol class="route-steps">
          ${activeRoute.steps.map((step) => `<li>${step}</li>`).join('')}
        </ol>
      </section>
      <section>
        <h2>沿途地标</h2>
        <div class="chip-list">
          ${activeRoute.landmarks.map((name) => `<span class="chip">${name}</span>`).join('')}
        </div>
      </section>
      <section>
        <h2>功能说明</h2>
        <ul class="feature-list">
          <li>分区：西部学院区、西区宿舍区、中央教学行政区、图书馆东区过渡带、东区宿舍生活区、南部教学生活区、运动休闲带</li>
          <li>可见：建筑体块、道路、水体、操场、POI 标记、路线高亮</li>
          <li>编辑入口：<code>src/data/campusData.ts</code></li>
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
        </div>
      </section>
    </aside>
  </div>
`

const sceneHost = document.querySelector<HTMLDivElement>('#scene')
const labelLayer = document.querySelector<HTMLDivElement>('#label-layer')

if (!sceneHost || !labelLayer) {
  throw new Error('Scene host missing')
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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(campusData.bounds.width, campusData.bounds.depth),
  new THREE.MeshStandardMaterial({ color: '#c8ddb0', roughness: 0.98, metalness: 0 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
campusGroup.add(ground)

const zoneMaterialCache = new Map<string, THREE.MeshStandardMaterial>()
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
}

for (const zone of campusData.zones) {
  const material = new THREE.MeshStandardMaterial({
    color: zone.color,
    transparent: true,
    opacity: 0.92,
    roughness: 1,
    metalness: 0,
  })
  zoneMaterialCache.set(zone.id, material)

  const tile = new THREE.Mesh(new THREE.PlaneGeometry(zone.size[0], zone.size[1]), material)
  tile.rotation.x = -Math.PI / 2
  tile.position.set(zone.center[0], 0.06, zone.center[1])
  campusGroup.add(tile)
}

for (const road of campusData.roads) {
  const shape = buildRoadShape(road.points, road.width)
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: road.color ?? '#9ca3af', roughness: 0.95, metalness: 0 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.12
  mesh.receiveShadow = true
  campusGroup.add(mesh)
}

for (const water of campusData.waters) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshStandardMaterial({ color: water.color ?? '#60a5fa', transparent: true, opacity: 0.88, roughness: 0.18, metalness: 0.1 }),
  )
  mesh.scale.set(water.size[0] / 2, water.size[1] / 2, 1)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(water.center[0], 0.18, water.center[1])
  campusGroup.add(mesh)
}

for (const field of campusData.fields) {
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

const labelTargets: { marker: PoiMarker; element: HTMLDivElement }[] = []
const markerGeometry = new THREE.CylinderGeometry(0.9, 0.9, 7, 12)

for (const building of campusData.buildings) {
  const mesh = createBuildingMesh(building)
  campusGroup.add(mesh)
}

for (const [x, z] of campusData.trees) {
  const tree = createTree()
  tree.position.set(x, 0, z)
  campusGroup.add(tree)
}

for (const poi of campusData.pois) {
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

const routeCurve = new THREE.CatmullRomCurve3(activeRoute.points.map((point) => new THREE.Vector3(...point)))
const routeGeometry = new THREE.TubeGeometry(routeCurve, 220, 1.55, 20, false)
const routeMesh = new THREE.Mesh(
  routeGeometry,
  new THREE.MeshStandardMaterial({ color: '#ff4fa3', emissive: '#ff6ab7', emissiveIntensity: 1.25, transparent: true, opacity: 0.98 }),
)
routeMesh.castShadow = false
campusGroup.add(routeMesh)

const routeGlow = new THREE.Mesh(
  new THREE.TubeGeometry(routeCurve, 220, 3.1, 20, false),
  new THREE.MeshBasicMaterial({ color: '#ff9dce', transparent: true, opacity: 0.2 }),
)
campusGroup.add(routeGlow)

for (const point of activeRoute.points.slice(1, -1)) {
  const node = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 14, 14),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  )
  node.position.set(point[0], point[1], point[2])
  campusGroup.add(node)
}

const routePulse = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 24, 24),
  new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff4fa3', emissiveIntensity: 1.4, transparent: true, opacity: 0.95 }),
)
campusGroup.add(routePulse)

const routeStart = createRouteBeacon('#f97316')
routeStart.position.set(...activeRoute.points[0])
routeStart.position.y = 6
campusGroup.add(routeStart)

const routeEnd = createRouteBeacon('#fde047')
routeEnd.position.set(...activeRoute.points[activeRoute.points.length - 1])
routeEnd.position.y = 6
campusGroup.add(routeEnd)

const axesShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(campusData.bounds.width + 20, campusData.bounds.depth + 20),
  new THREE.ShadowMaterial({ opacity: 0.15 }),
)
axesShadow.rotation.x = -Math.PI / 2
axesShadow.position.y = 0.01
scene.add(axesShadow)

const resize = () => {
  const width = sceneHost.clientWidth
  const height = sceneHost.clientHeight
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

const tempVector = new THREE.Vector3()
const updateLabels = () => {
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

resize()
window.addEventListener('resize', resize)

const clock = new THREE.Clock()
const animate = () => {
  const elapsed = clock.getElapsedTime()
  controls.update()
  routeGlow.material.opacity = 0.14 + Math.sin(elapsed * 2.2) * 0.06
  routeStart.rotation.y = elapsed * 1.2
  routeEnd.rotation.y = -elapsed * 1.2
  const progress = (elapsed * 0.08) % 1
  const pulsePoint = routeCurve.getPointAt(progress)
  routePulse.position.copy(pulsePoint)
  routePulse.scale.setScalar(0.8 + (Math.sin(elapsed * 5.5) + 1) * 0.12)
  renderer.render(scene, camera)
  updateLabels()
  requestAnimationFrame(animate)
}

animate()

function createBuildingMesh(building: Building) {
  const group = new THREE.Group()
  const color = building.color ?? buildingColorByCategory[building.category] ?? '#cbd5e1'
  const baseHeight = building.height

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(building.size[0], baseHeight, building.size[1]),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 }),
  )
  body.position.y = baseHeight / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  if (baseHeight > 8) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(building.size[0] * 0.82, Math.max(1.2, baseHeight * 0.06), building.size[1] * 0.82),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.85 }),
    )
    roof.position.y = baseHeight + 0.8
    roof.castShadow = true
    group.add(roof)
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
