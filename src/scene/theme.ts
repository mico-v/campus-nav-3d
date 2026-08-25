// Apple 地图风：低饱和柔和配色 + Y 层级栈（避免共面 z-fighting）。
export const LAYER = {
  // Keep the ground below all authored map layers and building footprints.
  // This avoids coplanar depth competition when the camera moves around a building.
  ground: -0.2,
  zone: 0.02,
  field: 0.08,
  fieldSurface: 0.12,
  water: 0.16,
  roadSidewalk: 0.28,
  roadCasing: 0.34,
  road: 0.42,
  building: 0.5,
  marker: 0.55,
} as const

export const COLORS = {
  background: '#eef3f6',
  ground: '#e7ece3',
  roof: '#fbfcfe',
  roofSelected: '#fff1f2',
  selected: '#fb7185',
  road: '#969da3',
  roadCasing: '#c7ccd0',
  buildingEdge: '#526273',
  selectedEdge: '#be123c',
} as const

// 建筑体色（按类别），柔和低饱和。
export const BUILDING_COLOR: Record<string, string> = {
  dorm: '#2a78d6',
  academic: '#eb6834',
  landscape: '#1baf7a',
  sports: '#eda100',
  service: '#e87ba4',
  admin: '#008300',
  library: '#4a3aa7',
  gate: '#e34948',
  canteen: '#64748b',
  poi: '#64748b',
}
