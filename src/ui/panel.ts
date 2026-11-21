import type { Building, CampusData, PoiMarker } from '../data/campusData'
import { resolvedPoi } from '../scene/displayRules'
import { buildingFields, type BuildingDetailFields } from './detail-fields'

export type EntitySelection = { kind: 'building' | 'poi'; index?: number; id?: string }
export type EntityFilter = 'all' | 'building' | 'poi' | Building['category']

export const ENTITY_FILTERS: Array<{ key: EntityFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'building', label: '建筑' },
  { key: 'academic', label: '教学' },
  { key: 'dorm', label: '宿舍' },
  { key: 'service', label: '服务' },
  { key: 'poi', label: '地标' },
]

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

export function renderFilterChips(container: HTMLElement, active: EntityFilter): void {
  container.innerHTML = ENTITY_FILTERS.map((filter) => `<button type="button" class="chip${filter.key === active ? ' active' : ''}" data-filter="${filter.key}" aria-pressed="${filter.key === active}">${filter.label}</button>`).join('')
}

function entityItems(data: CampusData): Array<{ kind: 'building' | 'poi'; index?: number; id: string; name: string; subtitle: string; category: string }> {
  return [
    ...data.buildings.map((b, index) => {
      const fields = buildingFields(data, b)
      return { kind: 'building' as const, index, id: fields.id, name: fields.name, subtitle: `${fields.category} · ${fields.zone}`, category: b.category }
    }),
    ...data.pois.map((poi) => ({ kind: 'poi' as const, id: poi.id, name: poi.name, subtitle: `地标 · ${poi.kind}`, category: poi.kind })),
  ]
}

interface FilterableEntity { kind: 'building' | 'poi'; id: string; name: string; subtitle: string; category: string; index?: number }

export function filterEntities<T extends FilterableEntity>(items: T[], filter: EntityFilter): T[] {
  if (filter === 'all') return items
  if (filter === 'building') return items.filter((item) => item.kind === 'building')
  if (filter === 'poi') return items.filter((item) => item.kind === 'poi')
  return items.filter((item) => item.kind === 'building' && item.category === filter)
}

export function renderEntityList(data: CampusData, selected: EntitySelection | null, container: HTMLElement, query = '', filter: EntityFilter = 'all'): void {
  const normalized = query.trim().toLocaleLowerCase()
  const items = filterEntities(entityItems(data), filter).filter((item) => !normalized || `${item.name} ${item.id} ${item.subtitle}`.toLocaleLowerCase().includes(normalized))
  container.innerHTML = items.map((item) => {
    const active = selected?.kind === item.kind && (item.kind === 'building' ? selected.index === item.index : selected.id === item.id)
    return `<button type="button" class="entity-item${active ? ' selected' : ''}" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}>
      <span><strong>${escapeHtml(item.name || item.id)}</strong><small>${escapeHtml(item.subtitle)}</small></span><span class="pill">${item.kind === 'building' ? '建筑' : 'POI'}</span>
    </button>`
  }).join('') || '<p class="empty-state">没有匹配对象</p>'
}

/** 详情面板的建筑正文；列表与详情共用 buildingFields 的结果。 */
export function renderBuildingFields(fields: BuildingDetailFields): string {
  const facts: Array<[string, string]> = [
    ['名称', fields.name],
    ['类别', fields.category],
    ['分区', fields.zone],
    ['坐标', fields.coordinate],
    ['高度', fields.height],
    ['楼层', fields.floorSummary],
    ['室内入口', fields.entrance],
    ['设施', fields.facilitySummary],
  ]
  return `<h3 class="detail-building-title">${escapeHtml(fields.name)}</h3><p class="detail-meta">建筑 · ${escapeHtml(fields.category)} · ${escapeHtml(fields.zone)}</p><p class="detail-fact">${escapeHtml(fields.info)}</p><dl class="detail-facts-building">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`
}

export function renderDetails(data: CampusData, selected: EntitySelection | null, container: HTMLElement): void {
  const rawItem: Building | PoiMarker | undefined = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  const item: Building | PoiMarker | undefined = rawItem && 'kind' in rawItem ? resolvedPoi(rawItem, data.buildings) : rawItem
  if (!item) { container.innerHTML = '<p class="empty-state">点击地图或搜索结果查看详情。</p>'; return }
  if ('category' in item && 'height' in item) {
    const fields = buildingFields(data, item)
    container.innerHTML = renderBuildingFields(fields)
  } else {
    container.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p class="detail-meta">POI · ${escapeHtml(item.kind)}</p><p class="detail-fact">${escapeHtml(item.info ?? '暂无简介')}</p><p class="detail-meta">位置 X ${formatCoordinate(item.position[0])} / Z ${formatCoordinate(item.position[2])}</p>`
  }
}

export function updateSelectionToast(data: CampusData, selected: EntitySelection | null, toast: HTMLElement): void {
  const item = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  toast.textContent = item ? `已选中${selected?.kind === 'building' ? '建筑' : '地标'}：${item.name}` : '未选择对象'
}
