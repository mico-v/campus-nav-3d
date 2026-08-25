import campusJson from './campus.json'
import { normalizeCampusData } from './roadNormalization'
import { validateCampusDataValue } from './campusValidation'
import type { RoadAccess, RoadClass, RoadNetwork, RoadSurface } from './roadNetwork'

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
  footprint?: [number, number][]
}

export interface Building {
  id: string
  name: string
  category: BuildingCategory
  position: [number, number]
  size: [number, number]
  height: number
  color?: string
  /** Optional until the campus is subdivided into authoritative zones. */
  zoneId?: string
  footprint?: [number, number][]
  info?: string
}

export interface Road {
  id: string
  /** Optional human-readable label; id remains the stable routing key. */
  name?: string
  points: [number, number][]
  width: number
  color?: string
  /** Optional explicit display classification; legacy data falls back to id rules. */
  kind?: 'graph' | 'road' | 'canal'
  roadClass?: RoadClass
  surface?: RoadSurface
  access?: RoadAccess
  oneWay?: boolean
  speed?: number
  sidewalk?: boolean
  /** IDs of legacy/source records represented by this canonical road. */
  sourceIds?: string[]
  /** Routing/debug provenance; never rendered as an additional road. */
  routing?: { sourceIds: string[] }
}

export interface WaterBody {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  footprint?: [number, number][]
}

export interface FieldArea {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  stripeColor?: string
  footprint?: [number, number][]
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

/** Static, editable map data. Navigation results are runtime-only and are not persisted here. */
export interface MapDataset {
  name: string
  bounds: { width: number; depth: number }
  zones: Zone[]
  buildings: Building[]
  roads: Road[]
  /** Explicit routable topology; legacy imports may omit it until normalization. */
  roadNetwork?: RoadNetwork
  waters: WaterBody[]
  fields: FieldArea[]
  trees: [number, number][]
  pois: PoiMarker[]
}

/** Backwards-compatible name used by the editor and renderer. */
export type CampusData = MapDataset

/** Data after import normalization; this is the shape used by rendering and navigation. */
export type CanonicalCampusData = Omit<MapDataset, 'roadNetwork'> & { roadNetwork: RoadNetwork }

// Sources: graph positions and connectivity from ZDaneel/usts-navigation-graph commit 6f251d8;
// named OpenStreetMap building footprints are fitted into the graph coordinate system using matched landmarks.
const baseCampusData: CampusData = campusJson as unknown as CampusData

export function cloneCampusData(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}

export function createDefaultCampusData(): CanonicalCampusData {
  return normalizeCampusData(cloneCampusData(baseCampusData))
}

/** Return actionable errors before an edited dataset is serialized. */
export function validateCampusData(data: CampusData): string[] {
  return validateCampusDataValue(data)
}
