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

const TOPO_BOUNDS = {
  minX: -295,
  maxX: 1490,
  minY: -219,
  maxY: 780,
}

const SCENE_BOUNDS = {
  width: 320,
  depth: 220,
}

const topoToScene = (x: number, y: number): [number, number] => {
  const normalizedX = (x - TOPO_BOUNDS.minX) / (TOPO_BOUNDS.maxX - TOPO_BOUNDS.minX) - 0.5
  const normalizedY = (y - TOPO_BOUNDS.minY) / (TOPO_BOUNDS.maxY - TOPO_BOUNDS.minY) - 0.5
  return [
    Number((normalizedX * (SCENE_BOUNDS.width - 30)).toFixed(1)),
    Number((normalizedY * (SCENE_BOUNDS.depth - 30)).toFixed(1)),
  ]
}

const p = (x: number, y: number) => topoToScene(x, y)
const r = (x: number, y: number, h = 4.2): [number, number, number] => {
  const [sx, sz] = topoToScene(x, y)
  return [sx, h, sz]
}

const createBuilding = (
  id: string,
  name: string,
  category: Building['category'],
  topo: [number, number],
  size: [number, number],
  height: number,
  zoneId: string,
  color?: string,
): Building => ({
  id,
  name,
  category,
  position: p(topo[0], topo[1]),
  size,
  height,
  zoneId,
  color,
})

export const campusData: CampusData = {
  name: '校园 3D 导航原型',
  bounds: SCENE_BOUNDS,
  zones: [
    { id: 'west-academic', name: '西部学院区', category: 'academic', center: p(190, -30), size: [78, 82], color: '#e5f3ff' },
    { id: 'west-dorm', name: '西区宿舍区', category: 'dorm', center: p(-120, 470), size: [92, 88], color: '#e7ddff' },
    { id: 'central-core', name: '中央教学行政区', category: 'admin', center: p(760, 290), size: [124, 108], color: '#e7f7d8' },
    { id: 'library-east-link', name: '图书馆东区过渡带', category: 'landscape', center: p(1115, 210), size: [96, 86], color: '#d9f2e6' },
    { id: 'east-dorm', name: '东区宿舍生活区', category: 'dorm', center: p(1375, 5), size: [66, 92], color: '#fff0c9' },
    { id: 'south-teaching', name: '南部教学生活区', category: 'academic', center: p(845, 610), size: [112, 88], color: '#dbeafe' },
    { id: 'sports-belt', name: '运动休闲带', category: 'sports', center: p(360, 680), size: [120, 68], color: '#d6f5e8' },
  ],
  buildings: [
    createBuilding('west-gate', '二号门（西门）', 'gate', [-240, 140], [12, 8], 5, 'west-dorm', '#f97316'),
    createBuilding('north-gate', '一号门', 'gate', [943, -219], [12, 8], 5, 'library-east-link', '#fb923c'),

    createBuilding('ee-college', '电子与信息工程学院', 'academic', [70, -151], [22, 18], 17, 'west-academic'),
    createBuilding('chem-bio', '化学与生物工程学院', 'academic', [230, -219], [22, 16], 17, 'west-academic'),
    createBuilding('yifu', '逸夫楼', 'academic', [220, -110], [16, 14], 18, 'west-academic'),
    createBuilding('geo', '地理科学与测绘工程学院', 'academic', [420, 2], [20, 16], 16, 'west-academic'),
    createBuilding('env', '环境科学与工程学院', 'academic', [80, 180], [22, 16], 16, 'west-academic'),
    createBuilding('foreign', '外国语学院', 'academic', [410, 141], [18, 14], 15, 'west-academic'),
    createBuilding('c4', 'C4教学楼', 'academic', [267, 36], [18, 14], 16, 'west-academic'),
    createBuilding('c5', 'C5教学楼', 'academic', [258, 162], [18, 14], 16, 'west-academic'),
    createBuilding('c6', 'C6教学楼', 'academic', [258, 280], [18, 14], 16, 'west-academic'),

    createBuilding('west-dorm-1', '西区宿舍1组团', 'dorm', [100, 360], [22, 14], 18, 'west-dorm'),
    createBuilding('west-dorm-2', '西区宿舍2组团', 'dorm', [-50, 340], [22, 14], 18, 'west-dorm'),
    createBuilding('west-dorm-3', '西区宿舍3组团', 'dorm', [-220, 320], [24, 15], 18, 'west-dorm'),
    createBuilding('west-dorm-4', '西区宿舍4组团', 'dorm', [-295, 608], [25, 15], 19, 'west-dorm'),
    createBuilding('west-dorm-5', '西区宿舍5组团', 'dorm', [-150, 614], [25, 15], 19, 'west-dorm'),
    createBuilding('west-express', '西区快递点', 'service', [120, 490], [14, 10], 7, 'west-dorm', '#f59e0b'),

    createBuilding('north-central-gym', '北中体育馆', 'sports', [581, -44], [24, 18], 12, 'sports-belt', '#60a5fa'),
    createBuilding('canteen-3', '三食堂', 'canteen', [639.5, 82], [20, 14], 10, 'central-core', '#fca5a5'),
    createBuilding('admin', '行政楼', 'admin', [800, -20], [22, 16], 16, 'central-core', '#86efac'),
    createBuilding('teachers-garden', '师陶园', 'landscape', [625, 200], [24, 18], 3, 'central-core', '#bbf7d0'),
    createBuilding('student-dorm-3', '学宿3', 'dorm', [570, 300], [18, 12], 14, 'central-core'),
    createBuilding('business', '商学院', 'academic', [410, 310], [20, 16], 16, 'central-core'),
    createBuilding('academician', '院士楼', 'academic', [651, 423], [22, 16], 17, 'central-core'),
    createBuilding('social', '社会发展与公共管理学院', 'academic', [651, 590], [20, 16], 16, 'south-teaching'),
    createBuilding('music-hall', '音乐厅', 'service', [494.5, 550], [22, 14], 12, 'sports-belt', '#fdba74'),
    createBuilding('teaching-5', '教学5楼', 'academic', [818, 393], [22, 16], 17, 'central-core'),
    createBuilding('teaching-4', '教学4楼', 'academic', [830, 528], [22, 16], 17, 'south-teaching'),
    createBuilding('teaching-2', '教学2楼', 'academic', [756, 660], [22, 16], 18, 'south-teaching'),
    createBuilding('teaching-3', '教学3楼', 'academic', [898, 650], [22, 16], 18, 'south-teaching'),
    createBuilding('teaching-6', '教学6楼', 'academic', [1040, 694], [22, 16], 18, 'south-teaching'),
    createBuilding('teaching-7', '教学7楼', 'academic', [1040, 550], [22, 16], 18, 'south-teaching'),
    createBuilding('library', '图书馆', 'library', [1110, 270], [30, 22], 26, 'library-east-link', '#fde68a'),
    createBuilding('hospital', '校医院', 'service', [990, 320], [18, 14], 10, 'library-east-link', '#fb7185'),
    createBuilding('media', '传媒与视觉艺术学院', 'academic', [1040, 430], [24, 16], 17, 'library-east-link'),

    createBuilding('east-express', '东区快递点', 'service', [1164, -58], [14, 10], 7, 'east-dorm', '#f59e0b'),
    createBuilding('east-canteen', '东区食堂', 'canteen', [1327, -71], [22, 14], 11, 'east-dorm', '#fb7185'),
    createBuilding('east-dorms', '东区宿舍', 'dorm', [1490, -21], [28, 20], 20, 'east-dorm'),
    createBuilding('jingwen', '敬文书院', 'dorm', [1480, -169], [20, 14], 18, 'east-dorm'),
    createBuilding('student-dorm-8', '学宿8', 'dorm', [720, -158], [18, 12], 15, 'library-east-link'),
    createBuilding('tower-pavilion', '塔影阁', 'landscape', [1390, 528], [16, 16], 8, 'library-east-link', '#a7f3d0'),

    createBuilding('football-service', '足球场看台', 'sports', [160, 700], [16, 8], 6, 'sports-belt', '#38bdf8'),
    createBuilding('south-gym', '南部体育馆', 'sports', [470, 730], [24, 18], 12, 'sports-belt', '#38bdf8'),
    createBuilding('south-dorm', '南区宿舍', 'dorm', [830, 780], [30, 20], 20, 'south-teaching'),
  ],
  roads: [
    { id: 'north-gate-axis', points: [[53.6, -78.0], [51.4, -78.3], [50.3, -75.1], [52.1, -71.9], [53.4, -68.7], [54.7, -65.6], [57.8, -60.0], [58.3, -57.0], [56.2, -55.4], [54.3, -54.2], [52.5, -52.6], [50.4, -51.7], [48.3, -50.2], [46.2, -49.3], [43.4, -48.9], [37.1, -49.0], [30.0, -49.2], [24.5, -49.9], [20.4, -49.7], [17.9, -46.4]], width: 8, color: '#9ca3af' },
    { id: 'west-gate-axis', points: [[-123.8, -33.5], [-123.7, -30.5], [-120.4, -26.4], [-118.1, -24.6], [-116.2, -20.3], [-114.0, -20.4], [-111.8, -20.1], [-108.8, -20.4], [-106.1, -16.7], [-105.5, -7.8], [-105.0, -3.6], [-104.2, -0.2], [-101.7, 0.5], [-94.8, 1.8], [-90.1, 2.4], [-86.0, 2.2], [-79.1, 3.5], [-72.5, 4.3], [-66.7, 5.1], [-64.6, 7.2], [-62.4, 8.3], [-55.8, 9.1], [-49.1, 10.0], [-42.5, 10.9], [-35.9, 11.7], [-28.7, 13.1], [-22.1, 13.9], [-19.6, 14.3], [-17.3, 11.2], [-17.8, 4.1], [-16.0, 1.0], [-16.2, -4.9], [-16.5, -14.2], [-16.7, -17.2], [-14.5, -18.0], [-7.9, -17.2], [-3.2, -16.6], [3.7, -16.0], [5.5, -17.3], [4.9, -26.2], [4.7, -29.6], [4.4, -38.9], [4.1, -43.0], [3.9, -50.8], [11.3, -50.9], [17.9, -50.1], [17.8, -47.1]], width: 8, color: '#9ca3af' },
    { id: 'admin-to-library', points: [[17.6, -46.4], [20.4, -49.7], [24.8, -49.2], [31.7, -48.6], [33.9, -48.7], [38.0, -48.2], [40.8, -47.4], [41.6, -42.9], [42.4, -39.8], [43.0, -29.4], [43.1, -23.8], [46.4, -19.7], [51.9, -19.3], [53.1, -12.8]], width: 8, color: '#a8b1bd' },
    { id: 'admin-to-east-canteen', points: [[17.6, -46.4], [20.4, -49.7], [24.8, -49.2], [31.7, -48.6], [33.9, -48.7], [40.5, -47.8], [44.6, -47.3], [46.8, -48.1], [48.9, -49.0], [51.0, -49.8], [53.1, -51.7], [56.0, -53.6], [58.1, -54.8], [60.7, -56.7], [62.8, -58.6], [65.4, -60.5], [67.6, -61.3], [70.1, -63.9], [72.3, -64.4], [74.4, -65.2], [76.2, -66.8], [80.1, -70.0], [84.5, -69.8], [86.7, -70.7], [88.8, -70.7], [94.3, -70.8], [99.2, -71.2], [103.6, -71.8], [106.8, -71.7], [114.2, -71.5], [117.0, -71.1], [119.4, -71.5], [122.0, -70.5], [124.2, -70.2], [127.1, -72.0], [129.8, -71.7], [131.3, -73.7], [132.3, -76.5], [132.8, -80.1], [133.4, -83.8]], width: 7, color: '#a8b1bd' },
    { id: 'east-canteen-to-dorm', points: [[132.6, -84.3], [134.8, -84.3], [136.9, -85.5], [139.3, -85.6], [142.1, -85.2], [143.9, -74.6], [144.3, -68.3], [146.3, -66.5], [152.9, -65.7], [155.7, -65.3], [156.7, -62.2], [156.6, -59.2]], width: 7, color: '#b0b8c4' },
    { id: 'west-gate-to-football', points: [[-123.8, -33.5], [-123.7, -30.5], [-120.4, -26.4], [-118.1, -24.6], [-116.2, -20.3], [-114.0, -20.4], [-111.8, -20.1], [-108.8, -20.4], [-106.1, -16.7], [-105.5, -7.8], [-105.0, -3.6], [-104.2, -0.2], [-97.0, 1.5], [-90.4, 2.4], [-86.0, 2.2], [-83.4, 4.0], [-76.8, 4.9], [-70.2, 5.8], [-67.7, 6.1], [-67.1, 11.7], [-65.8, 14.9], [-65.5, 24.2], [-64.9, 33.1], [-64.4, 41.7], [-64.1, 46.2], [-62.8, 49.3], [-62.3, 52.3], [-60.5, 55.6], [-59.2, 58.3], [-57.4, 60.8], [-56.5, 70.5], [-59.3, 70.2], [-59.3, 74.6], [-65.9, 73.7], [-68.1, 73.4]], width: 7, color: '#b0b8c4' },
    { id: 'football-to-south-dorm', points: [[-68.1, 73.4], [-61.5, 74.3], [-59.3, 74.2], [-59.5, 70.1], [-56.8, 70.5], [-55.9, 63.2], [-53.7, 63.5], [-51.1, 64.9], [-48.8, 66.7], [-46.6, 67.4], [-44.3, 68.4], [-39.1, 69.1], [-32.2, 70.4], [-25.5, 71.3], [-18.9, 72.1], [-12.3, 73.0], [-5.7, 73.9], [0.9, 74.7], [7.6, 75.6], [13.9, 76.4], [16.1, 76.4], [23.0, 77.6], [24.7, 86.7], [25.5, 96.1], [26.0, 99.1], [26.5, 102.2], [33.1, 103.0], [36.4, 103.5], [40.4, 105.8], [41.6, 102.7], [44.3, 103.0], [46.2, 101.8]], width: 7, color: '#b0b8c4' },
  ],
  waters: [
    { id: 'teachers-garden-water', name: '师陶园水景', center: p(625, 200), size: [26, 18], color: '#60a5fa' },
  ],
  fields: [
    { id: 'football-field', name: '足球场', center: p(160, 700), size: [52, 34], color: '#4ade80', stripeColor: '#86efac' },
  ],
  trees: [
    p(-40, 120), p(140, -120), p(310, -50), p(470, 70), p(520, 180), p(690, 180), p(850, 110), p(1030, 250),
    p(1180, 230), p(1210, 380), p(1330, 520), p(890, 510), p(700, 600), p(550, 610), p(350, 650), p(180, 640),
    p(40, 520), p(-140, 560), p(-230, 500), p(-180, 350), p(80, 350), p(580, -40), p(830, -70), p(1260, -90),
  ],
  pois: [
    { id: 'poi-west-gate', name: '二号门（西门）', kind: 'gate', position: r(-240, 140, 3.8), color: '#f97316' },
    { id: 'poi-north-gate', name: '一号门', kind: 'gate', position: r(943, -219, 3.8), color: '#fb923c' },
    { id: 'poi-library', name: '图书馆', kind: 'landmark', position: r(1110, 270, 28), color: '#facc15' },
    { id: 'poi-admin', name: '行政楼', kind: 'landmark', position: r(800, -20, 18), color: '#4ade80' },
    { id: 'poi-north-gym', name: '北中体育馆', kind: 'landmark', position: r(581, -44, 14), color: '#38bdf8' },
    { id: 'poi-east-canteen', name: '东区食堂', kind: 'service', position: r(1327, -71, 13), color: '#fb7185' },
    { id: 'poi-hospital', name: '校医院', kind: 'service', position: r(990, 320, 12), color: '#f472b6' },
    { id: 'poi-football', name: '足球场', kind: 'landmark', position: r(160, 700, 4), color: '#22c55e' },
    { id: 'poi-south-gym', name: '南部体育馆', kind: 'landmark', position: r(470, 730, 14), color: '#0ea5e9' },
    { id: 'poi-south-dorm', name: '南区宿舍', kind: 'landmark', position: r(830, 780, 22), color: '#8b5cf6' },
  ],
  routes: [
    {
      id: 'west-gate-to-library',
      name: '从二号门（西门）到图书馆',
      points: [
        [-123.8, 4.4, -33.5],
        [-123.7, 4.4, -30.5],
        [-120.4, 4.4, -26.4],
        [-118.1, 4.4, -24.6],
        [-116.2, 4.4, -20.3],
        [-114.0, 4.4, -20.4],
        [-111.8, 4.4, -20.1],
        [-108.8, 4.4, -20.4],
        [-106.1, 4.4, -16.7],
        [-105.5, 4.4, -7.8],
        [-105.0, 4.4, -3.6],
        [-104.2, 4.4, -0.2],
        [-101.7, 4.4, 0.5],
        [-94.8, 4.4, 1.8],
        [-90.1, 4.4, 2.4],
        [-86.0, 4.4, 2.2],
        [-79.1, 4.4, 3.5],
        [-72.5, 4.4, 4.3],
        [-66.7, 4.4, 5.1],
        [-64.6, 4.4, 7.2],
        [-62.4, 4.4, 8.3],
        [-55.8, 4.4, 9.1],
        [-49.1, 4.4, 10.0],
        [-42.5, 4.4, 10.9],
        [-35.9, 4.4, 11.7],
        [-28.7, 4.4, 13.1],
        [-22.1, 4.4, 13.9],
        [-19.6, 4.4, 14.3],
        [-17.3, 4.4, 11.2],
        [-17.8, 4.4, 4.1],
        [-16.0, 4.4, 1.0],
        [-16.2, 4.4, -4.9],
        [-16.5, 4.4, -14.2],
        [-16.7, 4.4, -17.2],
        [-14.5, 4.4, -18.0],
        [-7.9, 4.4, -17.2],
        [-3.2, 4.4, -16.6],
        [3.7, 4.4, -16.0],
        [5.5, 4.4, -17.3],
        [4.9, 4.4, -26.2],
        [4.7, 4.4, -29.6],
        [4.4, 4.4, -38.9],
        [4.1, 4.4, -43.0],
        [3.9, 4.4, -50.8],
        [11.3, 4.4, -50.9],
        [17.9, 4.4, -50.1],
        [17.8, 4.4, -47.1],
        [20.4, 4.4, -49.7],
        [24.8, 4.4, -49.2],
        [31.7, 4.4, -48.6],
        [33.9, 4.4, -48.7],
        [38.0, 4.4, -48.2],
        [40.8, 4.4, -47.4],
        [41.6, 4.4, -42.9],
        [42.4, 4.4, -39.8],
        [43.0, 4.4, -29.4],
        [43.1, 4.4, -23.8],
        [46.4, 4.4, -19.7],
        [51.9, 4.4, -19.3],
        [53.1, 4.4, -12.8],
      ],
      steps: [
        '从二号门（西门）入校后沿西侧主干道向东北方向前进。',
        '经过环境科学与工程学院与 C5/C6 教学楼之间的教学走廊，进入西部学院区。',
        '继续向东，穿过商学院、学宿3 与师陶园附近的中央通道。',
        '途经三食堂与行政楼后沿图书馆方向主路前行。',
        '经过校医院一侧的过渡道路，抵达图书馆前广场与主入口。',
      ],
      landmarks: ['二号门（西门）', '环境科学与工程学院', 'C5教学楼', 'C6教学楼', '商学院', '学宿3', '师陶园', '三食堂', '行政楼', '校医院', '图书馆'],
    },
  ],
}
