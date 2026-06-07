import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CampusData } from '../data/campusData'
import { COLORS } from './theme'
import { buildGround, buildZones, buildWaters, buildFields, buildTrees, buildRoads, buildBuilding, buildPois, type BuiltLabel } from './builders'

export class CampusScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly renderer: THREE.WebGLRenderer
  readonly campusGroup = new THREE.Group()
  clickableObjects: THREE.Object3D[] = []
  labels: BuiltLabel[] = []

  private readonly host: HTMLDivElement
  private readonly labelLayer: HTMLDivElement
  private data!: CampusData
  private selectedIndex = 0
  private routeCurve: THREE.CatmullRomCurve3 | null = null
  private routeGlow: THREE.MeshBasicMaterial | null = null
  private routePulse: THREE.Mesh | null = null
  private readonly tempVector = new THREE.Vector3()

  constructor(host: HTMLDivElement, labelLayer: HTMLDivElement) {
    this.host = host
    this.labelLayer = labelLayer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.background)
    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 5000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.maxPolarAngle = Math.PI / 2.08
    this.controls.minDistance = 35
    this.controls.maxDistance = 4200

    this.addLights()
    this.scene.add(this.campusGroup)
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight('#ffffff', '#cdd6df', 2.0)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight('#ffffff', 0.6)
    key.position.set(-120, 220, 90)
    key.castShadow = false
    this.scene.add(key)
  }

  private computeBounds(padding = 0) {
    const xs: number[] = []
    const zs: number[] = []
    for (const b of this.data.buildings) {
      xs.push(b.position[0]); zs.push(b.position[1])
      b.footprint?.forEach(([x, z]) => { xs.push(x); zs.push(z) })
    }
    for (const r of this.data.roads) r.points.forEach(([x, z]) => { xs.push(x); zs.push(z) })
    for (const z of this.data.zones) { xs.push(z.center[0] - z.size[0] / 2, z.center[0] + z.size[0] / 2); zs.push(z.center[1] - z.size[1] / 2, z.center[1] + z.size[1] / 2) }
    for (const w of this.data.waters) { xs.push(w.center[0] - w.size[0] / 2, w.center[0] + w.size[0] / 2); zs.push(w.center[1] - w.size[1] / 2, w.center[1] + w.size[1] / 2) }
    for (const f of this.data.fields) { xs.push(f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2); zs.push(f.center[1] - f.size[1] / 2, f.center[1] + f.size[1] / 2) }
    const minX = Math.min(...xs) - padding, maxX = Math.max(...xs) + padding
    const minZ = Math.min(...zs) - padding, maxZ = Math.max(...zs) + padding
    return { center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number], width: Math.max(1, maxX - minX), depth: Math.max(1, maxZ - minZ) }
  }

  setData(data: CampusData): void {
    this.data = data
    this.rebuild()
  }

  setSelected(index: number): void {
    this.selectedIndex = index
    this.rebuild()
  }

  setDataAndSelection(data: CampusData, index: number): void {
    this.data = data
    this.selectedIndex = index
    this.rebuild()
  }

  private rebuild(): void {
    this.disposeGroup()
    this.labelLayer.innerHTML = ''
    this.clickableObjects.length = 0
    this.labels.length = 0
    this.routeCurve = null; this.routeGlow = null; this.routePulse = null

    const bounds = this.computeBounds(140)
    this.campusGroup.add(buildGround(bounds))
    buildZones(this.data).forEach((o) => this.campusGroup.add(o))
    buildRoads(this.data).forEach((o) => this.campusGroup.add(o))
    buildWaters(this.data).forEach((o) => this.campusGroup.add(o))
    buildFields(this.data).forEach((o) => this.campusGroup.add(o))
    this.data.buildings.forEach((b, index) => {
      const mesh = buildBuilding(b, index === this.selectedIndex)
      mesh.traverse((child) => {
        child.userData = { kind: 'building', index }
        if (child instanceof THREE.Mesh) this.clickableObjects.push(child)
      })
      this.campusGroup.add(mesh)
    })
    buildTrees(this.data).forEach((o) => this.campusGroup.add(o))
    const { objects, labels } = buildPois(this.data, this.labelLayer)
    objects.forEach((o) => this.campusGroup.add(o))
    this.labels.push(...labels)
    this.buildRoute()
  }

  private buildRoute(): void {
    const route = this.data.routes[0]
    if (!route || route.points.length < 2) return
    const routePoints = route.points.map((p) => new THREE.Vector3(...p))
    this.routeCurve = new THREE.CatmullRomCurve3(routePoints)
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.routeCurve, 220, 1.55, 16, false),
      new THREE.MeshStandardMaterial({ color: COLORS.routePrimary, emissive: COLORS.routePrimary, emissiveIntensity: 0.9, transparent: true, opacity: 0.98 }),
    )
    this.campusGroup.add(tube)
    this.routeGlow = new THREE.MeshBasicMaterial({ color: '#ff9dce', transparent: true, opacity: 0.2 })
    this.campusGroup.add(new THREE.Mesh(new THREE.TubeGeometry(this.routeCurve, 220, 3.1, 16, false), this.routeGlow))
    this.routePulse = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 20, 20),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: COLORS.routePrimary, emissiveIntensity: 1.2 }),
    )
    this.campusGroup.add(this.routePulse)
  }

  private disposeGroup(): void {
    while (this.campusGroup.children.length > 0) {
      const child = this.campusGroup.children[0]
      this.campusGroup.remove(child)
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const m = node.material
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
          else m.dispose()
        }
      })
    }
  }

  setOverviewCamera(): void {
    const bounds = this.computeBounds(160)
    const maxDim = Math.max(bounds.width, bounds.depth)
    const target = new THREE.Vector3(bounds.center[0], 0, bounds.center[1])
    this.controls.target.copy(target)
    this.camera.position.set(target.x - maxDim * 0.72, maxDim * 0.42, target.z + maxDim * 0.68)
    this.camera.near = 5
    this.camera.far = Math.max(5000, maxDim * 4)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  focusBuilding(index: number): void {
    const b = this.data.buildings[index]
    if (!b) return
    const target = new THREE.Vector3(b.position[0], Math.max(8, b.height * 0.55), b.position[1])
    const dist = Math.max(110, Math.max(b.size[0], b.size[1]) * 4.5)
    this.controls.target.copy(target)
    this.camera.position.set(target.x - dist * 0.7, target.y + dist * 0.8, target.z + dist)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  render(elapsed: number): void {
    this.controls.update()
    if (this.routeGlow) this.routeGlow.opacity = 0.14 + Math.sin(elapsed * 2.2) * 0.06
    if (this.routeCurve && this.routePulse) {
      const t = Math.min((elapsed * 0.08) % 1, 0.999)
      this.routePulse.position.copy(this.routeCurve.getPointAt(t))
      this.routePulse.scale.setScalar(0.8 + (Math.sin(elapsed * 5.5) + 1) * 0.12)
    }
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
  }

  private updateLabels(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    const placed: { x: number; y: number }[] = []
    const minGap = 46
    const ranked = this.labels.map((t) => {
      this.tempVector.set(...t.marker.position).project(this.camera)
      return { t, depth: this.tempVector.z, x: ((this.tempVector.x + 1) / 2) * w, y: ((-this.tempVector.y + 1) / 2) * h }
    }).sort((a, b) => a.depth - b.depth)
    for (const r of ranked) {
      const visible = r.depth < 1 && r.depth > -1
      const inside = r.x >= -80 && r.x <= w + 80 && r.y >= -30 && r.y <= h + 30
      const clashes = placed.some((p) => Math.abs(p.x - r.x) < minGap && Math.abs(p.y - r.y) < minGap * 0.5)
      const show = visible && inside && !clashes
      r.t.element.style.opacity = show ? '1' : '0'
      r.t.element.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)`
      if (show) placed.push({ x: r.x, y: r.y })
    }
  }
}
