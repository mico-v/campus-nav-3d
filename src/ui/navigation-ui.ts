/**
 * M5-B 导航 UI：起终点选择 + 摘要卡 + 地图高亮线。
 * 与建筑详情面板（M5-A）互不干涉：这里是独立浮层，不改 scene / editor。
 */
import * as THREE from 'three'
import type { CampusData } from '../data/campusData'
import type { PickedEntity } from '../interaction'
import type { RouteSummary } from '../navigation/route'
import { buildingAnchorId, formatRouteSummary } from '../navigation/route'
import { escapeHtml } from './panel'

export interface NavigationRouteState {
  origin: number | null
  destination: number | null
  summary: RouteSummary | null
  error: string
}

export interface NavigationUiHandlers {
  onRouteRequest: (origin: number, destination: number) => void
  onClear: () => void
  onPickModeChange: (mode: 'origin' | 'destination' | null) => void
}

export interface NavigationUi {
  update: (data: CampusData, state: NavigationRouteState) => void
  setPickMode: (mode: 'origin' | 'destination' | null) => void
  pickMode: () => 'origin' | 'destination' | null
  setRoute: (route: RouteSummary | null) => void
  destroy: () => void
}

/** 在地图场景上叠一层独立的路线高亮（地面折线 + 起终点圈），不动 CampusScene。 */
export interface RouteOverlay {
  setRoute: (route: RouteSummary | null) => void
  /** 路线包围盒，供相机聚焦；{@link null} 表示没有路线。 */
  bounds: () => { center: [number, number]; size: number } | null
  dispose: () => void
}

export function createRouteOverlay(scene: THREE.Scene): RouteOverlay {
  const group = new THREE.Group()
  group.name = 'm5b-route-overlay'
  scene.add(group)
  const clear = (): void => {
    while (group.children.length) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const material = child.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      }
    }
  }
  let bounds: { center: [number, number]; size: number } | null = null
  return {
    bounds: () => bounds,
    setRoute(route) {
      bounds = null
      if (!route || route.geometry.length < 2) return
      const xs = route.geometry.map(([x]) => x)
      const zs = route.geometry.map(([, z]) => z)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minZ = Math.min(...zs), maxZ = Math.max(...zs)
      bounds = { center: [(minX + maxX) / 2, (minZ + maxZ) / 2], size: Math.max(maxX - minX, maxZ - minZ, 24) }
      clear()
      if (!route || route.geometry.length < 2) return
      const points = route.geometry.map(([x, z]) => new THREE.Vector3(x, 14, z))
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      // WebGL 的 linewidth 在多数驱动上恒为 1：叠一条暗色底线 + 亮色主线，
      // 抬高到 14 避免被建筑屋面盖住，俯视和斜视都能一眼看到路线。
      const outline = new THREE.Line(geometry.clone(), new THREE.LineBasicMaterial({ color: '#7f1d1d', linewidth: 7, depthTest: false }))
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#f43f5e', linewidth: 5, depthTest: false }))
      outline.renderOrder = 3
      line.renderOrder = 4
      group.add(outline, line)
      for (const stop of route.stops) {
        const color = stop.role === 'origin' ? '#22c55e' : stop.role === 'destination' ? '#ef4444' : '#f43f5e'
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(5, 8, 32),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(stop.position[0], 14.2, stop.position[1])
        ring.renderOrder = 5
        group.add(ring)
      }
    },
    dispose() {
      clear()
      scene.remove(group)
    },
  }
}

export function mountNavigationUi(host: HTMLElement, handlers: NavigationUiHandlers): NavigationUi {
  host.innerHTML = `
    <section class="card nav-card" aria-label="路线导航">
      <div class="section-head"><h2>路线导航</h2><span class="muted" id="nav-hint">选起点 → 选终点</span></div>
      <div class="nav-legs">
        <label class="nav-leg"><span class="nav-leg-dot origin"></span><select id="nav-origin" aria-label="起点"><option value="">选择起点建筑</option></select></label>
        <label class="nav-leg"><span class="nav-leg-dot destination"></span><select id="nav-destination" aria-label="终点"><option value="">选择终点建筑</option></select></label>
      </div>
      <div class="nav-actions">
        <button type="button" id="nav-pick-origin" class="nav-pick">地图选起点</button>
        <button type="button" id="nav-pick-destination" class="nav-pick">地图选终点</button>
        <button type="button" id="nav-clear" class="nav-clear">清除</button>
      </div>
    </section>
    <aside class="nav-summary" id="nav-summary" aria-label="路线摘要" hidden></aside>`
  const originSelect = host.querySelector<HTMLSelectElement>('#nav-origin')!
  const destinationSelect = host.querySelector<HTMLSelectElement>('#nav-destination')!
  const hint = host.querySelector<HTMLElement>('#nav-hint')!
  const summaryEl = host.querySelector<HTMLElement>('#nav-summary')!
  const pickOriginBtn = host.querySelector<HTMLButtonElement>('#nav-pick-origin')!
  const pickDestinationBtn = host.querySelector<HTMLButtonElement>('#nav-pick-destination')!
  let pickMode: 'origin' | 'destination' | null = null
  let cachedData: CampusData | null = null
  let cachedState: NavigationRouteState | null = null

  const setPickMode = (mode: 'origin' | 'destination' | null): void => {
    pickMode = mode
    pickOriginBtn.classList.toggle('active', mode === 'origin')
    pickDestinationBtn.classList.toggle('active', mode === 'destination')
    host.dataset.pickMode = mode ?? 'off'
    handlers.onPickModeChange(mode)
  }

  const renderOptions = (data: CampusData, state: NavigationRouteState): void => {
    const options = data.buildings.map((building, index) =>
      `<option value="${index}"${buildingAnchorId(data, index) === null ? ' disabled' : ''}>${escapeHtml(building.name)}</option>`,
    ).join('')
    originSelect.innerHTML = `<option value="">选择起点建筑</option>${options}`
    destinationSelect.innerHTML = `<option value="">选择终点建筑</option>${options}`
    originSelect.value = state.origin === null ? '' : String(state.origin)
    destinationSelect.value = state.destination === null ? '' : String(state.destination)
    originSelect.classList.toggle('is-set', state.origin !== null)
    destinationSelect.classList.toggle('is-set', state.destination !== null)
    hint.textContent = pickMode
      ? `点击地图选${pickMode === 'origin' ? '起点' : '终点'}`
      : state.origin !== null && state.destination !== null ? '已规划' : '选起点 → 选终点'
  }

  const renderSummary = (state: NavigationRouteState): void => {
    if (state.error) {
      summaryEl.hidden = false
      summaryEl.innerHTML = `<p class="nav-error">${escapeHtml(state.error)}</p>`
      return
    }
    const summary = state.summary
    if (!summary || state.origin === null || state.destination === null) {
      summaryEl.hidden = true
      summaryEl.innerHTML = ''
      return
    }
    const formatted = formatRouteSummary(summary)
    summaryEl.hidden = false
    summaryEl.innerHTML = `
      <div class="nav-metrics"><span><strong>${formatted.distance}</strong><small>距离</small></span><span><strong>${formatted.duration}</strong><small>预计用时</small></span></div>
      <p class="nav-stops"><span>途经节点</span>${escapeHtml(formatted.stops)}</p>`
  }

  originSelect.addEventListener('change', () => {
    handlers.onRouteRequest(originSelect.value === '' ? -1 : Number(originSelect.value), cachedState?.destination ?? -1)
  })
  destinationSelect.addEventListener('change', () => {
    handlers.onRouteRequest(cachedState?.origin ?? -1, destinationSelect.value === '' ? -1 : Number(destinationSelect.value))
  })
  pickOriginBtn.addEventListener('click', () => setPickMode(pickMode === 'origin' ? null : 'origin'))
  pickDestinationBtn.addEventListener('click', () => setPickMode(pickMode === 'destination' ? null : 'destination'))
  host.querySelector<HTMLButtonElement>('#nav-clear')!.addEventListener('click', () => { setPickMode(null); handlers.onClear() })

  return {
    update(data, state) {
      cachedData = data
      cachedState = state
      renderOptions(data, state)
      renderSummary(state)
    },
    setPickMode,
    pickMode: () => pickMode,
    setRoute(route) {
      if (!cachedState || !cachedData) return
      cachedState = { ...cachedState, summary: route, error: route ? '' : '两点间没有可通行的路线' }
      renderSummary(cachedState)
      renderOptions(cachedData, cachedState)
    },
    destroy() { host.innerHTML = '' },
  }
}

/** 地图点选的建筑 → 导航可用的建筑索引；POI / 道路不是合法起终点。 */
export function navigationPickEntity(entity: PickedEntity | null): number | null {
  return entity?.kind === 'building' ? entity.index : null
}
