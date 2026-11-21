/**
 * M5-A：建筑详情字段的单一视图模型。
 * 列表项与详情面板都从这里取值，避免两处各写一套字段回落逻辑。
 */
import type { Building, CampusData } from '../data/campusData'
import { indoorLevelsOf, type IndoorLevelOption } from './indoor-levels'

export const CATEGORY_LABELS: Record<string, string> = {
  dorm: '宿舍',
  academic: '教学',
  landscape: '景观',
  sports: '体育',
  service: '服务',
  admin: '行政',
  library: '图书馆',
  gate: '校门',
  canteen: '食堂',
  poi: '兴趣点',
}

const FALLBACK = {
  info: '暂无简介',
  zone: '未分区',
  category: '未分类',
  height: '—',
  facilities: '暂无设施信息',
  entrance: '暂无入口信息',
} as const

export interface BuildingDetailFields {
  id: string
  name: string
  category: string
  zone: string
  info: string
  coordinate: string
  height: string
  floors: IndoorLevelOption[]
  floorSummary: string
  entrance: string
  entranceLevel: number | null
  facilities: string[]
  facilitySummary: string
}

function coordinateOf(building: Building): string {
  const [x, z] = building.position
  return `X ${formatNumber(x)} / Z ${formatNumber(z)}`
}

function formatNumber(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function floorSummaryOf(levels: IndoorLevelOption[]): string {
  if (!levels.length) return '无楼层数据'
  return levels.map((level) => level.label).join(' · ')
}

function entranceLevelOf(building: Building, levels: IndoorLevelOption[]): number | null {
  const entrance = building.entrance
  if (entrance && typeof entrance.level === 'number' && levels.some((level) => level.level === entrance.level)) {
    return entrance.level
  }
  return levels.length ? levels[0].level : null
}

function entranceOf(building: Building, levels: IndoorLevelOption[]): string {
  const entrance = building.entrance
  if (entrance) {
    const parts: string[] = []
    if (entrance.name) parts.push(entrance.name)
    if (typeof entrance.level === 'number') {
      const label = levels.find((level) => level.level === entrance.level)?.label
      if (label) parts.push(label)
      else if (levels.length) parts.push(`L${entrance.level}`)
    }
    if (Array.isArray(entrance.position) && entrance.position.length >= 2) {
      parts.push(`X ${formatNumber(entrance.position[0])} / Z ${formatNumber(entrance.position[1])}`)
    }
    if (parts.length) return parts.join(' · ')
  }
  if (levels.length) return `${levels[0].label} · 室内入口`
  return FALLBACK.entrance
}

/** 返回建筑视图模型；字段缺失一律回落为可读文案，不抛错。 */
export function buildingFields(data: CampusData, building: Building): BuildingDetailFields {
  const floors = indoorLevelsOf(building)
  const facilities = Array.isArray(building.facilities) ? building.facilities.filter((item) => typeof item === 'string' && item.trim()) : []
  return {
    id: building.id,
    name: building.name || building.id,
    category: CATEGORY_LABELS[building.category] ?? building.category ?? FALLBACK.category,
    zone: data.zones.find((zone) => zone.id === building.zoneId)?.name ?? building.zoneId ?? FALLBACK.zone,
    info: building.info?.trim() || FALLBACK.info,
    coordinate: coordinateOf(building),
    height: Number.isFinite(building.height) ? formatNumber(building.height) : FALLBACK.height,
    floors,
    floorSummary: floorSummaryOf(floors),
    entrance: entranceOf(building, floors),
    entranceLevel: entranceLevelOf(building, floors),
    facilities,
    facilitySummary: facilities.length ? facilities.join(' · ') : FALLBACK.facilities,
  }
}
