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
    { id: 'north-arc', points: [p(-240, 140), p(80, 180), p(258, 162), p(420, 141), p(639.5, 82), p(800, -20), p(943, -219), p(1164, -58), p(1327, -71), p(1480, -169)], width: 9, color: '#9ca3af' },
    { id: 'west-academic-spine', points: [p(70, -151), p(220, -110), p(230, -219), p(267, 36), p(258, 162), p(258, 280)], width: 7, color: '#b0b8c4' },
    { id: 'west-dorm-spine', points: [p(-240, 140), p(-220, 320), p(-50, 340), p(100, 360), p(120, 490), p(-150, 614), p(-295, 608)], width: 8, color: '#b0b8c4' },
    { id: 'central-axis', points: [p(258, 280), p(410, 310), p(570, 300), p(625, 200), p(639.5, 82), p(800, -20), p(990, 320), p(1110, 270)], width: 8, color: '#a8b1bd' },
    { id: 'south-axis', points: [p(625, 200), p(651, 423), p(651, 590), p(756, 660), p(898, 650), p(1040, 694), p(830, 780)], width: 8, color: '#a8b1bd' },
    { id: 'east-link', points: [p(990, 320), p(1040, 430), p(1040, 550), p(1390, 528)], width: 7, color: '#a8b1bd' },
    { id: 'sports-link', points: [p(120, 490), p(160, 700), p(470, 730), p(651, 590)], width: 7, color: '#a8b1bd' },
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
        r(-240, 140),
        r(-120, 165),
        r(80, 180),
        r(258, 162),
        r(258, 280),
        r(410, 310),
        r(570, 300),
        r(625, 200),
        r(639.5, 82),
        r(800, -20),
        r(990, 320),
        r(1110, 270),
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
