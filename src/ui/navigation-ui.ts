/**
 * M5-B 导航 UI：起终点选择 + 摘要卡 + 地图高亮线。
 * 与建筑详情面板（M5-A）互不干涉：这里是独立浮层，不改 scene / editor。
 */
import * as THREE from 'three'
import type { CampusData } from '../data/campusData'
import type { PickedEntity } from '../interaction'
import type { RouteSummary, RouteError } from '../navigation/route'
import { buildingAnchorId, formatRouteSummary, isNavigationMode, NAVIGATION_MODE_LABELS } from '../navigation/route'
import type { NavigationMode } from '../navigation/types'
import { escapeHtml } from './panel'

export interface NavigationRouteState {
  origin: number | null
  via: number[]
  destination: number | null
  summary: RouteSummary | null
  error: RouteError | null
  mode: NavigationMode
}

export const MAX_VIA_COUNT = 5

export interface NavigationUiHandlers {
  onRouteRequest: (origin: number, via: number[], destination: number, mode: NavigationMode) => void
  onModeChange: (mode: NavigationMode) => void
  onClear: () => void
  onPickModeChange: (mode: 'origin' | 'destination' | null) => void
}

export interface NavigationUi {
  update: (data: CampusData, state: NavigationRouteState) => void
  setPickMode: (mode: 'origin' | 'destination' | null) => void
  setMode: (mode: NavigationMode) => void
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
      <div class="nav-via" id="nav-via" aria-label="途经点">
        <div class="nav-via-head"><span class="nav-via-title">途经点</span><button type="button" id="nav-via-add" class="nav-via-add">+ 添加途经点</button></div>
        <div class="nav-via-list" id="nav-via-list"></div>
        <p class="nav-via-tip" id="nav-via-tip" hidden></p>
      </div>
      <div class="nav-modes" id="nav-modes" role="group" aria-label="出行模式">
        <button type="button" data-mode="pedestrian" class="nav-mode active" aria-pressed="true">步行</button>
        <button type="button" data-mode="bicycle" class="nav-mode" aria-pressed="false">骑行</button>
        <button type="button" data-mode="vehicle" class="nav-mode" aria-pressed="false">车行</button>
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
  const viaList = host.querySelector<HTMLElement>('#nav-via-list')!
  const viaAddBtn = host.querySelector<HTMLButtonElement>('#nav-via-add')!
  const viaTip = host.querySelector<HTMLElement>('#nav-via-tip')!
  const hint = host.querySelector<HTMLElement>('#nav-hint')!
  const summaryEl = host.querySelector<HTMLElement>('#nav-summary')!
  const pickOriginBtn = host.querySelector<HTMLButtonElement>('#nav-pick-origin')!
  const pickDestinationBtn = host.querySelector<HTMLButtonElement>('#nav-pick-destination')!
  const modeButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('#nav-modes [data-mode]'))
  let pickMode: 'origin' | 'destination' | null = null
  let cachedData: CampusData | null = null
  let cachedState: NavigationRouteState | null = null
  let cachedOptions = ''
  let viaInitialized = false

  const setMode = (mode: NavigationMode): void => {
    if (!cachedState || !isNavigationMode(mode) || mode === cachedState.mode) return
    cachedState = { ...cachedState, mode }
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    })
    handlers.onModeChange(mode)
  }

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
    cachedOptions = options
    originSelect.innerHTML = `<option value="">选择起点建筑</option>${options}`
    destinationSelect.innerHTML = `<option value="">选择终点建筑</option>${options}`
    originSelect.value = state.origin === null ? '' : String(state.origin)
    destinationSelect.value = state.destination === null ? '' : String(state.destination)
    originSelect.classList.toggle('is-set', state.origin !== null)
    destinationSelect.classList.toggle('is-set', state.destination !== null)
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.mode
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    })
    const count = viaList.querySelectorAll('[data-via-row]').length
    const atLimit = count >= MAX_VIA_COUNT
    viaAddBtn.disabled = atLimit
    viaTip.hidden = !atLimit
    viaTip.textContent = atLimit ? `最多添加 ${MAX_VIA_COUNT} 个途经点` : ''
    hint.textContent = pickMode
      ? `点击地图选${pickMode === 'origin' ? '起点' : '终点'}`
      : state.origin !== null && state.destination !== null ? `已规划 · ${NAVIGATION_MODE_LABELS[state.mode]}` : '选起点 → 选终点'
  }

  const dataHasBuilding = (data: CampusData, index: number): boolean => Boolean(data.buildings[index])

  /** 只认 DOM 顺序：重排不维护独立数组，提交/校验前现读，避免出现两份真相。 */
  const readVia = (): number[] => Array.from(viaList.querySelectorAll<HTMLSelectElement>('[data-via-row] select'))
    .map((select) => (select.value === '' ? -1 : Number(select.value)))
    .filter((index) => index >= 0)

  /** 起点/终点的当前 DOM 值；via 里不许选同样的楼，下拉里直接标灰。 */
  const blockedIndexes = (): Set<number> => new Set(
    [originSelect.value, destinationSelect.value].filter((value) => value !== '').map(Number),
  )

  const refreshViaAvailability = (): void => {
    for (const select of viaList.querySelectorAll<HTMLSelectElement>('[data-via-row] select')) {
      const blocked = blockedIndexes()
      for (const option of Array.from(select.options)) {
        if (option.value === '') continue
        option.disabled = blocked.has(Number(option.value)) || cachedData === null
          || buildingAnchorId(cachedData, Number(option.value)) === null
      }
      // 当前值撞上起终点时清空，且不把冲突交给引擎。
      if (blocked.has(Number(select.value))) select.value = ''
    }
  }

  const requestRoute = (): void => {
    const viaIndexes = readVia()
    const blocked = blockedIndexes()
    if (viaIndexes.some((index) => blocked.has(index))) return
    handlers.onRouteRequest(
      originSelect.value === '' ? -1 : Number(originSelect.value),
      viaIndexes,
      destinationSelect.value === '' ? -1 : Number(destinationSelect.value),
      cachedState?.mode ?? 'pedestrian',
    )
  }

  const renderSummary = (state: NavigationRouteState): void => {
    if (state.error) {
      summaryEl.hidden = false
      summaryEl.dataset.state = 'error'
      summaryEl.innerHTML = `<p class="nav-error" role="status">${escapeHtml(state.error.message)}</p>`
      return
    }
    const summary = state.summary
    if (!summary || state.origin === null || state.destination === null) {
      summaryEl.hidden = true
      summaryEl.removeAttribute('data-state')
      summaryEl.innerHTML = ''
      return
    }
    const formatted = formatRouteSummary(summary)
    summaryEl.hidden = false
    summaryEl.removeAttribute('data-state')
    summaryEl.innerHTML = `
      <p class="nav-mode-now">当前模式：${escapeHtml(formatted.mode)}</p>
      ${state.via.length ? `<p class="nav-via-count" data-via-count="${state.via.length}">途经 ${state.via.length} 站</p>` : ''}
      <div class="nav-metrics"><span><strong>${formatted.distance}</strong><small>距离</small></span><span><strong>${formatted.duration}</strong><small>预计用时</small></span></div>
      <p class="nav-stops"><span>途经节点</span>${escapeHtml(formatted.stops)}</p>`
  }

  const addViaRow = (selected?: number): void => {
    if (cachedData === null || viaList.querySelectorAll('[data-via-row]').length >= MAX_VIA_COUNT) return
    const row = document.createElement('div')
    row.className = 'nav-via-row'
    row.dataset.viaRow = ''
    row.innerHTML = `
      <select class="nav-via-select" aria-label="途经点建筑"><option value="">选择途经点建筑</option>${cachedOptions}</select>
      <button type="button" class="nav-via-move" data-action="up" aria-label="上移途经点" title="上移">↑</button>
      <button type="button" class="nav-via-move" data-action="down" aria-label="下移途经点" title="下移">↓</button>
      <button type="button" class="nav-via-remove" data-action="remove" aria-label="删除途经点" title="删除">×</button>`
    viaList.appendChild(row)
    const select = row.querySelector<HTMLSelectElement>('.nav-via-select')!
    if (selected !== undefined && dataHasBuilding(cachedData, selected)) select.value = String(selected)
    refreshViaAvailability()
    if (cachedState) renderOptions(cachedData, cachedState)
  }

  const clearViaRows = (): void => {
    viaList.innerHTML = ''
    if (cachedData && cachedState) renderOptions(cachedData, cachedState)
  }

  viaAddBtn.addEventListener('click', () => addViaRow())
  viaList.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement) || !target.closest('[data-via-row]')) return
    requestRoute()
  })
  viaList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    const row = target.closest<HTMLElement>('[data-via-row]')
    if (!row) return
    const action = target.dataset.action
    if (action === 'remove') {
      row.remove()
      if (cachedData && cachedState) renderOptions(cachedData, cachedState)
    } else if (action === 'up' || action === 'down') {
      const sibling = action === 'up' ? row.previousElementSibling : row.nextElementSibling
      if (!sibling) return
      if (action === 'up') viaList.insertBefore(row, sibling)
      else viaList.insertBefore(sibling, row)
    }
  })

  originSelect.addEventListener('change', () => { refreshViaAvailability(); requestRoute() })
  destinationSelect.addEventListener('change', () => { refreshViaAvailability(); requestRoute() })
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode
      if (isNavigationMode(mode)) setMode(mode)
    })
  })
  pickOriginBtn.addEventListener('click', () => setPickMode(pickMode === 'origin' ? null : 'origin'))
  pickDestinationBtn.addEventListener('click', () => setPickMode(pickMode === 'destination' ? null : 'destination'))
  host.querySelector<HTMLButtonElement>('#nav-clear')!.addEventListener('click', () => {
    clearViaRows()
    setPickMode(null)
    handlers.onClear()
  })

  return {
    update(data, state) {
      cachedData = data
      cachedState = state
      if (!viaInitialized) {
        viaInitialized = true
        for (const index of state.via.slice(0, MAX_VIA_COUNT)) addViaRow(index)
      }
      renderOptions(data, state)
      renderSummary(state)
    },
    setPickMode,
    setMode,
    pickMode: () => pickMode,
    setRoute(route) {
      if (!cachedState || !cachedData) return
      cachedState = { ...cachedState, summary: route, error: route ? null : { code: 'unreachable', message: '这两栋建筑之间不可达，请换一个终点' } }
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
