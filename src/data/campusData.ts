export type ZoneCategory = 'dorm' | 'academic' | 'landscape' | 'sports' | 'service' | 'admin'

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
  category: ZoneCategory | 'library' | 'gate' | 'canteen' | 'poi'
  position: [number, number]
  size: [number, number]
  height: number
  color?: string
  zoneId: string
}

export interface Road {
  id: string
  points: [number, number][]
  width: number
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

export const campusData: CampusData = {
  name: '校园 3D 导航原型',
  bounds: { width: 320, depth: 220 },
  zones: [
    { id: 'west-dorm-sports', name: '西区宿舍/运动区', category: 'dorm', center: [-105, 0], size: [90, 95], color: '#dbeafe' },
    { id: 'central-academic', name: '中央教学行政区', category: 'academic', center: [-5, 0], size: [120, 90], color: '#e9f7d8' },
    { id: 'library-lake', name: '图书馆与景观湖区', category: 'landscape', center: [85, 5], size: [105, 95], color: '#d8f3dc' },
    { id: 'east-dorm', name: '东区宿舍服务区', category: 'dorm', center: [120, 60], size: [80, 65], color: '#fef3c7' },
    { id: 'south-dorm', name: '南区 6/7 组团', category: 'dorm', center: [70, -72], size: [130, 58], color: '#fde2e4' },
  ],
  buildings: [
    { id: 'west-gate', name: '二号门（西门）', category: 'gate', position: [-150, -8], size: [10, 8], height: 5, color: '#f97316', zoneId: 'west-dorm-sports' },
    { id: 'west-dorm-a', name: '西区宿舍 A', category: 'dorm', position: [-132, 38], size: [18, 12], height: 16, zoneId: 'west-dorm-sports' },
    { id: 'west-dorm-b', name: '西区宿舍 B', category: 'dorm', position: [-108, 44], size: [16, 11], height: 18, zoneId: 'west-dorm-sports' },
    { id: 'west-dorm-c', name: '西区宿舍 C', category: 'dorm', position: [-86, 36], size: [18, 12], height: 15, zoneId: 'west-dorm-sports' },
    { id: 'gymnasium', name: '体育馆', category: 'sports', position: [-92, -22], size: [28, 20], height: 12, color: '#60a5fa', zoneId: 'west-dorm-sports' },
    { id: 'sports-service', name: '西区服务站', category: 'service', position: [-122, -4], size: [16, 10], height: 8, color: '#fbbf24', zoneId: 'west-dorm-sports' },
    { id: 'teaching-a', name: '中央教学楼 A', category: 'academic', position: [-28, 18], size: [24, 18], height: 19, zoneId: 'central-academic' },
    { id: 'teaching-b', name: '中央教学楼 B', category: 'academic', position: [2, 16], size: [28, 18], height: 21, zoneId: 'central-academic' },
    { id: 'admin', name: '行政楼', category: 'admin', position: [34, 6], size: [24, 16], height: 15, color: '#86efac', zoneId: 'central-academic' },
    { id: 'canteen-3', name: '三食堂', category: 'canteen', position: [-8, -26], size: [20, 14], height: 10, color: '#fca5a5', zoneId: 'central-academic' },
    { id: 'innovation', name: '教学实验楼', category: 'academic', position: [30, -24], size: [22, 14], height: 14, zoneId: 'central-academic' },
    { id: 'library', name: '图书馆', category: 'library', position: [94, -4], size: [34, 22], height: 26, color: '#fef08a', zoneId: 'library-lake' },
    { id: 'library-plaza', name: '图书馆广场', category: 'service', position: [63, -3], size: [20, 16], height: 2, color: '#e5e7eb', zoneId: 'library-lake' },
    { id: 'east-dorm-a', name: '东区宿舍 1', category: 'dorm', position: [110, 72], size: [18, 12], height: 17, zoneId: 'east-dorm' },
    { id: 'east-dorm-b', name: '东区宿舍 2', category: 'dorm', position: [136, 78], size: [18, 12], height: 19, zoneId: 'east-dorm' },
    { id: 'east-service', name: '东区宿舍服务区', category: 'service', position: [128, 48], size: [26, 15], height: 9, color: '#fdba74', zoneId: 'east-dorm' },
    { id: 'south-dorm-6', name: '南区 6 组团', category: 'dorm', position: [34, -78], size: [22, 14], height: 17, zoneId: 'south-dorm' },
    { id: 'south-dorm-7', name: '南区 7 组团', category: 'dorm', position: [74, -84], size: [22, 14], height: 18, zoneId: 'south-dorm' },
    { id: 'south-dorm-8', name: '南区生活中心', category: 'service', position: [112, -68], size: [24, 14], height: 10, color: '#fb923c', zoneId: 'south-dorm' },
  ],
  roads: [
    { id: 'north-south-west', points: [[-150, -8], [-120, -8], [-92, -8], [-65, -6], [-20, -4], [28, -2], [64, -2], [96, -2]], width: 10, color: '#9ca3af' },
    { id: 'central-ring', points: [[-36, 38], [-4, 38], [26, 30], [44, 8], [32, -22], [0, -32], [-28, -26], [-36, 0], [-36, 38]], width: 7, color: '#a8b1bd' },
    { id: 'east-link', points: [[92, 2], [108, 18], [120, 42], [124, 76]], width: 7, color: '#a8b1bd' },
    { id: 'south-link', points: [[42, -22], [54, -40], [66, -60], [76, -84]], width: 8, color: '#a8b1bd' },
    { id: 'west-inner', points: [[-118, 44], [-118, 10], [-104, -16], [-90, -24]], width: 6, color: '#a8b1bd' },
  ],
  waters: [
    { id: 'main-lake', name: '主景观湖', center: [116, 12], size: [42, 32], color: '#60a5fa' },
  ],
  fields: [
    { id: 'west-field', name: '西区操场', center: [-56, -36], size: [42, 28], color: '#4ade80', stripeColor: '#86efac' },
    { id: 'mini-field', name: '训练场', center: [-126, -34], size: [20, 14], color: '#34d399', stripeColor: '#6ee7b7' },
  ],
  trees: [
    [-104, 14], [-98, 6], [-92, 16], [-72, 14], [-62, 20], [-42, 54], [-18, 54], [10, 48], [40, 38], [74, 34], [106, 42], [126, 26], [140, 18], [84, -30], [98, -34], [118, -42], [62, -98], [86, -98], [18, -68], [4, -46], [-12, -48]
  ],
  pois: [
    { id: 'poi-west-gate', name: '二号门（西门）', kind: 'gate', position: [-150, 3.6, -8], color: '#f97316' },
    { id: 'poi-library', name: '图书馆', kind: 'landmark', position: [94, 27, -4], color: '#facc15' },
    { id: 'poi-lake', name: '主景观湖', kind: 'landmark', position: [116, 2.5, 12], color: '#38bdf8' },
    { id: 'poi-gym', name: '体育馆', kind: 'landmark', position: [-92, 14, -22], color: '#60a5fa' },
    { id: 'poi-canteen', name: '三食堂', kind: 'service', position: [-8, 12, -26], color: '#fb7185' },
    { id: 'poi-kfc', name: 'KFC', kind: 'service', position: [-126, 11, 8], color: '#ef4444' },
    { id: 'poi-luckin', name: '瑞幸', kind: 'service', position: [-112, 11, 10], color: '#3b82f6' },
    { id: 'poi-familymart', name: '全家', kind: 'service', position: [116, 11, -68], color: '#22c55e' },
    { id: 'poi-cainiao', name: '菜鸟驿站', kind: 'service', position: [130, 11, 50], color: '#f59e0b' },
  ],
  routes: [
    {
      id: 'west-gate-to-library',
      name: '从二号门（西门）到图书馆',
      points: [
        [-150, 4.4, -8],
        [-126, 4.4, -8],
        [-110, 4.4, -10],
        [-92, 4.4, -20],
        [-64, 4.4, -14],
        [-30, 4.4, -8],
        [10, 4.4, -4],
        [42, 4.4, -1],
        [64, 4.4, -2],
        [82, 4.4, -2],
        [94, 4.4, -4],
      ],
      steps: [
        '从二号门（西门）进入校园，沿主路向东前进。',
        '经过西区服务站，继续朝体育馆与西区操场方向直行。',
        '通过运动片区后进入中央教学/行政区主干道。',
        '经过行政楼与三食堂，沿中轴继续向图书馆广场前进。',
        '抵达图书馆广场后右前方即为图书馆主入口。',
      ],
      landmarks: ['二号门（西门）', '西区服务站', '体育馆', '西区操场', '行政楼', '三食堂', '图书馆广场', '图书馆'],
    },
  ],
}
