export type EntityKind = 'building' | 'road' | 'zone' | 'water' | 'field' | 'poi' | 'routePoint'

export type Selection =
  | { kind: 'building' | 'road' | 'zone' | 'water' | 'field' | 'poi'; index: number }
  | { kind: 'routePoint'; routeIndex: number; index: number }
  | null

/** Which layers are drawn / hit-testable in the canvas. */
export interface LayerFlags {
  zones: boolean
  roads: boolean
  waters: boolean
  fields: boolean
  buildings: boolean
  pois: boolean
  route: boolean
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
    route: true,
    trees: true,
  }
}
