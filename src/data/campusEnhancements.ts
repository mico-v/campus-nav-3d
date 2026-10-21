import type { Building, CampusData, PoiMarker, Road, WaterBody } from './campusData'

type Point = [number, number]

const LABEL_NAMES = [
  '二号门',
  '图书馆',
  '塔影阁',
  '二食堂',
  '三食堂',
  '音乐厅',
  '体育馆2单体楼01',
  'C1教学楼',
  'C2教学楼',
  'C3教学楼',
  'C4教学楼',
  'C5教学楼',
  'C6教学楼',
  '逸夫楼单体楼01',
  '电子与信息工程学院单体楼01',
  '职工之家',
  '新政楼',
  '公共艺术教育中心',
  '社会发展与公共管理学院',
]

const CAMPUS_WALKWAYS: Road[] = [
  {
    id: 'walk-north-river',
    name: '北侧滨河步道',
    points: [[540, -70], [680, -72], [820, -65], [980, -55], [1140, -50], [1300, -70]],
    width: 3.6,
  },
  {
    id: 'walk-north-gate',
    name: '北门入口步道',
    points: [[700, -65], [760, -30], [770, 40]],
    width: 4.2,
  },
  {
    id: 'walk-library-west',
    name: '图书馆西侧步道',
    points: [[900, 40], [960, 130], [990, 230], [1010, 330], [1020, 430]],
    width: 4,
  },
  {
    id: 'walk-library-lake',
    name: '图书馆临湖步道',
    points: [[1010, 330], [1120, 330], [1210, 350]],
    width: 4.6,
  },
  {
    id: 'walk-lake-loop',
    name: '塔影阁环湖步道',
    points: [
      [1180, 320], [1390, 320], [1510, 335], [1580, 390],
      [1580, 490], [1570, 590], [1510, 665], [1370, 690],
      [1250, 675], [1180, 610], [1160, 510], [1160, 410], [1180, 320],
    ],
    width: 4.2,
  },
  {
    id: 'walk-east-ridge',
    name: '东区草坡步道',
    points: [[1030, -60], [1200, -45], [1380, 0], [1520, 80], [1630, 180], [1660, 300], [1630, 410]],
    width: 3.8,
  },
  {
    id: 'walk-c-spine',
    name: 'C楼东侧步道',
    points: [[390, 120], [405, 210], [410, 300], [405, 390], [400, 470]],
    width: 4,
  },
  {
    id: 'walk-c-north',
    name: 'C楼北侧步道',
    points: [[250, 145], [400, 145]],
    width: 3.6,
  },
  {
    id: 'walk-c-middle',
    name: 'C楼中轴步道',
    points: [[230, 300], [410, 300]],
    width: 3.6,
  },
  {
    id: 'walk-c-south',
    name: 'C楼南侧步道',
    points: [[400, 390], [500, 430], [560, 500]],
    width: 3.8,
  },
  {
    id: 'walk-west-dorm',
    name: '西区宿舍滨河步道',
    points: [[-125, 470], [-140, 540], [-145, 620], [-150, 700], [-150, 790], [-160, 880], [-165, 960]],
    width: 3.8,
  },
  {
    id: 'walk-west-dorm-cross',
    name: '西区宿舍横向步道',
    points: [[-360, 450], [-260, 455], [-145, 500], [-20, 500]],
    width: 4.2,
  },
  {
    id: 'walk-south-academic',
    name: '南区教学步道',
    points: [[600, 640], [720, 660], [840, 670], [980, 680]],
    width: 4,
  },
  {
    id: 'walk-south-dorm',
    name: '南区宿舍步道',
    points: [[780, 760], [840, 780], [850, 870], [850, 960]],
    width: 3.8,
  },
]

interface RiverSpec {
  id: string
  name: string
  centerline: Point[]
  widths: number[]
  color: string
}

const CAMPUS_RIVERS: RiverSpec[] = [
  {
    id: 'river-xuefu-north',
    name: '学府路北侧河',
    centerline: [
      [-40, -205], [100, -175], [300, -100], [430, -5], [600, -15],
      [800, -35], [980, -45], [1160, -65], [1320, -85], [1490, -140],
      [1660, -235], [1820, -330], [2020, -405],
    ],
    widths: [18, 22, 28, 32, 32, 34, 34, 34, 32, 30, 28, 24, 18],
    color: '#78b8cb',
  },
  {
    id: 'river-west-campus',
    name: '西区环校河',
    centerline: [
      [65, -185], [48, -100], [35, -10], [27, 75], [20, 150], [35, 225],
      [42, 290], [12, 340], [-70, 395], [-190, 450], [-330, 490], [-500, 520],
    ],
    widths: [20, 20, 19, 18, 18, 19, 20, 22, 24, 26, 25, 20],
    color: '#74b5c8',
  },
  {
    id: 'river-west-dorm',
    name: '西区宿舍河',
    centerline: [
      [-330, 490], [-250, 505], [-190, 535], [-145, 600], [-150, 680],
      [-150, 760], [-160, 840], [-150, 925], [-165, 1010],
    ],
    widths: [18, 18, 17, 16, 15, 14, 13, 12, 10],
    color: '#79b9ca',
  },
  {
    id: 'river-central-canal',
    name: '中央景观渠',
    centerline: [
      [760, -35], [770, 30], [775, 110], [785, 190], [805, 270],
      [845, 340], [900, 395], [980, 440], [1080, 470], [1180, 500],
    ],
    widths: [14, 15, 16, 18, 20, 22, 24, 26, 30, 36],
    color: '#7bbdce',
  },
  {
    id: 'river-lake-outlet',
    name: '塔影阁泄水河',
    centerline: [
      [1320, 620], [1295, 680], [1280, 760], [1300, 840], [1270, 920], [1270, 1000],
    ],
    widths: [24, 21, 18, 16, 13, 10],
    color: '#78b8cb',
  },
]

function categoryForBuilding(building: Building): Building['category'] {
  const text = `${building.id} ${building.name}`
  if (/宿舍|组团|公寓/.test(text)) return 'dorm'
  if (/食堂/.test(text)) return 'canteen'
  if (/体育馆|体育场/.test(text)) return 'sports'
  return building.category
}

function heightForBuilding(building: Building): number {
  if (building.height <= 60) return building.height
  const caps: Record<Building['category'], number> = {
    dorm: 30,
    academic: 30,
    landscape: 10,
    sports: 20,
    service: 18,
    admin: 28,
    library: 40,
    gate: 8,
    canteen: 16,
    poi: 12,
  }
  return caps[building.category]
}

function polygonCentroid(points: Point[]): Point {
  const total = points.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
  return [total[0] / points.length, total[1] / points.length]
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared))
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dz * t))
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]
    const prior = polygon[previous]
    if ((current[1] > point[1]) !== (prior[1] > point[1])
      && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) {
      inside = !inside
    }
  }
  return inside
}

function buildingPolygon(building: Building): Point[] {
  if (building.footprint && building.footprint.length >= 3) return building.footprint
  const [x, z] = building.position
  const [width, depth] = building.size
  return [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ]
}

function isClearForTree(point: Point, data: CampusData): boolean {
  for (const building of data.buildings) {
    const polygon = buildingPolygon(building)
    if (pointInPolygon(point, polygon)) return false
    for (let index = 0; index < polygon.length; index += 1) {
      if (distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]) < 5) return false
    }
  }
  for (const road of data.roads) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      if (distanceToSegment(point, road.points[index], road.points[index + 1]) < road.width / 2 + 3.5) return false
    }
  }
  for (const water of data.waters) {
    if (!water.footprint || water.footprint.length < 3) continue
    if (pointInPolygon(point, water.footprint)) return false
    for (let index = 0; index < water.footprint.length; index += 1) {
      if (distanceToSegment(point, water.footprint[index], water.footprint[(index + 1) % water.footprint.length]) < 4) return false
    }
  }
  return true
}

function addTree(point: Point, data: CampusData, minimumGap = 7): void {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return
  if (!isClearForTree(point, data)) return
  if (data.trees.some(([x, z]) => Math.hypot(point[0] - x, point[1] - z) < minimumGap)) return
  data.trees.push([Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10])
}

function addPolygonTrees(points: Point[], data: CampusData, offset: number, spacing: number, inward = false): void {
  if (points.length < 3) return
  const center = polygonCentroid(points)
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < spacing * 0.45) continue
    let normal: Point = [-dz / length, dx / length]
    const midpoint: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    const pointsOutward = (midpoint[0] - center[0]) * normal[0] + (midpoint[1] - center[1]) * normal[1] > 0
    if (pointsOutward === inward) normal = [-normal[0], -normal[1]]
    const count = Math.max(1, Math.floor(length / spacing))
    for (let step = 0; step < count; step += 1) {
      const ratio = (step + 0.5) / count
      const x = start[0] + dx * ratio + normal[0] * offset
      const z = start[1] + dz * ratio + normal[1] * offset
      addTree([x, z], data, spacing * 0.4)
    }
  }
}

function addRoadTrees(points: Point[], width: number, data: CampusData): void {
  let cumulative = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 1) continue
    const normal: Point = [-dz / length, dx / length]
    for (let distance = 30 - cumulative; distance < length; distance += 58) {
      if (distance < 0) continue
      const ratio = distance / length
      const x = start[0] + dx * ratio
      const z = start[1] + dz * ratio
      const offset = width / 2 + 11
      addTree([x + normal[0] * offset, z + normal[1] * offset], data)
      addTree([x - normal[0] * offset, z - normal[1] * offset], data)
    }
    cumulative = (cumulative + length) % 58
  }
}

function addCampusWalkways(data: CampusData): void {
  const existing = new Set(data.roads.map((road) => road.id))
  for (const walkway of CAMPUS_WALKWAYS) {
    if (existing.has(walkway.id)) continue
    data.roads.push({
      ...walkway,
      points: walkway.points.map(([x, z]) => [x, z]),
      kind: 'road',
      roadClass: 'walkway',
      surface: 'paving',
      sidewalk: false,
      access: { pedestrian: true, bicycle: true, vehicle: false },
    })
    existing.add(walkway.id)
  }
}

function catmullRomPoint(first: Point, start: Point, end: Point, last: Point, t: number): Point {
  const t2 = t * t
  const t3 = t2 * t
  return [0, 1].map((axis) => {
    const p0 = first[axis]
    const p1 = start[axis]
    const p2 = end[axis]
    const p3 = last[axis]
    return 0.5 * (
      2 * p1
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )
  }) as Point
}

function riverFootprint(spec: RiverSpec): Point[] {
  const samples: Array<{ point: Point; width: number }> = []
  for (let index = 0; index < spec.centerline.length - 1; index += 1) {
    const first = spec.centerline[Math.max(0, index - 1)]
    const start = spec.centerline[index]
    const end = spec.centerline[index + 1]
    const last = spec.centerline[Math.min(spec.centerline.length - 1, index + 2)]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    const steps = Math.max(4, Math.ceil(length / 12))
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps
      samples.push({
        point: catmullRomPoint(first, start, end, last, t),
        width: spec.widths[index] + (spec.widths[index + 1] - spec.widths[index]) * t,
      })
    }
  }
  const finalPoint = spec.centerline[spec.centerline.length - 1]
  samples.push({ point: finalPoint, width: spec.widths[spec.widths.length - 1] })

  const left: Point[] = []
  const right: Point[] = []
  samples.forEach(({ point, width }, index) => {
    const previous = samples[Math.max(0, index - 1)].point
    const next = samples[Math.min(samples.length - 1, index + 1)].point
    const dx = next[0] - previous[0]
    const dz = next[1] - previous[1]
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length
    const nz = dx / length
    left.push([point[0] + nx * width / 2, point[1] + nz * width / 2])
    right.push([point[0] - nx * width / 2, point[1] - nz * width / 2])
  })

  return [...left, ...right.reverse()].map(([x, z]) => [
    Math.round(x * 10) / 10,
    Math.round(z * 10) / 10,
  ])
}

function addCampusWaterways(data: CampusData): void {
  const existing = new Set(data.waters.map((water) => water.id))
  for (const river of CAMPUS_RIVERS) {
    if (existing.has(river.id)) continue
    const footprint = riverFootprint(river)
    const xs = footprint.map(([x]) => x)
    const zs = footprint.map(([, z]) => z)
    const water: WaterBody = {
      id: river.id,
      name: river.name,
      center: [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ],
      size: [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)],
      color: river.color,
      footprint,
    }
    data.waters.push(water)
    existing.add(river.id)
  }

  const gardenWater = data.waters.find((water) => water.id === 'shitao-garden-water')
  if (gardenWater && !gardenWater.footprint) {
    gardenWater.footprint = Array.from({ length: 18 }, (_, index) => {
      const angle = (index / 18) * Math.PI * 2
      const radius = 0.88 + Math.sin(index * 2.7) * 0.08
      return [
        Math.round((gardenWater.center[0] + Math.cos(angle) * gardenWater.size[0] * 0.5 * radius) * 10) / 10,
        Math.round((gardenWater.center[1] + Math.sin(angle) * gardenWater.size[1] * 0.5 * radius) * 10) / 10,
      ]
    })
  }
}

export function addCampusLandscape(data: CampusData): void {
  if (data.trees.length) return
  const boundary = data.zones.find((zone) => zone.id === 'osm-campus-boundary')?.footprint
  if (boundary) addPolygonTrees(boundary, data, 11, 46, true)

  for (const field of data.fields) {
    const points = field.footprint && field.footprint.length >= 3
      ? field.footprint
      : [
          [field.center[0] - field.size[0] / 2, field.center[1] - field.size[1] / 2] as Point,
          [field.center[0] + field.size[0] / 2, field.center[1] - field.size[1] / 2] as Point,
          [field.center[0] + field.size[0] / 2, field.center[1] + field.size[1] / 2] as Point,
          [field.center[0] - field.size[0] / 2, field.center[1] + field.size[1] / 2] as Point,
        ]
    addPolygonTrees(points, data, 15, 25)
  }

  for (const water of data.waters) {
    if (water.footprint && water.footprint.length >= 3) addPolygonTrees(water.footprint, data, 14, 25)
  }

  for (const road of data.roads) {
    const length = road.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - road.points[index][0], point[1] - road.points[index][1]), 0)
    if (length >= 220 || road.width >= 18) addRoadTrees(road.points, road.width, data)
  }
}

function poiKind(building: Building): PoiMarker['kind'] {
  if (building.category === 'gate') return 'gate'
  if (building.category === 'canteen' || building.category === 'service') return 'service'
  return 'landmark'
}

function addCampusPois(data: CampusData): void {
  if (data.pois.length) return
  const names = new Set(LABEL_NAMES)
  data.pois = data.buildings
    .filter((building) => names.has(building.name) || building.category === 'gate')
    .map((building) => ({
      id: `poi-${building.id}`,
      name: building.name,
      kind: poiKind(building),
      position: [building.position[0], building.height + 2, building.position[1]],
      color: building.color,
      sourceBuildingId: building.id,
    }))
}

/** Normalize imported OSM records and add the map furniture shown on the campus plan. */
export function enhanceCampusData(data: CampusData): void {
  for (const building of data.buildings) {
    building.category = categoryForBuilding(building)
    building.height = heightForBuilding(building)
  }
  addCampusWalkways(data)
  addCampusWaterways(data)
  addCampusLandscape(data)
  addCampusPois(data)
}
