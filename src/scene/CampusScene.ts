import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CampusData } from '../data/campusData'
import type { Selection } from '../editor/types'
import { COLORS } from './theme'
import { buildGround, buildZones, buildWaters, buildFields, buildTrees, buildRoads, buildBuilding, buildPois, buildingColor, type BuiltLabel } from './builders'
import { deriveCampusBounds, poiDisplayLevel, resolvedPoi, type RoadDisplayOptions } from './displayRules'
import { areaPolygon, buildingPolygon, waterPolygon } from './displayRules'
import { buildRoadOutline } from './geo'
import { RenderMetricsMonitor, evaluateRenderBudget, type RenderBudget, type RenderBudgetResult, type RenderMetrics } from '../performance/metrics'

export interface SceneDisplayOptions extends RoadDisplayOptions {
  showBuildings?: boolean
  showPaths?: boolean
  showWater?: boolean
  showFields?: boolean
  showTrees?: boolean
  showZones?: boolean
  showPois?: boolean
  showLabels?: boolean
  showEditorAids?: boolean
}

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
  private readonly tempVector = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly highlightGroup = new THREE.Group()
  private readonly editorAidGroup = new THREE.Group()
  private readonly buildingObjects = new Map<number, THREE.Group>()
  private readonly roadObjects = new Map<number, THREE.Group[]>()
  private readonly poiObjects = new Map<string, THREE.Group>()
  private editorPreviewBase: { key: string; building?: [number, number]; road?: Map<THREE.Group, [number, number]>; poi?: [number, number] } | null = null
  private editorSelection: Selection = null
  private editorEditMode = false
  private editorDrag: { start: THREE.Vector3; last: THREE.Vector3 } | null = null
  private pointerDownScreen: [number, number] | null = null
  onGroundEdit: ((point: [number, number], phase: 'start' | 'move' | 'end', selection: Selection) => void) | null = null
  onSelectionChange: ((selection: Selection) => void) | null = null
  private roadDisplayOptions: RoadDisplayOptions = {}
  private displayOptions: SceneDisplayOptions = {}
  private campusSize = 1
  private readonly metrics = new RenderMetricsMonitor()
  constructor(host: HTMLDivElement, labelLayer: HTMLDivElement) {
    this.host = host
    // The editor historically passed the same element for both arguments.
    // Keep the renderer DOM node safe from label refreshes in that case by
    // creating a sibling overlay instead of clearing the canvas container.
    if (labelLayer === host) {
      const overlay = document.createElement('div')
      overlay.className = 'scene-label-layer'
      host.appendChild(overlay)
      this.labelLayer = overlay
    } else {
      this.labelLayer = labelLayer
    }
    // The campus coordinates span several thousand world units. Logarithmic
    // depth keeps distant building faces stable while OrbitControls moves the
    // camera, especially where a footprint meets the ground plane.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.background)
    this.camera = new THREE.PerspectiveCamera(45, 1, 10, 5000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.maxPolarAngle = Math.PI / 2.08
    this.controls.minDistance = 35
    this.controls.maxDistance = 4200

    this.addLights()
    this.scene.add(this.campusGroup)
    this.scene.add(this.highlightGroup)
    this.scene.add(this.editorAidGroup)
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.handlePointerDown(event))
    this.renderer.domElement.addEventListener('pointermove', (event) => this.handlePointerMove(event))
    this.renderer.domElement.addEventListener('pointerup', (event) => this.handlePointerUp(event))
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight('#ffffff', '#cdd6df', 2.0)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight('#ffffff', 0.6)
    key.position.set(-120, 220, 90)
    key.castShadow = false
    this.scene.add(key)
  }

  setData(data: CampusData): void {
    this.data = data
    this.rebuild()
  }

  setRoadDisplayOptions(options: RoadDisplayOptions): void {
    this.roadDisplayOptions = { ...options }
    this.displayOptions = { ...this.displayOptions, ...options }
    if (this.data) this.rebuild()
  }

  setDisplayOptions(options: SceneDisplayOptions): void {
    this.displayOptions = { ...this.displayOptions, ...options }
    this.roadDisplayOptions = {
      showGraphRoads: this.displayOptions.showGraphRoads,
      showCanals: this.displayOptions.showCanals,
      maxRoadWidth: this.displayOptions.maxRoadWidth,
    }
    if (this.data) this.rebuild()
  }

  setSelected(index: number): void {
    this.setEditorSelection({ kind: 'building', index })
  }

  setEditorSelection(selection: Selection): void {
    if (this.data && this.editorSelection && this.selectionKey(this.editorSelection) === this.selectionKey(selection)) return
    this.editorSelection = selection
    this.selectedIndex = selection?.kind === 'building' ? selection.index : -1
    if (!this.data || this.buildingObjects.size === 0) {
      if (this.data) this.rebuild()
      return
    }
    this.updateBuildingSelection()
    this.buildSelectionHighlight()
  }

  private selectionKey(selection: Selection): string {
    if (!selection) return 'none'
    return selection.kind === 'road-node' ? `${selection.kind}:${selection.id}` : `${selection.kind}:${selection.index}`
  }

  /** Selection is transient UI state; update only materials/highlights so a
   * click does not recreate every road and building geometry. */
  private updateBuildingSelection(): void {
    this.buildingObjects.forEach((group, index) => {
      const selected = this.editorSelection?.kind === 'building' && this.editorSelection.index === index
      const building = this.data.buildings[index]
      if (!building) return
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const role = child.userData.role as string | undefined
        const material = child.material
        const materials = Array.isArray(material) ? material : [material]
        for (const item of materials) {
          if (!(item instanceof THREE.MeshStandardMaterial)) continue
          if (role === 'building-body') {
            item.color.set(buildingColor(building, selected))
            item.emissive.set(selected ? COLORS.selected : '#000000')
            item.emissiveIntensity = selected ? 0.18 : 0
          } else if (role === 'building-roof') {
            item.color.set(selected ? COLORS.roofSelected : COLORS.roof)
          }
        }
      })
    })
  }

  setEditorEditMode(enabled: boolean): void {
    this.editorEditMode = enabled
    this.controls.enabled = !enabled
  }

  isEditorDragging(): boolean {
    return this.editorDrag !== null
  }

  beginEditorPreview(selection: Selection): void {
    if (!selection) return
    const key = selection.kind === 'road-node' ? `${selection.kind}:${selection.id}` : `${selection.kind}:${selection.index}`
    if (this.editorPreviewBase?.key === key) return
    if (selection.kind === 'building') {
      const object = this.buildingObjects.get(selection.index)
      if (object) this.editorPreviewBase = { key, building: [object.position.x, object.position.z] }
    } else if (selection.kind === 'road') {
      const groups = this.roadObjects.get(selection.index) ?? []
      this.editorPreviewBase = { key, road: new Map(groups.map((group) => [group, [group.position.x, group.position.z]])) }
    } else if (selection.kind === 'poi') {
      const poi = this.data.pois[selection.index]
      const object = poi ? this.poiObjects.get(poi.id) : undefined
      if (object) this.editorPreviewBase = { key, poi: [object.position.x, object.position.z] }
    } else if (selection.kind === 'road-node') {
      this.editorPreviewBase = { key }
    }
  }

  previewEditorTranslation(selection: Selection, dx: number, dz: number): void {
    if (!selection) return
    this.beginEditorPreview(selection)
    const key = selection.kind === 'road-node' ? `${selection.kind}:${selection.id}` : `${selection.kind}:${selection.index}`
    if (!this.editorPreviewBase || this.editorPreviewBase.key !== key) return
    if (selection.kind === 'building') {
      const object = this.buildingObjects.get(selection.index)
      const base = this.editorPreviewBase.building
      if (object && base) object.position.set(base[0] + dx, object.position.y, base[1] + dz)
    } else if (selection.kind === 'road') {
      this.editorPreviewBase.road?.forEach((base, group) => group.position.set(base[0] + dx, group.position.y, base[1] + dz))
    } else if (selection.kind === 'poi') {
      const poi = this.data.pois[selection.index]
      const object = poi ? this.poiObjects.get(poi.id) : undefined
      const base = this.editorPreviewBase.poi
      if (object && base) object.position.set(base[0] + dx, object.position.y, base[1] + dz)
      const label = poi ? this.labels.find((item) => item.marker.id === poi.id) : undefined
      if (label) label.marker.position = [poi.position[0] + dx, poi.position[1], poi.position[2] + dz]
    } else if (selection.kind === 'road-node') {
      // A topology node moves only the incident portions of several source
      // roads. Moving the whole road group would show a false preview, so
      // rebuild the small road network while the node is being dragged.
      this.editorPreviewBase = null
      this.rebuild()
      return
    }
    this.highlightGroup.position.set(dx, 0, dz)
  }

  commitEditorPreview(): void {
    const needsRebuild = this.editorPreviewBase !== null
    this.editorPreviewBase = null
    if (needsRebuild) this.rebuild()
  }

  focusSelection(selection = this.editorSelection): void {
    if (!selection || !this.data) return
    if (selection.kind === 'building') this.focusBuilding(selection.index)
    else if (selection.kind === 'poi') this.focusPoi(this.data.pois[selection.index]?.id ?? '')
    else {
      const point = this.selectionGroundPoint(selection)
      if (!point) return
      const dist = Math.max(55, this.campusSize * 0.18)
      this.controls.target.set(point.x, 0, point.z)
      this.camera.position.set(point.x - dist * 0.7, dist * 0.8, point.z + dist)
      this.controls.update()
    }
  }

  setTopDown(enabled: boolean): void {
    if (!this.data) return
    const target = this.controls.target.clone()
    if (enabled) {
      const distance = Math.max(120, this.campusSize * 0.8)
      this.camera.position.set(target.x, distance, target.z)
      this.camera.up.set(0, 0, -1)
      this.controls.maxPolarAngle = 0.01
    } else {
      this.camera.position.set(target.x - this.campusSize * 0.45, this.campusSize * 0.42, target.z + this.campusSize * 0.5)
      this.camera.up.set(0, 1, 0)
      this.controls.maxPolarAngle = Math.PI / 2.08
    }
    this.controls.update()
  }

  setDataAndSelection(data: CampusData, index: number): void {
    this.data = data
    this.editorSelection = null
    this.setEditorSelection({ kind: 'building', index })
  }

  /** Update data and editor selection in one rebuild for the editor view. */
  setDataAndEditorSelection(data: CampusData, selection: Selection): void {
    this.data = data
    this.editorSelection = selection
    this.selectedIndex = selection?.kind === 'building' ? selection.index : -1
    this.rebuild()
    this.updateBuildingSelection()
  }

  private rebuild(): void {
    this.disposeGroup()
    this.clearEditorAids()
    this.labelLayer.innerHTML = ''
    this.clickableObjects.length = 0
    this.labels.length = 0
    this.buildingObjects.clear()
    this.roadObjects.clear()
    this.poiObjects.clear()
    this.editorPreviewBase = null
    this.highlightGroup.position.set(0, 0, 0)
    const rawBounds = deriveCampusBounds(this.data, this.roadDisplayOptions)
    const bounds = { ...rawBounds, width: rawBounds.width + 280, depth: rawBounds.depth + 280 }
    this.campusSize = Math.max(rawBounds.width, rawBounds.depth)
    if (this.displayOptions.showEditorAids !== false) this.buildEditorAids(rawBounds)
    this.campusGroup.add(buildGround(bounds))
    if (this.displayOptions.showZones !== false) buildZones(this.data).forEach((o, index) => {
      o.userData = { kind: 'zone', index }
      this.clickableObjects.push(o)
      this.campusGroup.add(o)
    })
    if (this.displayOptions.showPaths !== false) {
      const builtRoads = buildRoads(this.data, this.roadDisplayOptions)
      builtRoads.forEach((structure) => {
        const sourceIndex = typeof structure.userData.sourceIndex === 'number' ? structure.userData.sourceIndex : -1
        const group = new THREE.Group()
        structure.traverse((child) => {
          child.userData = { ...child.userData, kind: 'road', index: sourceIndex }
          if (sourceIndex >= 0 && child instanceof THREE.Mesh) this.clickableObjects.push(child)
        })
        group.add(structure)
        if (sourceIndex >= 0) {
          const groups = this.roadObjects.get(sourceIndex) ?? []
          groups.push(group)
          this.roadObjects.set(sourceIndex, groups)
        }
        this.campusGroup.add(group)
      })
    }
    if (this.displayOptions.showWater !== false) buildWaters(this.data).forEach((o, index) => {
      o.userData = { kind: 'water', index }
      this.clickableObjects.push(o)
      this.campusGroup.add(o)
    })
    if (this.displayOptions.showFields !== false) buildFields(this.data).forEach((o, index) => {
      o.userData = { kind: 'field', index }
      this.clickableObjects.push(o)
      this.campusGroup.add(o)
    })
    if (this.displayOptions.showBuildings !== false) this.data.buildings.forEach((b, index) => {
      const mesh = buildBuilding(b, index === this.selectedIndex)
      this.buildingObjects.set(index, mesh)
      mesh.traverse((child) => {
        child.userData = { ...child.userData, kind: 'building', index }
        if (child instanceof THREE.Mesh) this.clickableObjects.push(child)
      })
      this.campusGroup.add(mesh)
    })
    if (this.displayOptions.showPois !== false) {
      const { objects, labels } = buildPois(this.data, this.labelLayer)
      const poiGroups = new Map<string, THREE.Group>()
      objects.forEach((o) => {
        const poi = o.userData
        if (!poi.kind) o.userData = { kind: 'poi' }
        this.clickableObjects.push(o)
        const id = typeof o.userData.id === 'string' ? o.userData.id : ''
        const group = poiGroups.get(id) ?? new THREE.Group()
        group.add(o)
        poiGroups.set(id, group)
      })
      poiGroups.forEach((group, id) => { this.poiObjects.set(id, group); this.campusGroup.add(group) })
      this.labels.push(...labels)
    }
    if (this.displayOptions.showTrees !== false) buildTrees(this.data).forEach((o) => this.campusGroup.add(o))
    this.buildSelectionHighlight()
  }

  private buildEditorAids(bounds: { center: [number, number]; width: number; depth: number }): void {
    this.clearEditorAids()
    const size = Math.max(bounds.width, bounds.depth)
    const divisions = Math.max(10, Math.min(80, Math.round(size / 20)))
    const grid = new THREE.GridHelper(size, divisions, '#40516a', '#1d2a3d')
    grid.position.set(bounds.center[0], 0.04, bounds.center[1])
    this.editorAidGroup.add(grid)
    const axes = new THREE.AxesHelper(Math.max(30, size * 0.08))
    axes.position.set(bounds.center[0], 0.06, bounds.center[1])
    this.editorAidGroup.add(axes)
  }

  private clearEditorAids(): void {
    while (this.editorAidGroup.children.length) {
      const child = this.editorAidGroup.children[0]
      this.editorAidGroup.remove(child)
      child.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          node.geometry.dispose()
          const material = node.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
    }
  }

  private disposeHighlights(): void {
    while (this.highlightGroup.children.length) {
      const child = this.highlightGroup.children[0]
      this.highlightGroup.remove(child)
      child.traverse((node) => {
        if (node instanceof THREE.Line || node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const material = node.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
    }
  }

  private lineHighlight(points: [number, number][]): void {
    if (points.length < 2) return
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 1.2, z)))
    const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: COLORS.selectedEdge, linewidth: 2 }))
    this.highlightGroup.add(line)
  }

  private buildSelectionHighlight(): void {
    this.disposeHighlights()
    const selection = this.editorSelection
    if (!selection || !this.data) return
    if (selection.kind === 'building') {
      const building = this.data.buildings[selection.index]
      if (building) this.lineHighlight(buildingPolygon(building))
    } else if (selection.kind === 'road') {
      const road = this.data.roads[selection.index]
      if (road) this.lineHighlight(buildRoadOutline(road.points, road.width + 2))
    } else if (selection.kind === 'road-node') {
      const node = this.data.roadNetwork?.nodes.find((candidate) => candidate.id === selection.id)
      if (node) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(4, 6, 24), new THREE.MeshBasicMaterial({ color: COLORS.selectedEdge, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.set(node.position[0], 1.2, node.position[1])
        this.highlightGroup.add(ring)
      }
    } else if (selection.kind === 'zone') {
      const area = this.data.zones[selection.index]
      if (area) this.lineHighlight(areaPolygon(area))
    } else if (selection.kind === 'water') {
      const area = this.data.waters[selection.index]
      if (area) this.lineHighlight(waterPolygon(area))
    } else if (selection.kind === 'field') {
      const area = this.data.fields[selection.index]
      if (area) this.lineHighlight(areaPolygon(area))
    } else if (selection.kind === 'poi') {
      const rawPoi = this.data.pois[selection.index]
      if (!rawPoi) return
      const poi = resolvedPoi(rawPoi, this.data.buildings)
      if (poi) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4, 32), new THREE.MeshBasicMaterial({ color: COLORS.selectedEdge, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.set(poi.position[0], 1.2, poi.position[2])
        this.highlightGroup.add(ring)
      }
    }
  }

  private selectionGroundPoint(selection: Selection): THREE.Vector3 | null {
    if (!selection) return null
    if (selection.kind === 'building') {
      const b = this.data.buildings[selection.index]
      return b ? new THREE.Vector3(b.position[0], 0, b.position[1]) : null
    }
    if (selection.kind === 'road') {
      const r = this.data.roads[selection.index]
      return r?.points[0] ? new THREE.Vector3(r.points[0][0], 0, r.points[0][1]) : null
    }
    if (selection.kind === 'road-node') {
      const node = this.data.roadNetwork?.nodes.find((candidate) => candidate.id === selection.id)
      return node ? new THREE.Vector3(node.position[0], 0, node.position[1]) : null
    }
    if (selection.kind === 'poi') {
      const rawPoi = this.data.pois[selection.index]
      if (!rawPoi) return null
      const p = resolvedPoi(rawPoi, this.data.buildings)
      return p ? new THREE.Vector3(p.position[0], 0, p.position[2]) : null
    }
    const list = selection.kind === 'zone' ? this.data.zones : selection.kind === 'water' ? this.data.waters : selection.kind === 'field' ? this.data.fields : null
    const item = list?.[selection.index]
    return item ? new THREE.Vector3(item.center[0], 0, item.center[1]) : null
  }

  private groundPoint(event: PointerEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const point = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null
  }

  private hitEditorSelection(event: PointerEvent, selection: Selection): boolean {
    if (!selection) return false
    if (selection.kind === 'road-node') {
      const node = this.data.roadNetwork?.nodes.find((candidate) => candidate.id === selection.id)
      const point = this.groundPoint(event)
      return !!node && !!point && Math.hypot(point.x - node.position[0], point.z - node.position[1]) <= Math.max(12, this.campusSize * 0.015)
    }
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.clickableObjects, true).some((hit) => {
      const data = hit.object.userData as { kind?: string; index?: number; id?: string }
      if (selection.kind === 'poi') {
        const poi = this.data.pois[selection.index]
        return data.kind === 'poi' && poi?.id === data.id
      }
      return data.kind === selection.kind && data.index === selection.index
    })
  }

  private handlePointerDown(event: PointerEvent): void {
    this.pointerDownScreen = [event.clientX, event.clientY]
    if (!this.editorEditMode || event.button !== 0 || !this.editorSelection) return
    if (!this.hitEditorSelection(event, this.editorSelection)) return
    const point = this.groundPoint(event)
    if (!point || !this.selectionGroundPoint(this.editorSelection)) return
    this.editorDrag = { start: point.clone(), last: point.clone() }
    this.controls.enabled = false
    this.renderer.domElement.setPointerCapture(event.pointerId)
    this.onGroundEdit?.([point.x, point.z], 'start', this.editorSelection)
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.editorDrag || !this.editorSelection) return
    const point = this.groundPoint(event)
    if (!point) return
    this.editorDrag.last.copy(point)
    this.onGroundEdit?.([point.x, point.z], 'move', this.editorSelection)
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.editorDrag && this.editorSelection) {
      const point = this.groundPoint(event) ?? this.editorDrag.last
      this.onGroundEdit?.([point.x, point.z], 'end', this.editorSelection)
      this.editorDrag = null
      this.controls.enabled = !this.editorEditMode
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId)
      return
    }
    if (this.editorEditMode || !this.pointerDownScreen || !this.data) return
    const moved = Math.hypot(event.clientX - this.pointerDownScreen[0], event.clientY - this.pointerDownScreen[1])
    this.pointerDownScreen = null
    if (moved > 5) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.clickableObjects, false)[0]?.object
    const userData = hit?.userData as { kind?: string; index?: number; id?: string } | undefined
    if (userData?.kind === 'building' && typeof userData.index === 'number') this.onSelectionChange?.({ kind: 'building', index: userData.index })
    else if ((userData?.kind === 'road' || userData?.kind === 'zone' || userData?.kind === 'water' || userData?.kind === 'field') && typeof userData.index === 'number' && userData.index >= 0) this.onSelectionChange?.({ kind: userData.kind, index: userData.index })
    else if (userData?.kind === 'poi' && typeof userData.id === 'string') {
      const index = this.data.pois.findIndex((poi) => poi.id === userData.id)
      if (index >= 0) this.onSelectionChange?.({ kind: 'poi', index })
    }
  }

  private disposeGroup(): void {
    while (this.campusGroup.children.length > 0) {
      const child = this.campusGroup.children[0]
      this.campusGroup.remove(child)
      child.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          node.geometry.dispose()
          const m = node.material
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
          else m.dispose()
        }
      })
    }
  }

  setOverviewCamera(): void {
    const rawBounds = deriveCampusBounds(this.data, this.roadDisplayOptions)
    const bounds = { ...rawBounds, width: rawBounds.width + 280, depth: rawBounds.depth + 280 }
    const maxDim = Math.max(bounds.width, bounds.depth)
    const target = new THREE.Vector3(bounds.center[0], 0, bounds.center[1])
    this.controls.target.copy(target)
    this.camera.position.set(target.x - maxDim * 0.72, maxDim * 0.42, target.z + maxDim * 0.68)
    this.camera.near = 10
    this.camera.far = Math.max(5000, maxDim * 4)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  focusBuilding(index: number): void {
    const b = this.data.buildings[index]
    if (!b) return
    const target = new THREE.Vector3(b.position[0], Math.max(8, b.height * 0.55), b.position[1])
    const footprintSize = Math.max(b.size[0], b.size[1])
    const dist = Math.min(260, Math.max(45, footprintSize * 3.2 + b.height * 2))
    this.controls.target.copy(target)
    this.camera.position.set(target.x - dist * 0.7, target.y + dist * 0.8, target.z + dist)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  focusPoi(id: string): void {
    const rawPoi = this.data.pois.find((item) => item.id === id)
    if (!rawPoi) return
    const poi = resolvedPoi(rawPoi, this.data.buildings)
    const target = new THREE.Vector3(...poi.position)
    const dist = Math.max(55, this.campusSize * 0.18)
    this.controls.target.copy(target)
    this.camera.position.set(target.x - dist * 0.7, target.y + dist * 0.8, target.z + dist)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  render(_elapsed: number): void {
    const started = this.metrics.begin()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
    const info = this.renderer.info
    this.metrics.end(started, { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures })
  }

  getRenderMetrics(): RenderMetrics {
    return this.metrics.snapshot()
  }

  resetRenderMetrics(): void {
    this.metrics.reset()
  }

  evaluateRenderBudget(budget: RenderBudget): RenderBudgetResult {
    return evaluateRenderBudget(this.metrics.snapshot(), budget)
  }

  private updateLabels(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    const placed: { x: number; y: number }[] = []
    const minGap = 46
    const level = poiDisplayLevel(this.camera.position.distanceTo(this.controls.target), this.campusSize)
    const ranked = this.labels.map((t) => {
      this.tempVector.set(...t.marker.position).project(this.camera)
      const kindPriority = t.marker.kind === 'landmark' ? 0 : t.marker.kind === 'gate' ? 1 : 2
      return { t, depth: this.tempVector.z, kindPriority, x: ((this.tempVector.x + 1) / 2) * w, y: ((-this.tempVector.y + 1) / 2) * h }
    }).sort((a, b) => a.kindPriority - b.kindPriority || a.depth - b.depth)
    for (const [rank, r] of ranked.entries()) {
      const visible = rank < level.maxLabels && r.depth < 1 && r.depth > -1
      const inside = r.x >= -80 && r.x <= w + 80 && r.y >= -30 && r.y <= h + 30
      const clashes = placed.some((p) => Math.abs(p.x - r.x) < minGap && Math.abs(p.y - r.y) < minGap * 0.5)
      const show = this.displayOptions.showLabels !== false && visible && inside && !clashes
      r.t.element.style.opacity = show ? '1' : '0'
      r.t.element.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)`
      if (show) placed.push({ x: r.x, y: r.y })
    }
  }
}
