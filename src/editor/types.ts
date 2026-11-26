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
  /** 室内房间：位置由 buildingId + floorLevel + roomId 三段确定，不能用下标（楼层增删会错位） */
  | { kind: 'room'; buildingId: string; floorLevel: number; roomId: string }
  | null

/** 选择的稳定标识：房间用三段 id 拼，其余用下标。改了这里，form/scene/store 一起受益。 */
export function selectionKey(selection: Selection): string {
  if (!selection) return 'none'
  switch (selection.kind) {
    case 'road-node':
      return `${selection.kind}:${selection.id}`
    case 'room':
      return `${selection.kind}:${selection.buildingId}:${selection.floorLevel}:${selection.roomId}`
    default:
      return `${selection.kind}:${selection.index}`
  }
}

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
