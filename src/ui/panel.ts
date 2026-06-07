import type { CampusData } from '../data/campusData'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function renderRouteInfo(data: CampusData, els: { routeName: HTMLElement; routeSteps: HTMLElement; routeLandmarks: HTMLElement }): void {
  const route = data.routes[0]
  if (!route) {
    els.routeName.textContent = '无路线数据'
    els.routeSteps.innerHTML = ''
    els.routeLandmarks.innerHTML = '<span class="chip">无</span>'
    return
  }
  els.routeName.textContent = route.name
  els.routeSteps.innerHTML = route.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')
  els.routeLandmarks.innerHTML = route.landmarks.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join('')
}

export function renderEntityList(data: CampusData, selectedIndex: number, container: HTMLElement): void {
  container.innerHTML = data.buildings.map((b, index) => {
    const selected = index === selectedIndex
    const zoneName = data.zones.find((z) => z.id === b.zoneId)?.name ?? b.zoneId
    return `
      <button type="button" class="entity-item${selected ? ' selected' : ''}" data-kind="building" data-index="${index}">
        <span>
          <strong>${escapeHtml(b.name || b.id || `建筑 ${index + 1}`)}</strong>
          <small>${escapeHtml(b.category)} · ${escapeHtml(zoneName)}</small>
          <small>X ${formatCoordinate(b.position[0])} / Z ${formatCoordinate(b.position[1])} · 高 ${formatCoordinate(b.height)}</small>
        </span>
        <span class="pill">${index + 1}</span>
      </button>`
  }).join('')
}

export function updateSelectionToast(data: CampusData, selectedIndex: number, toast: HTMLElement): void {
  const b = data.buildings[selectedIndex]
  toast.textContent = b ? `已选中建筑：${b.name}` : '未选择对象'
}
