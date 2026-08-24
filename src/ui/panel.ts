import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { resolvedPoi } from '../scene/displayRules'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function searchEntities(data: CampusData, query: string): Array<{ kind: 'building' | 'poi'; index?: number; id: string; name: string; subtitle: string }> {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []
  const buildings = data.buildings.flatMap((b, index) => {
    const haystack = `${b.name} ${b.id} ${b.category}`.toLocaleLowerCase()
    return haystack.includes(normalized) ? [{ kind: 'building' as const, index, id: b.id, name: b.name, subtitle: `建筑 · ${b.category}` }] : []
  })
  const pois = data.pois.flatMap((poi) => {
    const haystack = `${poi.name} ${poi.id} ${poi.kind}`.toLocaleLowerCase()
    return haystack.includes(normalized) ? [{ kind: 'poi' as const, id: poi.id, name: poi.name, subtitle: `地标 · ${poi.kind}` }] : []
  })
  return [...buildings, ...pois]
}

export function renderEntityList(data: CampusData, selected: { kind: 'building' | 'poi'; index?: number; id?: string } | null, container: HTMLElement, query = ''): void {
  const buildingItems = data.buildings.map((b, index) => ({ kind: 'building' as const, index, id: b.id, name: b.name, subtitle: `${b.category} · ${data.zones.find((z) => z.id === b.zoneId)?.name ?? b.zoneId ?? '未分区'}` }))
  const poiItems = data.pois.map((poi) => ({ kind: 'poi' as const, id: poi.id, name: poi.name, subtitle: `地标 · ${poi.kind}` }))
  const normalized = query.trim().toLocaleLowerCase()
  const items = [...buildingItems, ...poiItems].filter((item) => !normalized || `${item.name} ${item.id} ${item.subtitle}`.toLocaleLowerCase().includes(normalized))
  container.innerHTML = items.map((item) => {
    const active = selected?.kind === item.kind && (item.kind === 'building' ? selected.index === item.index : selected.id === item.id)
    return `<button type="button" class="entity-item${active ? ' selected' : ''}" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}>
      <span><strong>${escapeHtml(item.name || item.id)}</strong><small>${escapeHtml(item.subtitle)}</small></span><span class="pill">${item.kind === 'building' ? '建筑' : 'POI'}</span>
    </button>`
  }).join('') || '<p class="empty-state">没有匹配对象</p>'
}

export function renderDetails(data: CampusData, selected: { kind: 'building' | 'poi'; index?: number; id?: string } | null, container: HTMLElement): void {
  const rawItem: Building | PoiMarker | undefined = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  const item: Building | PoiMarker | undefined = rawItem && 'kind' in rawItem ? resolvedPoi(rawItem, data.buildings) : rawItem
  if (!item) { container.innerHTML = '<p class="empty-state">点击地图或搜索结果查看详情。</p>'; return }
  if ('category' in item && 'height' in item) {
    const zone = data.zones.find((z) => z.id === item.zoneId)?.name ?? item.zoneId ?? '未分区'
    container.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p class="detail-meta">建筑 · ${escapeHtml(item.category)} · ${escapeHtml(zone)}</p><p>${escapeHtml(item.info ?? '暂无简介')}</p><dl><div><dt>位置</dt><dd>X ${formatCoordinate(item.position[0])} / Z ${formatCoordinate(item.position[1])}</dd></div><div><dt>高度</dt><dd>${formatCoordinate(item.height)}</dd></div></dl>`
  } else {
    container.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p class="detail-meta">POI · ${escapeHtml(item.kind)}</p><p>${escapeHtml(item.info ?? '暂无简介')}</p><p class="detail-meta">位置 X ${formatCoordinate(item.position[0])} / Z ${formatCoordinate(item.position[2])}</p>`
  }
}

export function updateSelectionToast(data: CampusData, selected: { kind: 'building' | 'poi'; index?: number; id?: string } | null, toast: HTMLElement): void {
  const item = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  toast.textContent = item ? `已选中${selected?.kind === 'building' ? '建筑' : '地标'}：${item.name}` : '未选择对象'
}
