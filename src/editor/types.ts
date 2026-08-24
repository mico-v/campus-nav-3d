export type EntityKind = 'building' | 'road' | 'road-node' | 'zone' | 'water' | 'field' | 'poi'

export type EditorMode = 'select' | 'pan' | 'add-road' | 'reshape' | 'split-merge' | 'area'

export interface GridSettings {
  visible: boolean
  spacing: number
  snap: boolean
  snapDistance: number
  angleSnap: boolean
  angleStep: number
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  visible: true,
  spacing: 10,
  snap: true,
  snapDistance: 8,
  angleSnap: true,
  angleStep: 45,
}

export type Selection =
  | { kind: 'building' | 'road' | 'zone' | 'water' | 'field' | 'poi'; index: number }
  | { kind: 'road-node'; id: string }
  | null

/** Which layers are drawn / hit-testable in the canvas. */
export interface LayerFlags {
  zones: boolean
  roads: boolean
  waters: boolean
  fields: boolean
  buildings: boolean
  pois: boolean
  trees: boolean
}

export function defaultLayerFlags(): LayerFlags {
  return {
    zones: true,
    roads: true,
    waters: true,
    fields: true,
    buildings: true,
    pois: true,
    trees: true,
  }
}
