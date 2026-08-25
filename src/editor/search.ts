import type { CampusData } from '../data/campusData'
import type { Selection } from './types'

export interface EditorSearchResult {
  selection: Selection
  label: string
  meta: string
  searchText: string
}

const kindLabels = {
  building: '建筑',
  road: '道路',
  zone: '区域',
  water: '水体',
  field: '场地',
  poi: 'POI',
} as const

export function editorSearchResults(data: CampusData, query: string, limit = 12): EditorSearchResult[] {
  const results: EditorSearchResult[] = []
  const add = (kind: keyof typeof kindLabels, index: number, id: string, name?: string): void => {
    const label = name?.trim() || id
    results.push({
      selection: { kind, index },
      label,
      meta: `${kindLabels[kind]} · ${id}`,
      searchText: `${label} ${id} ${kindLabels[kind]}`.toLocaleLowerCase(),
    })
  }
  data.buildings.forEach((item, index) => add('building', index, item.id, item.name))
  data.roads.forEach((item, index) => add('road', index, item.id, item.name))
  data.zones.forEach((item, index) => add('zone', index, item.id, item.name))
  data.waters.forEach((item, index) => add('water', index, item.id, item.name))
  data.fields.forEach((item, index) => add('field', index, item.id, item.name))
  data.pois.forEach((item, index) => add('poi', index, item.id, item.name))

  const term = query.trim().toLocaleLowerCase()
  if (!term) return []
  return results
    .filter((result) => result.searchText.includes(term))
    .sort((a, b) => {
      const aStarts = a.label.toLocaleLowerCase().startsWith(term) || a.meta.toLocaleLowerCase().includes(`· ${term}`)
      const bStarts = b.label.toLocaleLowerCase().startsWith(term) || b.meta.toLocaleLowerCase().includes(`· ${term}`)
      return Number(bStarts) - Number(aStarts) || a.label.localeCompare(b.label, 'zh-CN')
    })
    .slice(0, limit)
}

function indexedSelection(message: string, pattern: RegExp, kind: 'building' | 'zone'): Selection {
  const match = message.match(pattern)
  return match ? { kind, index: Number(match[1]) } : null
}

function sourceRoadSelection(data: CampusData, sourceId: string): Selection {
  const index = data.roads.findIndex((road) => road.id === sourceId || road.sourceIds?.includes(sourceId) || road.routing?.sourceIds.includes(sourceId))
  return index >= 0 ? { kind: 'road', index } : null
}

/** Resolve a validation message to the most useful editable source object. */
export function selectionForValidationError(data: CampusData, message: string): Selection {
  const indexed = indexedSelection(message, /建筑\[(\d+)\]/, 'building') ?? indexedSelection(message, /区域\[(\d+)\]/, 'zone')
  if (indexed) return indexed

  const directKinds = [
    ['道路', 'road', data.roads],
    ['水体', 'water', data.waters],
    ['操场', 'field', data.fields],
    ['POI', 'poi', data.pois],
    ['建筑', 'building', data.buildings],
    ['区域', 'zone', data.zones],
  ] as const
  for (const [prefix, kind, items] of directKinds) {
    const match = message.match(new RegExp(`${prefix} ([^\\s：]+)`))
    if (!match) continue
    const index = items.findIndex((item) => item.id === match[1])
    if (index >= 0) return { kind, index } as Selection
  }

  const nodeId = message.match(/道路节点 ([^\s：]+)/)?.[1]
  if (nodeId && data.roadNetwork?.nodes.some((node) => node.id === nodeId)) return { kind: 'road-node', id: nodeId }

  const segmentId = message.match(/道路段 ([^\s：]+)/)?.[1]
  if (segmentId) {
    const segment = data.roadNetwork?.segments.find((candidate) => candidate.id === segmentId)
    for (const sourceId of segment?.sourceIds ?? []) {
      const selection = sourceRoadSelection(data, sourceId)
      if (selection) return selection
    }
  }

  const sourceId = message.match(/源道路 ([^\s：]+)/)?.[1]
  if (sourceId) return sourceRoadSelection(data, sourceId)

  const duplicateId = message.match(/id 重复：([^\s]+)/)?.[1]
  if (duplicateId) {
    for (const result of editorSearchResults(data, duplicateId, 20)) {
      if (result.meta.endsWith(`· ${duplicateId}`)) return result.selection
    }
  }
  return null
}
