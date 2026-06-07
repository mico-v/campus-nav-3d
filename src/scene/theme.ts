// Apple 地图风：低饱和柔和配色 + Y 层级栈（避免共面 z-fighting）。
export const LAYER = {
  ground: 0,
  zone: 0.05,
  field: 0.1,
  water: 0.15,
  roadCasing: 0.18,
  road: 0.2,
  marker: 0.25,
} as const

export const COLORS = {
  background: '#eef3f6',
  ground: '#e7ece3',
  roof: '#fbfcfe',
  roofSelected: '#fff1f2',
  selected: '#fb7185',
  road: '#ffffff',
  roadCasing: '#d7dde3',
  routePrimary: '#ff4fa3',
} as const

// 建筑体色（按类别），柔和低饱和。
export const BUILDING_COLOR: Record<string, string> = {
  dorm: '#cdd6f4',
  academic: '#bcd4f2',
  admin: '#c2e6cd',
  sports: '#bfeaf0',
  library: '#f5e2ad',
  gate: '#f6c79a',
  canteen: '#f3bcbc',
  service: '#f3d2ab',
  poi: '#f3c4dc',
  landscape: '#c2e6cd',
}
