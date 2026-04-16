import { osmBuildings, osmFields, osmRoads } from './osmDerivedData'

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
  footprint?: [number, number][]
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

const createSceneBuilding = (
  id: string,
  name: string,
  category: Building['category'],
  position: [number, number],
  size: [number, number],
  height: number,
  zoneId: string,
  color?: string,
  footprint?: [number, number][],
): Building => ({
  id,
  name,
  category,
  position,
  size,
  height,
  zoneId,
  color,
  footprint,
})

const zones: Zone[] = [
  { id: 'west-academic', name: '西部学院区', category: 'academic', center: p(190, -30), size: [78, 82], color: '#e5f3ff' },
  { id: 'west-dorm', name: '西区宿舍区', category: 'dorm', center: p(-120, 470), size: [92, 88], color: '#e7ddff' },
  { id: 'central-core', name: '中央教学行政区', category: 'admin', center: p(760, 290), size: [124, 108], color: '#e7f7d8' },
  { id: 'library-east-link', name: '图书馆东区过渡带', category: 'landscape', center: p(1115, 210), size: [96, 86], color: '#d9f2e6' },
  { id: 'east-dorm', name: '东区宿舍生活区', category: 'dorm', center: p(1375, 5), size: [66, 92], color: '#fff0c9' },
  { id: 'south-teaching', name: '南部教学生活区', category: 'academic', center: p(845, 610), size: [112, 88], color: '#dbeafe' },
  { id: 'sports-belt', name: '运动休闲带', category: 'sports', center: p(360, 680), size: [120, 68], color: '#d6f5e8' },
]

const osmDrivenBuildings: Building[] = osmBuildings.map((building) =>
  createSceneBuilding(
    building.id,
    building.name,
    building.category,
    building.position,
    building.size,
    building.height,
    building.zoneId,
    building.color,
    building.footprint,
  ),
)

const supplementalBuildings: Building[] = [
  createBuilding('west-gate', '二号门（西门）', 'gate', [-240, 140], [12, 8], 5, 'west-dorm', '#f97316'),
  createBuilding('north-gate', '一号门', 'gate', [943, -219], [12, 8], 5, 'library-east-link', '#fb923c'),
  createBuilding('admin', '行政楼', 'admin', [800, -20], [22, 16], 16, 'central-core', '#86efac'),
  createBuilding('teachers-garden', '师陶园', 'landscape', [625, 200], [24, 18], 3, 'central-core', '#bbf7d0'),
  createBuilding('hospital', '校医院', 'service', [990, 320], [18, 14], 10, 'library-east-link', '#fb7185'),
  createBuilding('north-central-gym', '北中体育馆', 'sports', [581, -44], [24, 18], 12, 'sports-belt', '#60a5fa'),
  createBuilding('music-hall', '音乐厅', 'service', [494.5, 550], [22, 14], 12, 'sports-belt', '#fdba74'),
  createBuilding('south-gym', '南部体育馆', 'sports', [470, 730], [24, 18], 12, 'sports-belt', '#38bdf8'),
  createBuilding('south-dorm', '南区宿舍', 'dorm', [830, 780], [30, 20], 20, 'south-teaching'),
]

const buildings = [...osmDrivenBuildings, ...supplementalBuildings]
const buildingById = new Map(buildings.map((building) => [building.id, building]))

const createPoiFromBuilding = (
  id: string,
  buildingId: string,
  kind: PoiMarker['kind'],
  heightOffset = 2,
  color?: string,
): PoiMarker => {
  const building = buildingById.get(buildingId)
  if (!building) {
    throw new Error(`POI building not found: ${buildingId}`)
  }

  return {
    id,
    name: building.name,
    kind,
    position: [building.position[0], building.height + heightOffset, building.position[1]],
    color: color ?? building.color,
  }
}

export const campusData: CampusData = {
  name: '校园 3D 导航原型',
  bounds: SCENE_BOUNDS,
  zones,
  buildings,
  roads: osmRoads,
  waters: [
    { id: 'teachers-garden-water', name: '师陶园水景', center: p(625, 200), size: [26, 18], color: '#60a5fa' },
  ],
  fields: osmFields.length > 0 ? osmFields : [{ id: 'football-field', name: '足球场', center: p(160, 700), size: [52, 34], color: '#4ade80', stripeColor: '#86efac' }],
  trees: [
    p(-40, 120), p(140, -120), p(310, -50), p(470, 70), p(520, 180), p(690, 180), p(850, 110), p(1030, 250),
    p(1180, 230), p(1210, 380), p(1330, 520), p(890, 510), p(700, 600), p(550, 610), p(350, 650), p(180, 640),
    p(40, 520), p(-140, 560), p(-230, 500), p(-180, 350), p(80, 350), p(580, -40), p(830, -70), p(1260, -90),
  ],
  pois: [
    { id: 'poi-west-gate', name: '二号门（西门）', kind: 'gate', position: r(-240, 140, 3.8), color: '#f97316' },
    { id: 'poi-north-gate', name: '一号门', kind: 'gate', position: r(943, -219, 3.8), color: '#fb923c' },
    createPoiFromBuilding('poi-library', 'library', 'landmark', 2, '#facc15'),
    createPoiFromBuilding('poi-academician', 'academician', 'landmark', 2, '#60a5fa'),
    createPoiFromBuilding('poi-c4', 'c4', 'landmark', 2, '#93c5fd'),
    createPoiFromBuilding('poi-c5', 'c5', 'landmark', 2, '#93c5fd'),
    createPoiFromBuilding('poi-c6', 'c6', 'landmark', 2, '#93c5fd'),
    { id: 'poi-admin', name: '行政楼', kind: 'landmark', position: r(800, -20, 18), color: '#4ade80' },
    { id: 'poi-hospital', name: '校医院', kind: 'service', position: r(990, 320, 12), color: '#f472b6' },
    { id: 'poi-stadium', name: '南体育场', kind: 'landmark', position: [-113.8, 6.5, -49.9], color: '#22c55e' },
    { id: 'poi-south-gym', name: '南部体育馆', kind: 'landmark', position: r(470, 730, 14), color: '#0ea5e9' },
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
        '经过二食堂与 C4/C5/C6 教学楼一带，穿过西部学院区的主路网。',
        '继续向东进入中央教学行政区，沿院士楼附近道路前行。',
        '经过行政楼与校医院一侧的通道，向图书馆主入口靠近。',
        '抵达图书馆前广场，完成示例导航。',
      ],
      landmarks: ['二号门（西门）', '二食堂', 'C4教学楼', 'C5教学楼', 'C6教学楼', '院士楼', '行政楼', '校医院', '图书馆'],
    },
  ],
}
