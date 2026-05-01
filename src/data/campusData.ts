export type ZoneCategory = 'dorm' | 'academic' | 'landscape' | 'sports' | 'service' | 'admin'

export const buildingCategoryOptions = [
  'dorm',
  'academic',
  'landscape',
  'sports',
  'service',
  'admin',
  'library',
  'gate',
  'canteen',
  'poi',
] as const

export type BuildingCategory = (typeof buildingCategoryOptions)[number]

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
  category: BuildingCategory
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
  sourceBuildingId?: string
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

// Sources: graph positions and connectivity from ZDaneel/usts-navigation-graph commit 6f251d8;
// named OpenStreetMap building footprints are fitted into the graph coordinate system using matched landmarks.
const baseCampusData: CampusData = {
  "name": "苏州科技大学石湖校区 3D 导航图",
  "bounds": {
    "width": 1850,
    "depth": 1120
  },
  "zones": [
    {
      "id": "west-campus",
      "name": "西区宿舍与生活服务区",
      "category": "dorm",
      "center": [
        -105,
        485
      ],
      "size": [
        430,
        390
      ],
      "color": "#eee7ff"
    },
    {
      "id": "west-academic",
      "name": "西部学院教学区",
      "category": "academic",
      "center": [
        245,
        100
      ],
      "size": [
        500,
        520
      ],
      "color": "#e5f3ff"
    },
    {
      "id": "central-core",
      "name": "中央教学行政区",
      "category": "admin",
      "center": [
        735,
        285
      ],
      "size": [
        440,
        620
      ],
      "color": "#e7f7d8"
    },
    {
      "id": "south-campus",
      "name": "南部教学生活区",
      "category": "academic",
      "center": [
        845,
        640
      ],
      "size": [
        560,
        360
      ],
      "color": "#dbeafe"
    },
    {
      "id": "east-campus",
      "name": "东区宿舍与服务区",
      "category": "service",
      "center": [
        1320,
        95
      ],
      "size": [
        430,
        520
      ],
      "color": "#fff0c9"
    },
    {
      "id": "sports-belt",
      "name": "运动休闲带",
      "category": "sports",
      "center": [
        300,
        690
      ],
      "size": [
        420,
        190
      ],
      "color": "#d6f5e8"
    }
  ],
  "buildings": [
    {
      "id": "place-01",
      "name": "一号门",
      "category": "gate",
      "position": [
        943,
        -219
      ],
      "size": [
        14,
        10
      ],
      "height": 5,
      "color": "#fb923c",
      "zoneId": "central-core"
    },
    {
      "id": "place-02",
      "name": "二号门",
      "category": "gate",
      "position": [
        -240,
        140
      ],
      "size": [
        14,
        10
      ],
      "height": 5,
      "color": "#fb923c",
      "zoneId": "west-academic"
    },
    {
      "id": "place-03",
      "name": "C4教学楼",
      "category": "academic",
      "position": [
        267,
        36
      ],
      "size": [
        158.2,
        70.8
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          217.9,
          4
        ],
        [
          319.1,
          19
        ],
        [
          323.1,
          38.7
        ],
        [
          305.9,
          34.9
        ],
        [
          306.3,
          49.2
        ],
        [
          345.9,
          55
        ],
        [
          347.6,
          74.8
        ],
        [
          189.4,
          47.5
        ],
        [
          189.6,
          30.7
        ],
        [
          221,
          34.6
        ],
        [
          221.3,
          22.5
        ],
        [
          217,
          21.3
        ]
      ]
    },
    {
      "id": "place-04",
      "name": "教学2楼",
      "category": "academic",
      "position": [
        756,
        660
      ],
      "size": [
        129.4,
        50.9
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus",
      "footprint": [
        [
          678.2,
          652.2
        ],
        [
          680.8,
          679.3
        ],
        [
          776.4,
          692.3
        ],
        [
          774.8,
          666.2
        ],
        [
          807.6,
          670.6
        ],
        [
          806.1,
          647.2
        ],
        [
          777.7,
          641.4
        ],
        [
          765.8,
          644
        ],
        [
          754,
          648.3
        ],
        [
          748.7,
          654.6
        ],
        [
          745.9,
          663.9
        ]
      ]
    },
    {
      "id": "place-05",
      "name": "图书馆",
      "category": "library",
      "position": [
        1110,
        270
      ],
      "size": [
        187.8,
        205.1
      ],
      "height": 20,
      "color": "#fde68a",
      "zoneId": "central-core",
      "footprint": [
        [
          1131.1,
          171.7
        ],
        [
          1126.2,
          228.7
        ],
        [
          1148.7,
          232.9
        ],
        [
          1191.7,
          299.4
        ],
        [
          1211.5,
          305.7
        ],
        [
          1208.1,
          364.8
        ],
        [
          1124.3,
          354
        ],
        [
          1124,
          341.4
        ],
        [
          1054.3,
          330.3
        ],
        [
          1050,
          298.9
        ],
        [
          1027.4,
          293.4
        ],
        [
          1023.7,
          196.7
        ],
        [
          1059.6,
          202.4
        ],
        [
          1059.3,
          159.7
        ]
      ]
    },
    {
      "id": "place-06",
      "name": "行政楼",
      "category": "admin",
      "position": [
        800,
        -20
      ],
      "size": [
        36,
        24
      ],
      "height": 16,
      "color": "#86efac",
      "zoneId": "central-core"
    },
    {
      "id": "place-07",
      "name": "院士楼",
      "category": "academic",
      "position": [
        651,
        423
      ],
      "size": [
        92.4,
        107.7
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          619.5,
          367.3
        ],
        [
          605.9,
          388.9
        ],
        [
          631.7,
          405.1
        ],
        [
          634.2,
          436.7
        ],
        [
          611.5,
          448.9
        ],
        [
          620.7,
          464.1
        ],
        [
          643.5,
          455.6
        ],
        [
          656.5,
          457.1
        ],
        [
          685.8,
          475
        ],
        [
          694.9,
          461.1
        ],
        [
          666.8,
          443.4
        ],
        [
          668.4,
          412
        ],
        [
          698.3,
          402
        ],
        [
          681.7,
          378.2
        ],
        [
          655.4,
          388.3
        ],
        [
          641.2,
          384.4
        ]
      ]
    },
    {
      "id": "place-08",
      "name": "环境科学与工程学院",
      "category": "academic",
      "position": [
        80,
        180
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-09",
      "name": "外国语学院",
      "category": "academic",
      "position": [
        410,
        141
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-10",
      "name": "电子与信息工程学院",
      "category": "academic",
      "position": [
        70,
        -151
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-11",
      "name": "化学与生物工程学院",
      "category": "academic",
      "position": [
        230,
        -219
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-12",
      "name": "逸夫楼",
      "category": "academic",
      "position": [
        220,
        -110
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-13",
      "name": "塔影阁",
      "category": "landscape",
      "position": [
        1390,
        528
      ],
      "size": [
        28,
        20
      ],
      "height": 4,
      "color": "#86efac",
      "zoneId": "east-campus"
    },
    {
      "id": "place-14",
      "name": "二食堂",
      "category": "canteen",
      "position": [
        -90,
        480
      ],
      "size": [
        184.3,
        110.5
      ],
      "height": 10,
      "color": "#fca5a5",
      "zoneId": "west-campus",
      "footprint": [
        [
          -198.8,
          434
        ],
        [
          -197.1,
          515.2
        ],
        [
          -14.5,
          544.5
        ],
        [
          -16.3,
          462.6
        ],
        [
          -56.4,
          456.2
        ],
        [
          -55.6,
          490.9
        ],
        [
          -90.3,
          485.3
        ],
        [
          -91,
          451.3
        ]
      ]
    },
    {
      "id": "place-15",
      "name": "三食堂",
      "category": "canteen",
      "position": [
        639.5,
        82
      ],
      "size": [
        32,
        22
      ],
      "height": 10,
      "color": "#fca5a5",
      "zoneId": "central-core"
    },
    {
      "id": "place-16",
      "name": "东区食堂",
      "category": "canteen",
      "position": [
        1327,
        -71
      ],
      "size": [
        32,
        22
      ],
      "height": 10,
      "color": "#fca5a5",
      "zoneId": "east-campus"
    },
    {
      "id": "place-17",
      "name": "校医院",
      "category": "service",
      "position": [
        990,
        320
      ],
      "size": [
        28,
        18
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "central-core"
    },
    {
      "id": "place-18",
      "name": "东区宿舍",
      "category": "dorm",
      "position": [
        1490,
        -21
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "east-campus"
    },
    {
      "id": "place-19",
      "name": "南区宿舍",
      "category": "dorm",
      "position": [
        830,
        780
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "south-campus"
    },
    {
      "id": "place-20",
      "name": "传媒与视觉艺术学院",
      "category": "academic",
      "position": [
        1040,
        430
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core"
    },
    {
      "id": "place-21",
      "name": "西区快递点",
      "category": "service",
      "position": [
        120,
        490
      ],
      "size": [
        28,
        18
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "west-campus"
    },
    {
      "id": "place-22",
      "name": "东区快递点",
      "category": "service",
      "position": [
        1164,
        -58
      ],
      "size": [
        28,
        18
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "east-campus"
    },
    {
      "id": "place-23",
      "name": "足球场",
      "category": "sports",
      "position": [
        160,
        700
      ],
      "size": [
        70,
        42
      ],
      "height": 3,
      "color": "#67e8f9",
      "zoneId": "sports-belt"
    },
    {
      "id": "place-24",
      "name": "体育馆1",
      "category": "sports",
      "position": [
        581,
        -44
      ],
      "size": [
        38,
        26
      ],
      "height": 12,
      "color": "#67e8f9",
      "zoneId": "central-core"
    },
    {
      "id": "place-25",
      "name": "西区宿舍4组团",
      "category": "dorm",
      "position": [
        -295,
        608
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-26",
      "name": "员工宿舍",
      "category": "dorm",
      "position": [
        -250,
        460
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-27",
      "name": "西区宿舍3组团",
      "category": "dorm",
      "position": [
        -220,
        320
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-28",
      "name": "西区宿舍2组团",
      "category": "dorm",
      "position": [
        -50,
        340
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-29",
      "name": "西区宿舍5组团",
      "category": "dorm",
      "position": [
        -150,
        614
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-30",
      "name": "西区宿舍1组团",
      "category": "dorm",
      "position": [
        100,
        360
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "west-campus"
    },
    {
      "id": "place-31",
      "name": "环境生物技术研究所",
      "category": "academic",
      "position": [
        50,
        50
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-32",
      "name": "C5教学楼",
      "category": "academic",
      "position": [
        258,
        162
      ],
      "size": [
        109.1,
        66.8
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          211.4,
          129.3
        ],
        [
          320.5,
          147
        ],
        [
          318.5,
          166.7
        ],
        [
          259.2,
          155.5
        ],
        [
          259.4,
          166.2
        ],
        [
          318.2,
          176.4
        ],
        [
          319.2,
          196.1
        ],
        [
          222.1,
          182.9
        ],
        [
          221.9,
          174
        ],
        [
          216.5,
          172
        ],
        [
          217.6,
          139.7
        ],
        [
          211.6,
          138
        ]
      ]
    },
    {
      "id": "place-33",
      "name": "C6教学楼",
      "category": "academic",
      "position": [
        258,
        280
      ],
      "size": [
        171.3,
        75.4
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          176.8,
          236.5
        ],
        [
          346.2,
          262.9
        ],
        [
          347.2,
          284.8
        ],
        [
          304.4,
          278
        ],
        [
          304.7,
          291.4
        ],
        [
          313.7,
          293.7
        ],
        [
          316.1,
          311.9
        ],
        [
          290.2,
          308.6
        ],
        [
          289.3,
          304.9
        ],
        [
          179,
          284.8
        ],
        [
          180.2,
          272.5
        ],
        [
          194.1,
          273
        ],
        [
          194.3,
          260.1
        ],
        [
          175.9,
          256.8
        ]
      ]
    },
    {
      "id": "place-34",
      "name": "地理科学与测绘工程学院",
      "category": "academic",
      "position": [
        420,
        2
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-35",
      "name": "商学院",
      "category": "academic",
      "position": [
        410,
        310
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic"
    },
    {
      "id": "place-36",
      "name": "体育馆2",
      "category": "sports",
      "position": [
        470,
        730
      ],
      "size": [
        38,
        26
      ],
      "height": 12,
      "color": "#67e8f9",
      "zoneId": "sports-belt"
    },
    {
      "id": "place-37",
      "name": "师陶园",
      "category": "landscape",
      "position": [
        625,
        200
      ],
      "size": [
        28,
        20
      ],
      "height": 4,
      "color": "#86efac",
      "zoneId": "central-core"
    },
    {
      "id": "place-38",
      "name": "学宿3",
      "category": "dorm",
      "position": [
        570,
        300
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "central-core"
    },
    {
      "id": "place-39",
      "name": "学宿8",
      "category": "dorm",
      "position": [
        720,
        -158
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "central-core"
    },
    {
      "id": "place-40",
      "name": "音乐厅",
      "category": "service",
      "position": [
        494.5,
        550
      ],
      "size": [
        44.6,
        76.7
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "south-campus",
      "footprint": [
        [
          465.3,
          505.7
        ],
        [
          470.1,
          575.1
        ],
        [
          507.3,
          582.4
        ],
        [
          505.7,
          562.8
        ],
        [
          509.9,
          562.8
        ],
        [
          508.7,
          511.2
        ]
      ]
    },
    {
      "id": "place-41",
      "name": "社会发展与公共管理学院",
      "category": "academic",
      "position": [
        651,
        590
      ],
      "size": [
        34,
        22
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus"
    },
    {
      "id": "place-42",
      "name": "教学4楼",
      "category": "academic",
      "position": [
        830,
        528
      ],
      "size": [
        75.7,
        36.4
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus",
      "footprint": [
        [
          792.5,
          510.3
        ],
        [
          792.1,
          534.6
        ],
        [
          867.8,
          546.7
        ],
        [
          867.6,
          520.4
        ]
      ]
    },
    {
      "id": "place-43",
      "name": "教学5楼",
      "category": "academic",
      "position": [
        818,
        393
      ],
      "size": [
        71.7,
        33.6
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          782,
          376
        ],
        [
          784.6,
          400.8
        ],
        [
          853.7,
          409.6
        ],
        [
          851.7,
          385.7
        ]
      ]
    },
    {
      "id": "place-44",
      "name": "教学3楼",
      "category": "academic",
      "position": [
        898,
        650
      ],
      "size": [
        101.9,
        65.9
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus",
      "footprint": [
        [
          834.7,
          617.9
        ],
        [
          835.3,
          642.8
        ],
        [
          900.6,
          653.2
        ],
        [
          902.6,
          674.8
        ],
        [
          934,
          683.8
        ],
        [
          936.6,
          664.7
        ],
        [
          925.3,
          649.5
        ],
        [
          913.1,
          637.4
        ],
        [
          899.9,
          626
        ]
      ]
    },
    {
      "id": "place-45",
      "name": "教学6楼",
      "category": "academic",
      "position": [
        1040,
        694
      ],
      "size": [
        108.5,
        91.6
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus",
      "footprint": [
        [
          1006.8,
          652.4
        ],
        [
          1010.8,
          672
        ],
        [
          1025.7,
          674.9
        ],
        [
          1025.3,
          708.1
        ],
        [
          1011,
          701.6
        ],
        [
          1012.2,
          729.8
        ],
        [
          1115.3,
          744
        ],
        [
          1112.9,
          669.2
        ]
      ]
    },
    {
      "id": "place-46",
      "name": "教学7楼",
      "category": "academic",
      "position": [
        1040,
        550
      ],
      "size": [
        102.8,
        77.6
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "south-campus",
      "footprint": [
        [
          980.7,
          510.9
        ],
        [
          980.8,
          536.8
        ],
        [
          1059.1,
          554.5
        ],
        [
          1059.2,
          583.1
        ],
        [
          1083.5,
          588.5
        ],
        [
          1076.7,
          526.2
        ]
      ]
    },
    {
      "id": "place-47",
      "name": "敬文书院",
      "category": "dorm",
      "position": [
        1480,
        -169
      ],
      "size": [
        34,
        24
      ],
      "height": 22,
      "color": "#c4b5fd",
      "zoneId": "east-campus"
    },
    {
      "id": "osm-named-356627225",
      "name": "C1教学楼",
      "category": "academic",
      "position": [
        444.1,
        87.5
      ],
      "size": [
        81.5,
        34.7
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          403.4,
          70.2
        ],
        [
          403.7,
          91.4
        ],
        [
          484.9,
          104.9
        ],
        [
          484.6,
          83.7
        ]
      ]
    },
    {
      "id": "osm-named-356627222",
      "name": "C2教学楼",
      "category": "academic",
      "position": [
        445.1,
        169.2
      ],
      "size": [
        76.5,
        35.3
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          406.8,
          151.6
        ],
        [
          482.5,
          163
        ],
        [
          483.3,
          186.9
        ],
        [
          407.6,
          175.4
        ]
      ]
    },
    {
      "id": "osm-named-920093708",
      "name": "C3教学楼",
      "category": "academic",
      "position": [
        438.6,
        245.7
      ],
      "size": [
        77.8,
        34.6
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "west-academic",
      "footprint": [
        [
          400.6,
          229.4
        ],
        [
          401.1,
          249.5
        ],
        [
          478.4,
          264
        ],
        [
          474.3,
          239.8
        ]
      ]
    },
    {
      "id": "osm-named-920093733",
      "name": "8号教学楼",
      "category": "academic",
      "position": [
        999.6,
        461.4
      ],
      "size": [
        105,
        64.9
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          950.3,
          427.9
        ],
        [
          953.4,
          455.5
        ],
        [
          973.3,
          458.6
        ],
        [
          973.5,
          466.2
        ],
        [
          1039.9,
          480.7
        ],
        [
          1040.1,
          490.5
        ],
        [
          1054.5,
          492.8
        ],
        [
          1055.3,
          461.9
        ],
        [
          979.1,
          448.4
        ],
        [
          976.2,
          431.5
        ]
      ]
    },
    {
      "id": "osm-named-920093735",
      "name": "音乐学院",
      "category": "service",
      "position": [
        731.8,
        585.9
      ],
      "size": [
        74.3,
        34.4
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "south-campus",
      "footprint": [
        [
          695.2,
          569
        ],
        [
          695.8,
          592.6
        ],
        [
          769.5,
          603.4
        ],
        [
          766.9,
          578.6
        ]
      ]
    },
    {
      "id": "osm-named-356627226",
      "name": "职工之家",
      "category": "service",
      "position": [
        611.8,
        104.2
      ],
      "size": [
        61.5,
        72.8
      ],
      "height": 10,
      "color": "#fdba74",
      "zoneId": "central-core",
      "footprint": [
        [
          581.1,
          67.8
        ],
        [
          582,
          130.5
        ],
        [
          642.6,
          140.6
        ],
        [
          641.6,
          77.9
        ]
      ]
    },
    {
      "id": "osm-named-920093694",
      "name": "2号楼",
      "category": "academic",
      "position": [
        599.8,
        301.4
      ],
      "size": [
        56.3,
        22.7
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          571.6,
          290.2
        ],
        [
          572,
          304.7
        ],
        [
          627.6,
          312.9
        ],
        [
          627.9,
          297.9
        ]
      ]
    },
    {
      "id": "osm-named-920093693",
      "name": "3号楼",
      "category": "academic",
      "position": [
        596,
        259.6
      ],
      "size": [
        60.4,
        27.7
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          566.3,
          246.1
        ],
        [
          567.5,
          263.2
        ],
        [
          626.7,
          273.8
        ],
        [
          623.4,
          255.1
        ]
      ]
    },
    {
      "id": "osm-named-356627231",
      "name": "5号楼",
      "category": "academic",
      "position": [
        725.2,
        15.8
      ],
      "size": [
        108,
        53.8
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          672.4,
          26.4
        ],
        [
          779.2,
          42.7
        ],
        [
          778,
          5.2
        ],
        [
          671.2,
          -11.1
        ]
      ]
    },
    {
      "id": "osm-named-356627233",
      "name": "8号楼",
      "category": "academic",
      "position": [
        819.4,
        39.8
      ],
      "size": [
        69.4,
        36.5
      ],
      "height": 18,
      "color": "#93c5fd",
      "zoneId": "central-core",
      "footprint": [
        [
          789.7,
          42.9
        ],
        [
          817.7,
          47.7
        ],
        [
          817.7,
          41.7
        ],
        [
          834.8,
          44.6
        ],
        [
          834.9,
          50.7
        ],
        [
          859,
          54.8
        ],
        [
          858.8,
          29
        ],
        [
          795.8,
          18.3
        ],
        [
          796,
          34.7
        ],
        [
          789.6,
          33.7
        ]
      ]
    }
  ],
  "roads": [
    {
      "id": "graph-road-01-180m",
      "points": [
        [
          943,
          -219
        ],
        [
          800,
          -20
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-02-330m",
      "points": [
        [
          943,
          -219
        ],
        [
          1164,
          -58
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-03-200m",
      "points": [
        [
          943,
          -219
        ],
        [
          720,
          -158
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-04-105m",
      "points": [
        [
          -240,
          140
        ],
        [
          80,
          180
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-05-110m",
      "points": [
        [
          -240,
          140
        ],
        [
          -50,
          340
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-06-120m",
      "points": [
        [
          267,
          36
        ],
        [
          220,
          -110
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-07-60m",
      "points": [
        [
          267,
          36
        ],
        [
          258,
          162
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-08-100m",
      "points": [
        [
          267,
          36
        ],
        [
          420,
          2
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-09-60m",
      "points": [
        [
          756,
          660
        ],
        [
          651,
          590
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-10-100m",
      "points": [
        [
          756,
          660
        ],
        [
          830,
          528
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-11-70m",
      "points": [
        [
          756,
          660
        ],
        [
          898,
          650
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-12-280m",
      "points": [
        [
          1110,
          270
        ],
        [
          800,
          -20
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-13-280m",
      "points": [
        [
          1110,
          270
        ],
        [
          1390,
          528
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-14-180m",
      "points": [
        [
          1110,
          270
        ],
        [
          1040,
          430
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-15-70m",
      "points": [
        [
          800,
          -20
        ],
        [
          640,
          82
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-16-250m",
      "points": [
        [
          800,
          -20
        ],
        [
          990,
          320
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-17-530m",
      "points": [
        [
          800,
          -20
        ],
        [
          1164,
          -58
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-18-100m",
      "points": [
        [
          800,
          -20
        ],
        [
          581,
          -44
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-19-90m",
      "points": [
        [
          800,
          -20
        ],
        [
          720,
          -158
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-20-200m",
      "points": [
        [
          651,
          423
        ],
        [
          570,
          300
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-21-120m",
      "points": [
        [
          651,
          423
        ],
        [
          495,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-22-100m",
      "points": [
        [
          651,
          423
        ],
        [
          651,
          590
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-23-100m",
      "points": [
        [
          651,
          423
        ],
        [
          830,
          528
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-24-80m",
      "points": [
        [
          651,
          423
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-25-230m",
      "points": [
        [
          80,
          180
        ],
        [
          100,
          360
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-26-90m",
      "points": [
        [
          80,
          180
        ],
        [
          50,
          50
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-27-160m",
      "points": [
        [
          80,
          180
        ],
        [
          258,
          280
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-28-100m",
      "points": [
        [
          410,
          141
        ],
        [
          258,
          162
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-29-60m",
      "points": [
        [
          410,
          141
        ],
        [
          420,
          2
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-30-60m",
      "points": [
        [
          410,
          141
        ],
        [
          410,
          310
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-31-55m",
      "points": [
        [
          70,
          -151
        ],
        [
          230,
          -219
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-32-35m",
      "points": [
        [
          70,
          -151
        ],
        [
          220,
          -110
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-33-140m",
      "points": [
        [
          70,
          -151
        ],
        [
          50,
          50
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-34-65m",
      "points": [
        [
          230,
          -219
        ],
        [
          220,
          -110
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-35-600m",
      "points": [
        [
          1390,
          528
        ],
        [
          1164,
          -58
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-36-300m",
      "points": [
        [
          1390,
          528
        ],
        [
          1040,
          694
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-37-200m",
      "points": [
        [
          -90,
          480
        ],
        [
          120,
          490
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-38-100m",
      "points": [
        [
          -90,
          480
        ],
        [
          -50,
          340
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-39-90m",
      "points": [
        [
          -90,
          480
        ],
        [
          -150,
          614
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-40-50m",
      "points": [
        [
          640,
          82
        ],
        [
          581,
          -44
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-41-50m",
      "points": [
        [
          640,
          82
        ],
        [
          625,
          200
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-42-100m",
      "points": [
        [
          1327,
          -71
        ],
        [
          1490,
          -21
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-43-100m",
      "points": [
        [
          1327,
          -71
        ],
        [
          1164,
          -58
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-44-140m",
      "points": [
        [
          1327,
          -71
        ],
        [
          1480,
          -169
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-45-40m",
      "points": [
        [
          990,
          320
        ],
        [
          1040,
          430
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-46-80m",
      "points": [
        [
          990,
          320
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-47-70m",
      "points": [
        [
          1490,
          -21
        ],
        [
          1480,
          -169
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-48-400m",
      "points": [
        [
          830,
          780
        ],
        [
          470,
          730
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-49-70m",
      "points": [
        [
          830,
          780
        ],
        [
          898,
          650
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-50-70m",
      "points": [
        [
          830,
          780
        ],
        [
          1040,
          694
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-51-80m",
      "points": [
        [
          1040,
          430
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-52-50m",
      "points": [
        [
          1040,
          430
        ],
        [
          1040,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-53-170m",
      "points": [
        [
          120,
          490
        ],
        [
          160,
          700
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-54-70m",
      "points": [
        [
          120,
          490
        ],
        [
          100,
          360
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-55-180m",
      "points": [
        [
          160,
          700
        ],
        [
          -150,
          614
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-56-150m",
      "points": [
        [
          160,
          700
        ],
        [
          470,
          730
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-57-110m",
      "points": [
        [
          581,
          -44
        ],
        [
          420,
          2
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-58-70m",
      "points": [
        [
          581,
          -44
        ],
        [
          720,
          -158
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-59-100m",
      "points": [
        [
          -295,
          608
        ],
        [
          -250,
          460
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-60-70m",
      "points": [
        [
          -295,
          608
        ],
        [
          -150,
          614
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-61-100m",
      "points": [
        [
          -250,
          460
        ],
        [
          -220,
          320
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-62-60m",
      "points": [
        [
          -220,
          320
        ],
        [
          -50,
          340
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-63-80m",
      "points": [
        [
          -50,
          340
        ],
        [
          100,
          360
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-64-180m",
      "points": [
        [
          100,
          360
        ],
        [
          258,
          280
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-65-60m",
      "points": [
        [
          258,
          162
        ],
        [
          258,
          280
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-66-300m",
      "points": [
        [
          258,
          280
        ],
        [
          120,
          490
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-67-100m",
      "points": [
        [
          258,
          280
        ],
        [
          410,
          310
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-68-260m",
      "points": [
        [
          470,
          730
        ],
        [
          651,
          590
        ]
      ],
      "width": 5,
      "color": "#64748b"
    },
    {
      "id": "graph-road-69-60m",
      "points": [
        [
          625,
          200
        ],
        [
          570,
          300
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-70-180m",
      "points": [
        [
          625,
          200
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-71-200m",
      "points": [
        [
          570,
          300
        ],
        [
          495,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-72-170m",
      "points": [
        [
          570,
          300
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-73-60m",
      "points": [
        [
          495,
          550
        ],
        [
          651,
          590
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-74-100m",
      "points": [
        [
          651,
          590
        ],
        [
          830,
          528
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-75-80m",
      "points": [
        [
          830,
          528
        ],
        [
          818,
          393
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-76-70m",
      "points": [
        [
          830,
          528
        ],
        [
          898,
          650
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-77-120m",
      "points": [
        [
          830,
          528
        ],
        [
          1040,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-78-150m",
      "points": [
        [
          818,
          393
        ],
        [
          1040,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-79-40m",
      "points": [
        [
          898,
          650
        ],
        [
          1040,
          694
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    },
    {
      "id": "graph-road-80-80m",
      "points": [
        [
          1040,
          694
        ],
        [
          1040,
          550
        ]
      ],
      "width": 3.2,
      "color": "#94a3b8"
    }
  ],
  "waters": [
    {
      "id": "shitao-garden-water",
      "name": "师陶园水景",
      "center": [
        625,
        200
      ],
      "size": [
        42,
        28
      ],
      "color": "#60a5fa"
    }
  ],
  "fields": [
    {
      "id": "football-field",
      "name": "足球场",
      "center": [
        160,
        700
      ],
      "size": [
        78,
        48
      ],
      "color": "#4ade80",
      "stripeColor": "#86efac"
    }
  ],
  "trees": [
    [
      -210,
      250
    ],
    [
      -120,
      285
    ],
    [
      20,
      305
    ],
    [
      145,
      600
    ],
    [
      260,
      640
    ],
    [
      380,
      675
    ],
    [
      510,
      650
    ],
    [
      620,
      120
    ],
    [
      690,
      230
    ],
    [
      760,
      360
    ],
    [
      880,
      235
    ],
    [
      980,
      455
    ],
    [
      1090,
      315
    ],
    [
      1240,
      55
    ],
    [
      1390,
      150
    ],
    [
      1510,
      -90
    ]
  ],
  "pois": [
    {
      "id": "poi-place-01",
      "name": "一号门",
      "kind": "gate",
      "position": [
        943,
        9,
        -219
      ],
      "color": "#fb923c",
      "sourceBuildingId": "place-01"
    },
    {
      "id": "poi-place-02",
      "name": "二号门",
      "kind": "gate",
      "position": [
        -240,
        9,
        140
      ],
      "color": "#fb923c",
      "sourceBuildingId": "place-02"
    },
    {
      "id": "poi-place-03",
      "name": "C4教学楼",
      "kind": "landmark",
      "position": [
        267,
        22,
        36
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-03"
    },
    {
      "id": "poi-place-04",
      "name": "教学2楼",
      "kind": "landmark",
      "position": [
        756,
        22,
        660
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-04"
    },
    {
      "id": "poi-place-05",
      "name": "图书馆",
      "kind": "landmark",
      "position": [
        1110,
        24,
        270
      ],
      "color": "#fde68a",
      "sourceBuildingId": "place-05"
    },
    {
      "id": "poi-place-06",
      "name": "行政楼",
      "kind": "landmark",
      "position": [
        800,
        20,
        -20
      ],
      "color": "#86efac",
      "sourceBuildingId": "place-06"
    },
    {
      "id": "poi-place-07",
      "name": "院士楼",
      "kind": "landmark",
      "position": [
        651,
        22,
        423
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-07"
    },
    {
      "id": "poi-place-08",
      "name": "环境科学与工程学院",
      "kind": "landmark",
      "position": [
        80,
        22,
        180
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-08"
    },
    {
      "id": "poi-place-09",
      "name": "外国语学院",
      "kind": "landmark",
      "position": [
        410,
        22,
        141
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-09"
    },
    {
      "id": "poi-place-10",
      "name": "电子与信息工程学院",
      "kind": "landmark",
      "position": [
        70,
        22,
        -151
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-10"
    },
    {
      "id": "poi-place-11",
      "name": "化学与生物工程学院",
      "kind": "landmark",
      "position": [
        230,
        22,
        -219
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-11"
    },
    {
      "id": "poi-place-12",
      "name": "逸夫楼",
      "kind": "landmark",
      "position": [
        220,
        22,
        -110
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-12"
    },
    {
      "id": "poi-place-13",
      "name": "塔影阁",
      "kind": "landmark",
      "position": [
        1390,
        8,
        528
      ],
      "color": "#86efac",
      "sourceBuildingId": "place-13"
    },
    {
      "id": "poi-place-14",
      "name": "二食堂",
      "kind": "service",
      "position": [
        -90,
        14,
        480
      ],
      "color": "#fca5a5",
      "sourceBuildingId": "place-14"
    },
    {
      "id": "poi-place-15",
      "name": "三食堂",
      "kind": "service",
      "position": [
        639.5,
        14,
        82
      ],
      "color": "#fca5a5",
      "sourceBuildingId": "place-15"
    },
    {
      "id": "poi-place-16",
      "name": "东区食堂",
      "kind": "service",
      "position": [
        1327,
        14,
        -71
      ],
      "color": "#fca5a5",
      "sourceBuildingId": "place-16"
    },
    {
      "id": "poi-place-17",
      "name": "校医院",
      "kind": "service",
      "position": [
        990,
        14,
        320
      ],
      "color": "#fdba74",
      "sourceBuildingId": "place-17"
    },
    {
      "id": "poi-place-18",
      "name": "东区宿舍",
      "kind": "landmark",
      "position": [
        1490,
        26,
        -21
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-18"
    },
    {
      "id": "poi-place-19",
      "name": "南区宿舍",
      "kind": "landmark",
      "position": [
        830,
        26,
        780
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-19"
    },
    {
      "id": "poi-place-20",
      "name": "传媒与视觉艺术学院",
      "kind": "landmark",
      "position": [
        1040,
        22,
        430
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-20"
    },
    {
      "id": "poi-place-21",
      "name": "西区快递点",
      "kind": "service",
      "position": [
        120,
        14,
        490
      ],
      "color": "#fdba74",
      "sourceBuildingId": "place-21"
    },
    {
      "id": "poi-place-22",
      "name": "东区快递点",
      "kind": "service",
      "position": [
        1164,
        14,
        -58
      ],
      "color": "#fdba74",
      "sourceBuildingId": "place-22"
    },
    {
      "id": "poi-place-23",
      "name": "足球场",
      "kind": "landmark",
      "position": [
        160,
        7,
        700
      ],
      "color": "#67e8f9",
      "sourceBuildingId": "place-23"
    },
    {
      "id": "poi-place-24",
      "name": "体育馆1",
      "kind": "landmark",
      "position": [
        581,
        16,
        -44
      ],
      "color": "#67e8f9",
      "sourceBuildingId": "place-24"
    },
    {
      "id": "poi-place-25",
      "name": "西区宿舍4组团",
      "kind": "landmark",
      "position": [
        -295,
        26,
        608
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-25"
    },
    {
      "id": "poi-place-26",
      "name": "员工宿舍",
      "kind": "landmark",
      "position": [
        -250,
        26,
        460
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-26"
    },
    {
      "id": "poi-place-27",
      "name": "西区宿舍3组团",
      "kind": "landmark",
      "position": [
        -220,
        26,
        320
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-27"
    },
    {
      "id": "poi-place-28",
      "name": "西区宿舍2组团",
      "kind": "landmark",
      "position": [
        -50,
        26,
        340
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-28"
    },
    {
      "id": "poi-place-29",
      "name": "西区宿舍5组团",
      "kind": "landmark",
      "position": [
        -150,
        26,
        614
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-29"
    },
    {
      "id": "poi-place-30",
      "name": "西区宿舍1组团",
      "kind": "landmark",
      "position": [
        100,
        26,
        360
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-30"
    },
    {
      "id": "poi-place-31",
      "name": "环境生物技术研究所",
      "kind": "landmark",
      "position": [
        50,
        22,
        50
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-31"
    },
    {
      "id": "poi-place-32",
      "name": "C5教学楼",
      "kind": "landmark",
      "position": [
        258,
        22,
        162
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-32"
    },
    {
      "id": "poi-place-33",
      "name": "C6教学楼",
      "kind": "landmark",
      "position": [
        258,
        22,
        280
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-33"
    },
    {
      "id": "poi-place-34",
      "name": "地理科学与测绘工程学院",
      "kind": "landmark",
      "position": [
        420,
        22,
        2
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-34"
    },
    {
      "id": "poi-place-35",
      "name": "商学院",
      "kind": "landmark",
      "position": [
        410,
        22,
        310
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-35"
    },
    {
      "id": "poi-place-36",
      "name": "体育馆2",
      "kind": "landmark",
      "position": [
        470,
        16,
        730
      ],
      "color": "#67e8f9",
      "sourceBuildingId": "place-36"
    },
    {
      "id": "poi-place-37",
      "name": "师陶园",
      "kind": "landmark",
      "position": [
        625,
        8,
        200
      ],
      "color": "#86efac",
      "sourceBuildingId": "place-37"
    },
    {
      "id": "poi-place-38",
      "name": "学宿3",
      "kind": "landmark",
      "position": [
        570,
        26,
        300
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-38"
    },
    {
      "id": "poi-place-39",
      "name": "学宿8",
      "kind": "landmark",
      "position": [
        720,
        26,
        -158
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-39"
    },
    {
      "id": "poi-place-40",
      "name": "音乐厅",
      "kind": "service",
      "position": [
        494.5,
        14,
        550
      ],
      "color": "#fdba74",
      "sourceBuildingId": "place-40"
    },
    {
      "id": "poi-place-41",
      "name": "社会发展与公共管理学院",
      "kind": "landmark",
      "position": [
        651,
        22,
        590
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-41"
    },
    {
      "id": "poi-place-42",
      "name": "教学4楼",
      "kind": "landmark",
      "position": [
        830,
        22,
        528
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-42"
    },
    {
      "id": "poi-place-43",
      "name": "教学5楼",
      "kind": "landmark",
      "position": [
        818,
        22,
        393
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-43"
    },
    {
      "id": "poi-place-44",
      "name": "教学3楼",
      "kind": "landmark",
      "position": [
        898,
        22,
        650
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-44"
    },
    {
      "id": "poi-place-45",
      "name": "教学6楼",
      "kind": "landmark",
      "position": [
        1040,
        22,
        694
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-45"
    },
    {
      "id": "poi-place-46",
      "name": "教学7楼",
      "kind": "landmark",
      "position": [
        1040,
        22,
        550
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "place-46"
    },
    {
      "id": "poi-place-47",
      "name": "敬文书院",
      "kind": "landmark",
      "position": [
        1480,
        26,
        -169
      ],
      "color": "#c4b5fd",
      "sourceBuildingId": "place-47"
    },
    {
      "id": "poi-osm-named-356627225",
      "name": "C1教学楼",
      "kind": "landmark",
      "position": [
        444.1,
        22,
        87.5
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-356627225"
    },
    {
      "id": "poi-osm-named-356627222",
      "name": "C2教学楼",
      "kind": "landmark",
      "position": [
        445.1,
        22,
        169.2
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-356627222"
    },
    {
      "id": "poi-osm-named-920093708",
      "name": "C3教学楼",
      "kind": "landmark",
      "position": [
        438.6,
        22,
        245.7
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-920093708"
    },
    {
      "id": "poi-osm-named-920093733",
      "name": "8号教学楼",
      "kind": "landmark",
      "position": [
        999.6,
        22,
        461.4
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-920093733"
    },
    {
      "id": "poi-osm-named-920093735",
      "name": "音乐学院",
      "kind": "service",
      "position": [
        731.8,
        14,
        585.9
      ],
      "color": "#fdba74",
      "sourceBuildingId": "osm-named-920093735"
    },
    {
      "id": "poi-osm-named-356627226",
      "name": "职工之家",
      "kind": "service",
      "position": [
        611.8,
        14,
        104.2
      ],
      "color": "#fdba74",
      "sourceBuildingId": "osm-named-356627226"
    },
    {
      "id": "poi-osm-named-920093694",
      "name": "2号楼",
      "kind": "landmark",
      "position": [
        599.8,
        22,
        301.4
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-920093694"
    },
    {
      "id": "poi-osm-named-920093693",
      "name": "3号楼",
      "kind": "landmark",
      "position": [
        596,
        22,
        259.6
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-920093693"
    },
    {
      "id": "poi-osm-named-356627231",
      "name": "5号楼",
      "kind": "landmark",
      "position": [
        725.2,
        22,
        15.8
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-356627231"
    },
    {
      "id": "poi-osm-named-356627233",
      "name": "8号楼",
      "kind": "landmark",
      "position": [
        819.4,
        22,
        39.8
      ],
      "color": "#93c5fd",
      "sourceBuildingId": "osm-named-356627233"
    }
  ],
  "routes": [
    {
      "id": "west-gate-to-library-graph-shortest",
      "name": "从二号门到图书馆（graph 最短路 975m）",
      "points": [
        [
          -240,
          6,
          140
        ],
        [
          80,
          6,
          180
        ],
        [
          258,
          6,
          280
        ],
        [
          258,
          6,
          162
        ],
        [
          267,
          6,
          36
        ],
        [
          420,
          6,
          2
        ],
        [
          581,
          6,
          -44
        ],
        [
          800,
          6,
          -20
        ],
        [
          1110,
          6,
          270
        ]
      ],
      "steps": [
        "从二号门进入校园，先到环境科学与工程学院节点。",
        "沿西部教学区路线依次经过 C6、C5、C4 教学楼。",
        "继续前往地理科学与测绘工程学院，再经过体育馆1。",
        "到达行政楼后转向图书馆，完成 975m 示例路线。"
      ],
      "landmarks": [
        "二号门",
        "环境科学与工程学院",
        "C6教学楼",
        "C5教学楼",
        "C4教学楼",
        "地理科学与测绘工程学院",
        "体育馆1",
        "行政楼",
        "图书馆"
      ]
    }
  ]
}

export function cloneCampusData(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}

export function createDefaultCampusData(): CampusData {
  return cloneCampusData(baseCampusData)
}

export const campusData = createDefaultCampusData()
