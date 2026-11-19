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

/** 详情卡头部用的标题信息；没选中就是 null，主程序据此收起卡片。 */
export interface SelectionSummary {
  name: string
  subtitle: string
}

/** 详情卡固定四区块（design-overview-v2 §6.3）：概览 / 活动 / 提示 / 路线。 */
export const DETAIL_BLOCKS = ['overview', 'activity', 'notice', 'route'] as const

function block(key: typeof DETAIL_BLOCKS[number], title: string, summary: string, content: string, open: boolean): string {
  return `<details class="dc-block" data-block="${key}"${open ? ' open' : ''}><summary><span>${title}</span><span class="dc-summary">${summary}</span></summary><div class="dc-content">${content}</div></details>`
}

/**
 * 渲染详情卡主体，返回标题信息给卡片头。
 * 活动 / 路线现在是空态占位——不编造数据，等 M2 接后端与寻路再填。
 */
export function renderDetails(data: CampusData, selected: { kind: 'building' | 'poi'; index?: number; id?: string } | null, container: HTMLElement): SelectionSummary | null {
  const rawItem: Building | PoiMarker | undefined = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  const item: Building | PoiMarker | undefined = rawItem && 'kind' in rawItem ? resolvedPoi(rawItem, data.buildings) : rawItem
  if (!item) {
    container.innerHTML = '<p class="empty-state">点击地图或搜索结果查看详情。</p>'
    return null
  }
  const isBuilding = 'category' in item && 'height' in item
  let summary: SelectionSummary
  let overview: string
  if (isBuilding) {
    const building = item as Building
    const zone = data.zones.find((z) => z.id === building.zoneId)?.name ?? building.zoneId ?? '未分区'
    const size = `占地 ${formatCoordinate(building.size[0])} × ${formatCoordinate(building.size[1])}`
    summary = { name: building.name, subtitle: `建筑 · ${building.category} · ${zone}` }
    overview = `<dl class="dc-facts"><div><dt>类型</dt><dd>建筑 · ${escapeHtml(building.category)}</dd></div><div><dt>分区</dt><dd>${escapeHtml(zone)}</dd></div><div><dt>位置</dt><dd>X ${formatCoordinate(building.position[0])} / Z ${formatCoordinate(building.position[1])}</dd></div><div><dt>体量</dt><dd>${size} · 高 ${formatCoordinate(building.height)}</dd></div></dl>`
  } else {
    const poi = item as PoiMarker
    summary = { name: poi.name, subtitle: `地标 · ${poi.kind}` }
    overview = `<dl class="dc-facts"><div><dt>类型</dt><dd>地标 · ${escapeHtml(poi.kind)}</dd></div><div><dt>位置</dt><dd>X ${formatCoordinate(poi.position[0])} / Z ${formatCoordinate(poi.position[2])}</dd></div></dl>`
  }
  const notice = item.info?.trim()
  container.innerHTML = [
    block('overview', '概览', summary.subtitle, overview, true),
    // 地点级活动与提示要到 M2 接后端才有真数据，这里只留结构，不填假内容。
    block('activity', '活动', '暂无', '<p class="empty-state">暂无活动</p>', false),
    block('notice', '提示', notice ? '有' : '暂无', notice ? `<p>${escapeHtml(notice)}</p>` : '<p class="empty-state">暂无提示</p>', Boolean(notice)),
    block('route', '路线', '待接入', '<p class="empty-state">路线规划待接入（M2）</p>', false),
  ].join('')
  return summary
}

export function updateSelectionToast(data: CampusData, selected: { kind: 'building' | 'poi'; index?: number; id?: string } | null, toast: HTMLElement): void {
  const item = selected?.kind === 'building' ? data.buildings[selected.index ?? -1] : data.pois.find((poi) => poi.id === selected?.id)
  toast.textContent = item ? `已选中${selected?.kind === 'building' ? '建筑' : '地标'}：${item.name}` : '未选择对象'
}
