import rawData from './campusData.json'

export type ZoneCategory = 'dorm' | 'academic' | 'landscape' | 'sports' | 'service' | 'admin'

export const buildingCategoryOptions = [
  'dorm',
  'academic',
  'landscape',
  'sports',
  'service',
  'admin',
  'library',
  'gate',
  'canteen',
  'poi',
] as const

export type BuildingCategory = (typeof buildingCategoryOptions)[number]

export interface Zone {
  id: string
  name: string
  category: ZoneCategory
  center: [number, number]
  size: [number, number]
  color: string
}

export interface Building {
  id: string
  name: string
  category: BuildingCategory
  position: [number, number]
  size: [number, number]
  height: number
  color?: string
  zoneId: string
  footprint?: [number, number][]
  info?: string
}

export interface Road {
  id: string
  points: [number, number][]
  width?: number
  color?: string
}

export interface WaterBody {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
}

export interface FieldArea {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  stripeColor?: string
}

export interface PoiMarker {
  id: string
  name: string
  kind: 'landmark' | 'service' | 'gate'
  position: [number, number, number]
  color?: string
  sourceBuildingId?: string
  info?: string
}

export interface RouteDefinition {
  id: string
  name: string
  points: [number, number, number][]
  steps: string[]
  landmarks: string[]
}

export interface CampusData {
  name: string
  bounds: { width: number; depth: number }
  zones: Zone[]
  buildings: Building[]
  roads: Road[]
  waters: WaterBody[]
  fields: FieldArea[]
  trees: [number, number][]
  pois: PoiMarker[]
  routes: RouteDefinition[]
}

const baseCampusData = rawData as CampusData

export function cloneCampusData(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}

export function createDefaultCampusData(): CampusData {
  return cloneCampusData(baseCampusData)
}

export const campusData = createDefaultCampusData()
