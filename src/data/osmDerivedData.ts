export interface OSMBuildingSeed {
  id: string
  name: string
  category: 'dorm' | 'academic' | 'sports' | 'service' | 'library' | 'gate' | 'canteen' | 'poi' | 'admin'
  position: [number, number]
  size: [number, number]
  height: number
  zoneId: string
  color?: string
  footprint: [number, number][]
}

export interface OSMRoadSeed {
  id: string
  points: [number, number][]
  width: number
  color?: string
}

export interface OSMFieldSeed {
  id: string
  name: string
  center: [number, number]
  size: [number, number]
  color?: string
  stripeColor?: string
}

export const osmBuildings: OSMBuildingSeed[] = [
  {
    id: "osm-building-1",
    name: "建筑1",
    category: "academic",
    position: [-129.3, -30.3],
    size: [12.0, 2.2],
    height: 16.2,
    zoneId: "west-academic",
    footprint: [
      [-135.2, -29.2],
      [-123.3, -29.3],
      [-123.3, -31.4],
      [-135.3, -31.3]
    ]
  },
  {
    id: "canteen-2",
    name: "二食堂",
    category: "canteen",
    position: [-138.3, -37.7],
    size: [23.2, 8.1],
    height: 10,
    zoneId: "west-academic",
    color: "#fca5a5",
    footprint: [
      [-152.1, -34.9],
      [-152.1, -42.9],
      [-128.9, -42.9],
      [-128.9, -34.8],
      [-134.0, -34.8],
      [-134.0, -38.2],
      [-138.4, -38.2],
      [-138.4, -34.9]
    ]
  },
  {
    id: "osm-building-2",
    name: "建筑2",
    category: "academic",
    position: [102.3, 94.0],
    size: [20.0, 24.9],
    height: 18.5,
    zoneId: "library-east-link",
    footprint: [
      [103.6, 90.7],
      [100.0, 85.1],
      [96.1, 86.4],
      [96.8, 91.9],
      [105.4, 91.6],
      [108.7, 92.2],
      [110.0, 96.3],
      [112.1, 104.3],
      [111.9, 105.1],
      [111.6, 105.7],
      [110.8, 106.4],
      [109.6, 107.0],
      [108.6, 107.2],
      [106.6, 107.2],
      [105.3, 106.8],
      [104.2, 106.0],
      [103.5, 105.1],
      [103.5, 98.8],
      [103.4, 95.2],
      [102.8, 94.5],
      [102.0, 94.3],
      [97.4, 94.1],
      [95.0, 93.9],
      [93.7, 93.3],
      [92.8, 92.3],
      [92.4, 90.9],
      [92.3, 88.6],
      [92.1, 86.4],
      [93.3, 85.3],
      [96.2, 83.4],
      [99.2, 82.3],
      [100.4, 82.3],
      [101.9, 82.7],
      [103.1, 83.2],
      [104.2, 84.3],
      [105.8, 87.4],
      [107.3, 89.7]
    ]
  },
  {
    id: "osm-building-3",
    name: "建筑3",
    category: "academic",
    position: [-72.5, -52.9],
    size: [31.3, 10.9],
    height: 19,
    zoneId: "west-academic",
    footprint: [
      [-93.5, -47.5],
      [-67.0, -47.5],
      [-67.0, -48.6],
      [-62.3, -48.6],
      [-62.2, -57.2],
      [-67.2, -57.1],
      [-67.0, -58.4],
      [-93.5, -58.4]
    ]
  },
  {
    id: "osm-building-4",
    name: "建筑4",
    category: "academic",
    position: [-61.8, -74.5],
    size: [13.1, 6.3],
    height: 16.4,
    zoneId: "west-academic",
    footprint: [
      [-70.0, -71.3],
      [-70.0, -77.6],
      [-58.6, -77.6],
      [-56.9, -76.5],
      [-56.9, -72.4],
      [-58.5, -71.3]
    ]
  },
  {
    id: "c2",
    name: "C2教学楼",
    category: "academic",
    position: [-62.1, 5.4],
    size: [9.7, 2.4],
    height: 15.7,
    zoneId: "west-dorm",
    footprint: [
      [-67.0, 6.6],
      [-57.3, 6.6],
      [-57.3, 4.2],
      [-66.9, 4.2]
    ]
  },
  {
    id: "c1",
    name: "C1教学楼",
    category: "academic",
    position: [-62.0, 13.5],
    size: [10.4, 2.2],
    height: 15.9,
    zoneId: "west-dorm",
    footprint: [
      [-67.2, 14.6],
      [-67.2, 12.5],
      [-56.8, 12.4],
      [-56.8, 14.5]
    ]
  },
  {
    id: "staff-home",
    name: "职工之家",
    category: "service",
    position: [-40.6, 14.5],
    size: [7.8, 6.2],
    height: 9,
    zoneId: "central-core",
    color: "#fdba74",
    footprint: [
      [-44.4, 17.6],
      [-44.5, 11.4],
      [-36.8, 11.4],
      [-36.7, 17.6]
    ]
  },
  {
    id: "osm-building-5",
    name: "建筑5",
    category: "academic",
    position: [-18.8, 10.7],
    size: [14.9, 10.9],
    height: 16.7,
    zoneId: "central-core",
    footprint: [
      [-26.4, 16.9],
      [-11.5, 17.0],
      [-11.5, 12.9],
      [-22.4, 12.9],
      [-22.4, 10.3],
      [-14.6, 10.3],
      [-14.6, 6.1],
      [-19.3, 6.1],
      [-19.3, 7.1],
      [-26.3, 7.1]
    ]
  },
  {
    id: "dorm-5",
    name: "5号楼",
    category: "dorm",
    position: [-25.9, 25.0],
    size: [13.7, 3.7],
    height: 15.5,
    zoneId: "central-core",
    color: "#c4b5fd",
    footprint: [
      [-32.6, 23.2],
      [-19.0, 23.2],
      [-19.1, 26.9],
      [-32.7, 26.8]
    ]
  },
  {
    id: "dorm-8",
    name: "8号楼",
    category: "dorm",
    position: [-13.9, 24.1],
    size: [8.9, 2.6],
    height: 14.6,
    zoneId: "central-core",
    color: "#c4b5fd",
    footprint: [
      [-17.7, 23.4],
      [-14.1, 23.3],
      [-14.1, 23.9],
      [-11.9, 23.9],
      [-11.9, 23.3],
      [-8.9, 23.3],
      [-8.8, 25.8],
      [-16.8, 25.9],
      [-16.9, 24.3],
      [-17.7, 24.3]
    ]
  },
  {
    id: "osm-building-6",
    name: "建筑6",
    category: "academic",
    position: [-30.9, 54.2],
    size: [35.8, 18.4],
    height: 19,
    zoneId: "sports-belt",
    footprint: [
      [-45.6, 54.3],
      [-45.7, 46.5],
      [-45.0, 46.0],
      [-43.8, 45.8],
      [-34.0, 49.7],
      [-34.4, 50.2],
      [-32.3, 51.0],
      [-33.7, 52.7],
      [-32.7, 53.1],
      [-33.0, 53.7],
      [-31.1, 54.6],
      [-29.2, 52.8],
      [-27.2, 51.8],
      [-22.9, 53.5],
      [-25.9, 57.1],
      [-23.0, 58.3],
      [-15.9, 49.9],
      [-9.9, 52.3],
      [-19.9, 64.2],
      [-27.7, 61.0],
      [-25.7, 58.7],
      [-27.3, 58.1],
      [-29.3, 60.5],
      [-35.0, 58.2],
      [-32.9, 55.6],
      [-33.9, 55.2],
      [-36.2, 58.0]
    ]
  },
  {
    id: "osm-building-7",
    name: "建筑7",
    category: "academic",
    position: [-23.8, 46.0],
    size: [24.3, 5.3],
    height: 18.4,
    zoneId: "central-core",
    footprint: [
      [-37.2, 44.8],
      [-26.4, 43.8],
      [-14.5, 43.5],
      [-13.5, 44.1],
      [-13.2, 44.8],
      [-16.8, 48.8],
      [-18.6, 48.0],
      [-18.6, 47.4],
      [-19.3, 46.9],
      [-20.7, 46.6],
      [-26.9, 47.0],
      [-32.2, 48.0],
      [-37.2, 45.7],
      [-37.5, 45.2]
    ]
  },
  {
    id: "osm-building-8",
    name: "建筑8",
    category: "academic",
    position: [-36.4, 65.7],
    size: [7.8, 8.4],
    height: 15.5,
    zoneId: "sports-belt",
    footprint: [
      [-35.9, 61.4],
      [-31.3, 63.3],
      [-36.7, 69.8],
      [-39.0, 68.9],
      [-39.1, 65.2]
    ]
  },
  {
    id: "osm-building-9",
    name: "建筑9",
    category: "academic",
    position: [-42.9, 66.8],
    size: [8.8, 18.1],
    height: 17.3,
    zoneId: "sports-belt",
    footprint: [
      [-45.4, 58.5],
      [-42.6, 58.5],
      [-37.7, 60.6],
      [-40.8, 64.2],
      [-40.8, 72.6],
      [-44.1, 76.6],
      [-46.5, 75.7],
      [-45.2, 67.3]
    ]
  },
  {
    id: "osm-building-10",
    name: "建筑10",
    category: "academic",
    position: [-32.4, 71.4],
    size: [18.4, 16.0],
    height: 17.3,
    zoneId: "sports-belt",
    footprint: [
      [-31.9, 66.6],
      [-29.2, 67.6],
      [-35.6, 75.3],
      [-38.2, 74.3],
      [-40.3, 76.8],
      [-32.7, 79.9],
      [-21.9, 67.0],
      [-29.7, 63.9]
    ]
  },
  {
    id: "osm-building-11",
    name: "建筑11",
    category: "academic",
    position: [-40.2, 83.5],
    size: [12.5, 11.3],
    height: 16.2,
    zoneId: "sports-belt",
    footprint: [
      [-41.6, 80.5],
      [-38.9, 81.5],
      [-39.8, 82.6],
      [-38.5, 83.1],
      [-40.8, 86.0],
      [-43.6, 85.0],
      [-45.6, 87.5],
      [-39.8, 89.6],
      [-33.1, 80.9],
      [-40.0, 78.3]
    ]
  },
  {
    id: "osm-building-12",
    name: "建筑12",
    category: "academic",
    position: [-46.6, 81.9],
    size: [5.3, 8.8],
    height: 15.6,
    zoneId: "west-dorm",
    footprint: [
      [-49.3, 85.6],
      [-48.1, 86.0],
      [-44.9, 82.3],
      [-44.0, 78.3],
      [-46.9, 77.2]
    ]
  },
  {
    id: "osm-building-13",
    name: "建筑13",
    category: "academic",
    position: [-4.2, 70.2],
    size: [8.7, 6.1],
    height: 15.6,
    zoneId: "south-teaching",
    footprint: [
      [-8.6, 71.0],
      [-3.1, 73.2],
      [0.1, 69.3],
      [-5.4, 67.1]
    ]
  },
  {
    id: "osm-building-14",
    name: "建筑14",
    category: "academic",
    position: [-10.9, 83.6],
    size: [30.8, 18.5],
    height: 19,
    zoneId: "sports-belt",
    footprint: [
      [-24.1, 90.6],
      [-18.8, 84.4],
      [-17.1, 85.1],
      [-16.5, 84.3],
      [-18.7, 83.4],
      [-16.5, 80.8],
      [-15.6, 81.1],
      [-14.5, 79.9],
      [-15.9, 79.4],
      [-13.3, 76.4],
      [-11.5, 77.1],
      [-10.3, 75.7],
      [-7.3, 76.9],
      [-4.3, 73.3],
      [6.7, 77.8],
      [4.3, 80.7],
      [3.6, 80.4],
      [2.9, 81.3],
      [2.2, 81.0],
      [1.6, 81.7],
      [-9.6, 77.2],
      [-11.3, 79.2],
      [-2.5, 82.7],
      [-3.6, 83.9],
      [-12.1, 80.5],
      [-14.4, 83.3],
      [-8.1, 85.9],
      [-7.3, 84.9],
      [-6.1, 85.4],
      [-7.0, 86.4],
      [-7.5, 86.1],
      [-8.1, 87.0],
      [-8.8, 87.1],
      [-15.3, 84.4],
      [-17.7, 87.2],
      [-12.8, 89.3],
      [-14.2, 90.9],
      [-18.7, 89.1],
      [-18.9, 89.3],
      [-17.8, 89.8],
      [-19.4, 91.8],
      [-21.4, 91.0],
      [-21.9, 91.5]
    ]
  },
  {
    id: "osm-building-15",
    name: "建筑15",
    category: "academic",
    position: [64.4, 56.8],
    size: [14.8, 2.7],
    height: 16.7,
    zoneId: "south-teaching",
    footprint: [
      [57.2, 57.7],
      [64.2, 57.5],
      [71.5, 58.1],
      [71.8, 56.2],
      [64.6, 55.4],
      [57.0, 55.9]
    ]
  },
  {
    id: "osm-building-16",
    name: "建筑16",
    category: "academic",
    position: [71.0, 61.7],
    size: [15.5, 2.0],
    height: 16.8,
    zoneId: "south-teaching",
    footprint: [
      [63.2, 62.7],
      [78.6, 62.7],
      [78.7, 60.8],
      [63.3, 60.7]
    ]
  },
  {
    id: "osm-building-17",
    name: "建筑17",
    category: "academic",
    position: [54.5, 61.4],
    size: [12.2, 2.2],
    height: 16.2,
    zoneId: "south-teaching",
    footprint: [
      [48.4, 61.8],
      [60.1, 62.5],
      [60.6, 60.9],
      [48.7, 60.3]
    ]
  },
  {
    id: "osm-building-18",
    name: "建筑18",
    category: "academic",
    position: [50.5, 65.9],
    size: [14.6, 3.7],
    height: 16.6,
    zoneId: "south-teaching",
    footprint: [
      [43.2, 66.3],
      [43.7, 64.0],
      [57.8, 65.5],
      [57.3, 67.7]
    ]
  },
  {
    id: "osm-building-19",
    name: "建筑19",
    category: "academic",
    position: [67.5, 66.3],
    size: [9.6, 1.8],
    height: 15.7,
    zoneId: "south-teaching",
    footprint: [
      [62.7, 67.1],
      [62.7, 65.4],
      [72.3, 65.5],
      [72.3, 67.2]
    ]
  },
  {
    id: "osm-building-20",
    name: "建筑20",
    category: "academic",
    position: [79.7, 66.6],
    size: [12.6, 1.8],
    height: 16.3,
    zoneId: "library-east-link",
    footprint: [
      [73.5, 67.5],
      [73.4, 65.9],
      [86.0, 65.7],
      [86.0, 67.4]
    ]
  },
  {
    id: "osm-building-21",
    name: "建筑21",
    category: "academic",
    position: [86.8, 71.4],
    size: [9.8, 1.8],
    height: 15.8,
    zoneId: "library-east-link",
    footprint: [
      [82.0, 72.3],
      [81.9, 70.7],
      [91.6, 70.5],
      [91.7, 72.1]
    ]
  },
  {
    id: "osm-building-22",
    name: "建筑22",
    category: "academic",
    position: [116.2, 77.3],
    size: [10.3, 3.0],
    height: 15.9,
    zoneId: "library-east-link",
    footprint: [
      [111.0, 77.3],
      [120.8, 75.8],
      [121.3, 77.3],
      [111.5, 78.8]
    ]
  },
  {
    id: "osm-building-23",
    name: "建筑23",
    category: "academic",
    position: [118.4, 82.1],
    size: [8.0, 3.0],
    height: 15.4,
    zoneId: "library-east-link",
    footprint: [
      [114.9, 83.6],
      [114.4, 81.9],
      [121.9, 80.6],
      [122.4, 82.4]
    ]
  },
  {
    id: "osm-building-24",
    name: "建筑24",
    category: "academic",
    position: [132.2, 86.2],
    size: [12.8, 3.9],
    height: 16.3,
    zoneId: "library-east-link",
    footprint: [
      [125.8, 86.4],
      [126.5, 88.2],
      [138.6, 86.0],
      [138.0, 84.3]
    ]
  },
  {
    id: "osm-building-25",
    name: "建筑25",
    category: "academic",
    position: [136.6, 81.3],
    size: [20.0, 4.2],
    height: 17.6,
    zoneId: "library-east-link",
    footprint: [
      [124.2, 82.0],
      [124.8, 83.7],
      [138.9, 81.4],
      [139.2, 82.2],
      [144.2, 81.4],
      [143.5, 79.5],
      [139.1, 80.3],
      [138.9, 79.6]
    ]
  },
  {
    id: "osm-building-26",
    name: "建筑26",
    category: "academic",
    position: [133.1, 77.0],
    size: [17.6, 4.6],
    height: 17.2,
    zoneId: "library-east-link",
    footprint: [
      [124.3, 77.5],
      [124.9, 79.3],
      [141.9, 76.4],
      [141.2, 74.7]
    ]
  },
  {
    id: "library",
    name: "图书馆",
    category: "library",
    position: [16.2, 3.4],
    size: [23.7, 18.2],
    height: 26,
    zoneId: "central-core",
    color: "#fde68a",
    footprint: [
      [19.2, 13.5],
      [18.4, 7.7],
      [21.3, 7.7],
      [26.6, 1.7],
      [29.1, 1.4],
      [28.5, -4.5],
      [17.8, -4.7],
      [17.8, -3.5],
      [8.9, -3.5],
      [8.5, -0.4],
      [5.6, -0.2],
      [5.4, 9.3],
      [10.0, 9.3],
      [10.1, 13.5]
    ]
  },
  {
    id: "dorm-3",
    name: "3号楼",
    category: "dorm",
    position: [-43.1, -1.2],
    size: [7.7, 1.8],
    height: 14.4,
    zoneId: "central-core",
    color: "#c4b5fd",
    footprint: [
      [-46.9, -0.3],
      [-46.8, -2.0],
      [-39.2, -2.1],
      [-39.6, -0.3]
    ]
  },
  {
    id: "dorm-2",
    name: "2号楼",
    category: "dorm",
    position: [-42.8, -5.3],
    size: [7.1, 1.5],
    height: 14.3,
    zoneId: "central-core",
    color: "#c4b5fd",
    footprint: [
      [-46.3, -4.6],
      [-46.3, -6.0],
      [-39.2, -6.0],
      [-39.2, -4.5]
    ]
  },
  {
    id: "academician",
    name: "院士楼",
    category: "academic",
    position: [-25.8, -22.0],
    size: [11.7, 9.6],
    height: 16.1,
    zoneId: "central-core",
    footprint: [
      [-29.6, -17.0],
      [-31.4, -19.3],
      [-28.2, -20.5],
      [-28.0, -23.6],
      [-30.9, -25.2],
      [-29.8, -26.5],
      [-26.8, -25.3],
      [-25.2, -25.3],
      [-21.5, -26.6],
      [-20.3, -25.1],
      [-23.8, -23.8],
      [-23.5, -20.6],
      [-19.7, -19.2],
      [-21.7, -17.1],
      [-25.1, -18.5],
      [-26.9, -18.3]
    ]
  },
  {
    id: "teaching-7",
    name: "7号教学楼",
    category: "academic",
    position: [8.5, -22.7],
    size: [13.0, 6.1],
    height: 16.3,
    zoneId: "central-core",
    footprint: [
      [1.1, -19.8],
      [1.0, -22.3],
      [10.9, -22.9],
      [10.9, -25.7],
      [14.0, -25.9],
      [13.3, -19.8]
    ]
  },
  {
    id: "teaching-6",
    name: "6号教学楼",
    category: "academic",
    position: [4.4, -35.0],
    size: [13.6, 7.6],
    height: 16.4,
    zoneId: "central-core",
    footprint: [
      [0.3, -31.4],
      [0.8, -33.3],
      [2.7, -33.3],
      [2.5, -36.6],
      [0.7, -36.2],
      [0.8, -39.0],
      [13.9, -38.8],
      [13.8, -31.4]
    ]
  },
  {
    id: "c4",
    name: "C4教学楼",
    category: "academic",
    position: [-82.9, 14.6],
    size: [20.1, 5.0],
    height: 17.6,
    zoneId: "west-dorm",
    footprint: [
      [-89.1, 17.0],
      [-76.2, 17.1],
      [-75.7, 15.3],
      [-77.9, 15.4],
      [-77.9, 13.9],
      [-72.9, 14.0],
      [-72.7, 12.1],
      [-92.8, 12.3],
      [-92.8, 13.9],
      [-88.8, 14.1],
      [-88.7, 15.3],
      [-89.2, 15.3]
    ]
  },
  {
    id: "c5",
    name: "C5教学楼",
    category: "academic",
    position: [-87.4, 5.6],
    size: [13.9, 5.2],
    height: 16.5,
    zoneId: "west-dorm",
    footprint: [
      [-93.3, 8.1],
      [-79.4, 8.0],
      [-79.7, 6.1],
      [-87.3, 6.2],
      [-87.3, 5.2],
      [-79.8, 5.1],
      [-79.7, 3.2],
      [-92.1, 2.9],
      [-92.1, 3.8],
      [-92.8, 3.9],
      [-92.5, 7.2],
      [-93.3, 7.2]
    ]
  },
  {
    id: "c3",
    name: "C3教学楼",
    category: "academic",
    position: [-63.2, -2.3],
    size: [9.8, 2.4],
    height: 15.8,
    zoneId: "west-academic",
    footprint: [
      [-68.0, -1.3],
      [-68.0, -3.3],
      [-58.2, -3.5],
      [-58.6, -1.1]
    ]
  },
  {
    id: "c6",
    name: "C6教学楼",
    category: "academic",
    position: [-84.1, -3.8],
    size: [21.8, 5.4],
    height: 17.9,
    zoneId: "west-academic",
    footprint: [
      [-94.3, -0.7],
      [-72.8, -0.7],
      [-72.7, -2.9],
      [-78.1, -2.9],
      [-78.1, -4.2],
      [-77.0, -4.3],
      [-76.8, -6.0],
      [-80.1, -6.1],
      [-80.2, -5.8],
      [-94.2, -5.5],
      [-94.0, -4.3],
      [-92.2, -4.1],
      [-92.2, -2.8],
      [-94.5, -2.8]
    ]
  },
  {
    id: "osm-building-27",
    name: "建筑27",
    category: "academic",
    position: [-109.0, -30.2],
    size: [10.9, 1.7],
    height: 16.0,
    zoneId: "west-academic",
    footprint: [
      [-114.4, -29.5],
      [-114.4, -31.0],
      [-103.6, -31.0],
      [-103.5, -29.3]
    ]
  },
  {
    id: "osm-building-28",
    name: "建筑28",
    category: "academic",
    position: [-109.3, -25.6],
    size: [11.4, 2.0],
    height: 16.1,
    zoneId: "west-academic",
    footprint: [
      [-115.1, -24.6],
      [-114.8, -26.6],
      [-103.7, -26.5],
      [-103.7, -24.6]
    ]
  },
  {
    id: "osm-building-29",
    name: "建筑29",
    category: "academic",
    position: [-109.3, -20.2],
    size: [11.2, 2.2],
    height: 16.0,
    zoneId: "west-academic",
    footprint: [
      [-114.7, -19.3],
      [-114.8, -21.2],
      [-103.6, -21.3],
      [-104.0, -19.1]
    ]
  },
  {
    id: "osm-building-30",
    name: "建筑30",
    category: "academic",
    position: [-109.6, -15.9],
    size: [10.5, 1.7],
    height: 15.9,
    zoneId: "west-academic",
    footprint: [
      [-114.5, -15.2],
      [-114.9, -16.7],
      [-104.5, -16.6],
      [-104.4, -15.0]
    ]
  },
  {
    id: "osm-building-31",
    name: "建筑31",
    category: "academic",
    position: [-130.0, -25.6],
    size: [12.4, 2.3],
    height: 16.2,
    zoneId: "west-academic",
    footprint: [
      [-136.0, -24.8],
      [-136.1, -26.7],
      [-124.0, -26.4],
      [-123.7, -24.4]
    ]
  },
  {
    id: "osm-building-32",
    name: "建筑32",
    category: "academic",
    position: [-130.1, -20.4],
    size: [12.0, 1.8],
    height: 16.2,
    zoneId: "west-academic",
    footprint: [
      [-136.1, -19.5],
      [-136.0, -21.3],
      [-124.3, -21.1],
      [-124.1, -19.5]
    ]
  },
  {
    id: "osm-building-33",
    name: "建筑33",
    category: "academic",
    position: [-130.2, -16.2],
    size: [11.4, 1.7],
    height: 16.1,
    zoneId: "west-academic",
    footprint: [
      [-135.8, -15.5],
      [-135.9, -17.0],
      [-124.6, -16.9],
      [-124.5, -15.3]
    ]
  },
  {
    id: "osm-building-34",
    name: "建筑34",
    category: "academic",
    position: [-144.2, -20.4],
    size: [10.8, 2.0],
    height: 15.9,
    zoneId: "west-academic",
    footprint: [
      [-149.5, -19.5],
      [-149.6, -21.4],
      [-139.0, -21.1],
      [-138.8, -19.4]
    ]
  },
  {
    id: "osm-building-35",
    name: "建筑35",
    category: "academic",
    position: [-145.8, -25.3],
    size: [13.7, 2.2],
    height: 16.5,
    zoneId: "west-academic",
    footprint: [
      [-152.6, -24.4],
      [-152.6, -26.5],
      [-138.9, -26.2],
      [-139.1, -24.3]
    ]
  },
  {
    id: "osm-building-36",
    name: "建筑36",
    category: "academic",
    position: [-147.8, -30.6],
    size: [17.6, 2.2],
    height: 17.2,
    zoneId: "west-academic",
    footprint: [
      [-156.6, -29.6],
      [-156.6, -31.8],
      [-139.1, -31.3],
      [-139.0, -29.6]
    ]
  },
  {
    id: "osm-building-37",
    name: "建筑37",
    category: "academic",
    position: [-145.7, -46.9],
    size: [13.1, 1.8],
    height: 16.4,
    zoneId: "west-academic",
    footprint: [
      [-152.2, -46.0],
      [-152.2, -47.7],
      [-139.1, -47.8],
      [-139.1, -46.0]
    ]
  },
  {
    id: "osm-building-38",
    name: "建筑38",
    category: "academic",
    position: [-145.7, -51.3],
    size: [13.8, 2.2],
    height: 16.5,
    zoneId: "west-academic",
    footprint: [
      [-152.5, -50.5],
      [-152.6, -52.5],
      [-138.8, -52.0],
      [-138.8, -50.3]
    ]
  },
  {
    id: "osm-building-39",
    name: "建筑39",
    category: "academic",
    position: [-145.4, -56.5],
    size: [14.6, 1.9],
    height: 16.6,
    zoneId: "west-academic",
    footprint: [
      [-152.5, -55.8],
      [-152.5, -57.4],
      [-137.9, -57.3],
      [-138.7, -55.5]
    ]
  },
  {
    id: "osm-building-40",
    name: "建筑40",
    category: "academic",
    position: [-145.4, -60.9],
    size: [13.9, 2.4],
    height: 16.5,
    zoneId: "west-academic",
    footprint: [
      [-152.4, -60.2],
      [-152.2, -62.1],
      [-138.5, -61.7],
      [-138.5, -59.7]
    ]
  },
  {
    id: "teaching-8",
    name: "8号教学楼",
    category: "academic",
    position: [7.9, -14.8],
    size: [13.3, 4.8],
    height: 16.4,
    zoneId: "central-core",
    footprint: [
      [1.7, -12.3],
      [2.0, -15.0],
      [4.5, -15.0],
      [4.5, -15.7],
      [12.9, -16.1],
      [12.9, -17.1],
      [14.8, -17.1],
      [15.0, -14.0],
      [5.3, -13.9],
      [5.0, -12.3]
    ]
  },
  {
    id: "music-college",
    name: "音乐学院",
    category: "academic",
    position: [-26.8, -31.4],
    size: [9.4, 2.5],
    height: 15.7,
    zoneId: "central-core",
    footprint: [
      [-31.4, -30.3],
      [-31.4, -32.6],
      [-22.0, -32.6],
      [-22.3, -30.1]
    ]
  },
  {
    id: "teaching-5",
    name: "5号教学楼",
    category: "academic",
    position: [-11.6, -15.8],
    size: [9.1, 2.5],
    height: 15.6,
    zoneId: "central-core",
    footprint: [
      [-16.2, -14.7],
      [-15.9, -17.1],
      [-7.1, -16.9],
      [-7.3, -14.6]
    ]
  },
  {
    id: "teaching-4",
    name: "4号教学楼",
    category: "academic",
    position: [-11.6, -25.2],
    size: [9.7, 2.6],
    height: 15.7,
    zoneId: "central-core",
    footprint: [
      [-16.3, -24.1],
      [-16.4, -26.5],
      [-6.8, -26.5],
      [-6.7, -23.9]
    ]
  },
  {
    id: "teaching-3",
    name: "3号教学楼",
    category: "academic",
    position: [-7.5, -32.5],
    size: [12.9, 5.2],
    height: 16.3,
    zoneId: "central-core",
    footprint: [
      [-15.5, -30.3],
      [-15.5, -32.8],
      [-7.2, -32.8],
      [-7.0, -34.9],
      [-3.0, -35.3],
      [-2.6, -33.4],
      [-4.0, -32.0],
      [-5.5, -31.0],
      [-7.2, -30.1]
    ]
  },
  {
    id: "teaching-2",
    name: "2号教学楼",
    category: "academic",
    position: [-21.8, -36.0],
    size: [16.5, 5.3],
    height: 17.0,
    zoneId: "central-core",
    footprint: [
      [-31.7, -36.4],
      [-31.5, -39.1],
      [-19.3, -38.9],
      [-19.4, -36.3],
      [-15.2, -36.2],
      [-15.3, -33.9],
      [-19.0, -33.8],
      [-20.5, -34.2],
      [-22.0, -34.9],
      [-22.7, -35.6],
      [-23.1, -36.5]
    ]
  },
  {
    id: "music-building",
    name: "音乐楼",
    category: "academic",
    position: [-42.7, -31.2],
    size: [5.5, 7.1],
    height: 15.3,
    zoneId: "central-core",
    footprint: [
      [-46.3, -27.3],
      [-45.9, -34.1],
      [-41.2, -34.2],
      [-41.3, -32.3],
      [-40.8, -32.2],
      [-40.8, -27.1]
    ]
  },
  {
    id: "osm-building-41",
    name: "建筑41",
    category: "academic",
    position: [117.2, 41.2],
    size: [11.5, 1.8],
    height: 16.1,
    zoneId: "library-east-link",
    footprint: [
      [111.4, 42.1],
      [122.9, 42.1],
      [122.9, 40.3],
      [111.4, 40.4]
    ]
  },
  {
    id: "osm-building-42",
    name: "建筑42",
    category: "academic",
    position: [117.0, 46.0],
    size: [11.7, 1.8],
    height: 16.1,
    zoneId: "library-east-link",
    footprint: [
      [122.9, 46.9],
      [122.9, 45.2],
      [111.2, 45.1],
      [111.2, 46.8]
    ]
  },
  {
    id: "osm-building-43",
    name: "建筑43",
    category: "academic",
    position: [117.3, 51.8],
    size: [12.2, 1.6],
    height: 16.2,
    zoneId: "library-east-link",
    footprint: [
      [111.2, 52.6],
      [123.4, 52.6],
      [123.4, 51.0],
      [111.2, 51.0]
    ]
  },
  {
    id: "osm-building-44",
    name: "建筑44",
    category: "academic",
    position: [116.9, 57.1],
    size: [12.9, 4.8],
    height: 16.3,
    zoneId: "library-east-link",
    footprint: [
      [110.4, 56.3],
      [122.4, 59.5],
      [123.3, 57.8],
      [111.3, 54.7]
    ]
  },
  {
    id: "osm-building-45",
    name: "建筑45",
    category: "academic",
    position: [-8.3, 47.2],
    size: [10.0, 8.2],
    height: 15.8,
    zoneId: "central-core",
    footprint: [
      [-13.6, 50.0],
      [-10.5, 51.2],
      [-10.2, 50.8],
      [-9.0, 51.2],
      [-3.6, 44.3],
      [-5.6, 43.5],
      [-5.8, 43.9],
      [-8.1, 43.0]
    ]
  },
  {
    id: "teaching-building",
    name: "教学楼",
    category: "academic",
    position: [-121.8, 6.5],
    size: [23.9, 11.6],
    height: 18.3,
    zoneId: "west-dorm",
    footprint: [
      [-132.8, 5.2],
      [-118.9, 5.2],
      [-118.9, 8.9],
      [-129.3, 8.9],
      [-129.3, 10.5],
      [-125.9, 10.6],
      [-125.9, 12.1],
      [-111.4, 12.0],
      [-111.4, 10.4],
      [-116.3, 10.3],
      [-116.5, 9.2],
      [-114.5, 9.1],
      [-114.6, 3.7],
      [-118.1, 3.8],
      [-118.1, 2.3],
      [-115.4, 2.4],
      [-115.5, 0.6],
      [-135.3, 0.5],
      [-135.3, 2.6],
      [-132.8, 2.5]
    ]
  },
  {
    id: "osm-building-46",
    name: "建筑46",
    category: "academic",
    position: [-114.8, 22.4],
    size: [13.3, 4.5],
    height: 16.4,
    zoneId: "west-dorm",
    footprint: [
      [-122.8, 24.5],
      [-109.8, 24.4],
      [-109.7, 22.7],
      [-111.6, 22.6],
      [-111.6, 20.1],
      [-123.0, 20.0]
    ]
  },
  {
    id: "osm-building-47",
    name: "建筑47",
    category: "academic",
    position: [-120.0, 16.7],
    size: [14.1, 3.2],
    height: 16.5,
    zoneId: "west-dorm",
    footprint: [
      [-122.6, 18.2],
      [-111.6, 18.1],
      [-111.7, 15.2],
      [-125.7, 15.0],
      [-125.6, 16.7],
      [-122.6, 16.8]
    ]
  },
  {
    id: "osm-building-48",
    name: "建筑48",
    category: "academic",
    position: [-107.4, 32.1],
    size: [20.3, 11.4],
    height: 17.7,
    zoneId: "west-dorm",
    footprint: [
      [-100.6, 35.0],
      [-100.7, 32.0],
      [-98.5, 31.9],
      [-98.6, 30.1],
      [-103.6, 30.2],
      [-103.6, 27.2],
      [-118.7, 26.9],
      [-118.6, 29.2],
      [-114.6, 29.2],
      [-114.6, 30.3],
      [-116.9, 30.2],
      [-116.8, 32.0],
      [-103.6, 32.1],
      [-103.7, 34.9],
      [-111.2, 34.9],
      [-111.2, 38.2],
      [-98.4, 38.3],
      [-98.5, 35.2]
    ]
  },
  {
    id: "osm-building-49",
    name: "建筑49",
    category: "academic",
    position: [-80.4, 33.8],
    size: [27.4, 13.3],
    height: 18.9,
    zoneId: "west-dorm",
    footprint: [
      [-94.9, 40.2],
      [-86.2, 40.3],
      [-86.2, 39.3],
      [-82.5, 39.4],
      [-82.6, 37.4],
      [-84.5, 37.1],
      [-84.4, 35.2],
      [-69.7, 35.1],
      [-69.9, 33.6],
      [-68.0, 33.8],
      [-68.2, 29.5],
      [-69.5, 29.5],
      [-69.3, 27.2],
      [-95.1, 27.0],
      [-95.2, 30.1],
      [-72.9, 30.2],
      [-72.8, 32.2],
      [-95.4, 32.0]
    ]
  },
  {
    id: "osm-building-50",
    name: "建筑50",
    category: "academic",
    position: [135.5, 56.8],
    size: [9.4, 1.7],
    height: 15.7,
    zoneId: "library-east-link",
    footprint: [
      [130.9, 57.6],
      [130.8, 56.0],
      [140.2, 55.9],
      [140.1, 57.5]
    ]
  },
  {
    id: "osm-building-51",
    name: "建筑51",
    category: "academic",
    position: [136.1, 51.6],
    size: [9.8, 2.1],
    height: 15.8,
    zoneId: "library-east-link",
    footprint: [
      [131.3, 52.7],
      [131.2, 50.8],
      [141.0, 50.6],
      [141.0, 52.5]
    ]
  },
  {
    id: "osm-building-52",
    name: "建筑52",
    category: "academic",
    position: [135.0, 46.5],
    size: [7.3, 2.4],
    height: 15.3,
    zoneId: "library-east-link",
    footprint: [
      [131.5, 47.6],
      [131.6, 45.3],
      [138.8, 45.6],
      [138.2, 47.7]
    ]
  },
  {
    id: "osm-building-53",
    name: "建筑53",
    category: "academic",
    position: [137.7, 41.3],
    size: [13.5, 3.2],
    height: 16.4,
    zoneId: "library-east-link",
    footprint: [
      [131.0, 43.0],
      [130.9, 40.0],
      [144.3, 39.8],
      [144.4, 42.5]
    ]
  },
  {
    id: "osm-building-54",
    name: "建筑54",
    category: "academic",
    position: [145.1, 45.3],
    size: [6.9, 4.0],
    height: 15.2,
    zoneId: "library-east-link",
    footprint: [
      [143.0, 47.3],
      [141.7, 45.4],
      [147.2, 43.3],
      [148.6, 45.1]
    ]
  },
  {
    id: "osm-building-55",
    name: "建筑55",
    category: "academic",
    position: [147.7, 50.0],
    size: [7.1, 3.6],
    height: 15.3,
    zoneId: "library-east-link",
    footprint: [
      [146.1, 51.7],
      [144.0, 50.0],
      [149.4, 48.1],
      [151.1, 50.0]
    ]
  },
  {
    id: "osm-building-56",
    name: "建筑56",
    category: "academic",
    position: [146.6, 55.4],
    size: [7.8, 4.3],
    height: 15.4,
    zoneId: "library-east-link",
    footprint: [
      [144.2, 56.4],
      [143.3, 55.1],
      [149.4, 53.0],
      [151.1, 55.2],
      [145.0, 57.3]
    ]
  },
  {
    id: "osm-building-57",
    name: "建筑57",
    category: "academic",
    position: [100.3, 44.1],
    size: [22.9, 9.6],
    height: 18.1,
    zoneId: "library-east-link",
    footprint: [
      [104.9, 49.2],
      [84.2, 43.5],
      [86.2, 39.6],
      [106.6, 39.9],
      [107.0, 44.4],
      [103.4, 44.4],
      [103.3, 45.2],
      [107.1, 46.3]
    ]
  },
  {
    id: "osm-building-58",
    name: "建筑58",
    category: "academic",
    position: [103.9, 28.6],
    size: [18.7, 12.8],
    height: 17.4,
    zoneId: "library-east-link",
    footprint: [
      [93.7, 35.4],
      [110.2, 35.3],
      [110.5, 30.8],
      [112.2, 30.8],
      [112.1, 23.9],
      [110.5, 23.8],
      [110.5, 22.9],
      [94.1, 22.6],
      [94.1, 25.5],
      [108.9, 25.5],
      [108.9, 27.5],
      [93.8, 27.4],
      [93.9, 30.1],
      [107.4, 30.1],
      [107.3, 32.8],
      [93.5, 32.7]
    ]
  },
  {
    id: "osm-building-59",
    name: "建筑59",
    category: "academic",
    position: [127.6, 28.9],
    size: [19.0, 12.5],
    height: 17.4,
    zoneId: "library-east-link",
    footprint: [
      [117.7, 35.3],
      [136.7, 35.3],
      [136.7, 32.4],
      [121.7, 32.4],
      [121.7, 30.1],
      [135.2, 30.2],
      [135.2, 27.5],
      [120.5, 27.3],
      [120.6, 25.1],
      [133.8, 25.2],
      [133.8, 22.9],
      [117.9, 22.8]
    ]
  }
]

export const osmRoads: OSMRoadSeed[] = [
  {
    id: "环山路",
    points: [
      [-161.4, -67.7],
      [2.1, -68.3],
      [16.8, -66.6],
      [60.3, -55.6],
      [82.0, -41.2],
      [97.9, -18.4],
      [123.6, 0.9],
      [146.5, 32.8]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "致远北路",
    points: [
      [6.2, 20.8],
      [15.3, 21.1],
      [45.6, 33.0],
      [81.9, 37.9]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-298459043",
    points: [
      [-17.8, 93.7],
      [-56.9, 89.5]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-50.2, -39.9],
      [-50.0, 18.7]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科源路",
    points: [
      [4.6, 135.5],
      [29.5, 110.2],
      [39.2, 104.0],
      [126.1, 69.6]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-298459249",
    points: [
      [-164.4, -32.9],
      [-121.9, -32.7]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "科景路",
    points: [
      [-28.9, 92.7],
      [17.4, 36.8]
    ],
    width: 6.5,
    color: "#aeb7c2"
  },
  {
    id: "osm-road-356393309",
    points: [
      [115.6, 96.6],
      [133.1, 94.3],
      [150.3, 75.9]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356413198",
    points: [
      [-146.1, 68.4],
      [-135.2, 79.6],
      [-127.2, 98.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356413199",
    points: [
      [-135.2, 79.6],
      [-142.4, 81.7],
      [-142.5, 83.6],
      [-147.1, 89.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356413200",
    points: [
      [-143.2, 71.2],
      [-117.2, 61.4],
      [-106.6, 59.8]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627212",
    points: [
      [-51.2, -68.6],
      [-50.8, -105.7]
    ],
    width: 6.5,
    color: "#aeb7c2"
  },
  {
    id: "osm-road-356627215",
    points: [
      [-104.4, -69.1],
      [-103.5, -82.4],
      [-91.6, -84.1],
      [-90.7, -88.2]
    ],
    width: 3.4,
    color: "#c4b5fd"
  },
  {
    id: "osm-road-356627218",
    points: [
      [-145.7, -2.6],
      [-107.0, -3.0]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627220",
    points: [
      [-99.0, -14.1],
      [-50.2, -14.6]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627221",
    points: [
      [-98.9, -7.4],
      [-50.2, -7.3]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627228",
    points: [
      [-2.0, 20.8],
      [-1.6, 8.3],
      [-11.8, 7.4],
      [-13.8, 3.9],
      [-22.6, 3.9],
      [-23.7, 2.0],
      [-28.6, 2.0],
      [-27.9, 20.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627235",
    points: [
      [19.8, 23.1],
      [21.3, 21.1],
      [21.4, 14.5],
      [34.7, -1.9],
      [34.7, -4.6],
      [33.1, -5.6],
      [15.8, -5.9],
      [7.0, -3.4],
      [4.6, -1.1],
      [3.7, 9.2],
      [9.2, 14.4],
      [8.9, 21.0]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627237",
    points: [
      [21.3, 14.7],
      [9.2, 14.8]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627241",
    points: [
      [-50.1, 56.9],
      [-40.6, 57.5],
      [-19.3, 66.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627249",
    points: [
      [-19.3, 66.1],
      [-40.0, 91.5]
    ],
    width: 6.5,
    color: "#aeb7c2"
  },
  {
    id: "osm-road-356627264",
    points: [
      [-7.5, 89.3],
      [-5.6, 91.0],
      [-10.7, 93.2],
      [-14.2, 97.6],
      [-18.5, 114.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627267",
    points: [
      [-5.7, 91.0],
      [-1.3, 91.6],
      [0.7, 88.9],
      [5.2, 89.1],
      [19.7, 80.3],
      [43.6, 80.2],
      [42.6, 88.5],
      [63.4, 89.9]
    ],
    width: 3.4,
    color: "#c4b5fd"
  },
  {
    id: "osm-road-356627269",
    points: [
      [59.6, 92.4],
      [67.0, 85.5],
      [68.5, 76.2],
      [63.6, 68.9],
      [57.4, 64.5],
      [42.7, 61.7]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-356627270",
    points: [
      [68.4, 79.3],
      [85.0, 79.2],
      [65.3, 87.5]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627271",
    points: [
      [32.8, 80.2],
      [32.3, 88.4],
      [42.6, 88.5]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627273",
    points: [
      [32.5, 84.9],
      [43.0, 84.8]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627274",
    points: [
      [32.3, 88.4],
      [21.5, 88.3],
      [10.6, 85.9]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627275",
    points: [
      [5.2, 89.1],
      [19.8, 91.5],
      [21.5, 88.3]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627276",
    points: [
      [-1.3, 91.6],
      [10.9, 93.9],
      [12.7, 90.3]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627277",
    points: [
      [10.9, 93.9],
      [21.9, 96.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627279",
    points: [
      [-11.7, 95.4],
      [3.6, 98.1],
      [6.7, 96.6],
      [7.7, 93.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-356627282",
    points: [
      [10.1, 115.1],
      [14.6, 103.2],
      [21.9, 96.1],
      [30.6, 92.6],
      [50.1, 94.4]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-523601165",
    points: [
      [81.9, 37.9],
      [87.3, 33.5],
      [92.2, 25.2],
      [93.4, 17.1],
      [91.3, 5.9],
      [86.9, -4.9],
      [74.1, -22.8],
      [64.0, -30.2],
      [39.0, -40.5],
      [28.5, -42.1],
      [-72.0, -42.3]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "科技路",
    points: [
      [64.2, 49.4],
      [-14.2, 92.8]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-523601167",
    points: [
      [-19.3, 66.1],
      [6.5, 35.3]
    ],
    width: 6.5,
    color: "#aeb7c2"
  },
  {
    id: "科锐路",
    points: [
      [-49.7, 42.1],
      [-51.3, 75.7],
      [-60.7, 114.1]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-790749789",
    points: [
      [-207.5, 37.2],
      [-206.0, 30.8],
      [-201.2, 23.2],
      [-189.8, 15.3],
      [-183.5, 13.3],
      [-156.6, 11.6],
      [-138.7, 6.9]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-790749803",
    points: [
      [-148.3, -8.0],
      [-114.4, 47.1]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "学府路",
    points: [
      [-65.1, 44.1],
      [-23.6, 40.0],
      [7.4, 39.9],
      [33.6, 42.2],
      [71.0, 51.8],
      [95.9, 66.9],
      [105.8, 77.4],
      [115.6, 96.6],
      [117.5, 106.0],
      [115.8, 129.3],
      [105.4, 146.4],
      [76.6, 179.5]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-790749806",
    points: [
      [-110.0, 54.4],
      [-89.0, 85.3],
      [-77.8, 87.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "学府路",
    points: [
      [-180.5, 87.8],
      [-146.1, 68.4],
      [-110.0, 54.4]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科源路",
    points: [
      [131.6, 67.6],
      [164.7, 55.3]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-920093688",
    points: [
      [17.9, -10.9],
      [17.9, -42.2]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093689",
    points: [
      [-28.6, 2.0],
      [-29.4, -7.3],
      [-33.0, -12.3],
      [-33.0, -28.7],
      [-35.8, -31.5],
      [-36.8, -42.2]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093690",
    points: [
      [-33.0, -28.7],
      [17.7, -29.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093691",
    points: [
      [-28.6, 2.0],
      [-46.2, 2.6],
      [-46.3, 4.2]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093692",
    points: [
      [-38.2, 2.3],
      [-37.6, -7.1],
      [-30.8, -9.3]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093696",
    points: [
      [9.6, 31.5],
      [17.5, 22.1]
    ],
    width: 6.5,
    color: "#aeb7c2"
  },
  {
    id: "osm-road-920093702",
    points: [
      [-30.8, -9.3],
      [-0.3, -11.2],
      [0.8, -12.9],
      [-1.0, -29.1],
      [-0.7, -42.1]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-920093719",
    points: [
      [-115.9, -32.7],
      [-98.3, -32.5]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-920093734",
    points: [
      [0.3, -17.5],
      [17.6, -17.6]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "致远西路",
    points: [
      [-72.0, -42.3],
      [-91.1, -39.9],
      [-98.3, -32.5],
      [-99.0, 11.5],
      [-97.8, 15.1],
      [-93.0, 18.7]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-1015813288",
    points: [
      [81.9, 37.9],
      [107.2, 38.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813289",
    points: [
      [145.1, 38.9],
      [109.1, 39.7],
      [107.2, 38.4]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813290",
    points: [
      [107.2, 38.4],
      [107.8, 37.0],
      [109.8, 36.7],
      [143.1, 36.7]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813291",
    points: [
      [126.5, 59.6],
      [143.3, 59.6],
      [152.3, 56.4],
      [152.7, 55.2],
      [152.6, 48.9],
      [143.1, 36.7],
      [134.0, 22.0],
      [93.1, 21.8]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813292",
    points: [
      [126.5, 59.6],
      [126.1, 39.9]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813293",
    points: [
      [108.0, 39.4],
      [107.8, 56.6],
      [121.3, 60.1],
      [126.1, 60.7],
      [126.5, 59.6]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1015813294",
    points: [
      [-56.9, 89.5],
      [-75.0, 87.5]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "科锐路",
    points: [
      [-50.0, 18.7],
      [-49.9, 33.3]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-51.2, -68.6],
      [-50.2, -43.8]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-52.6, -44.0],
      [-51.2, -68.6]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-52.0, 18.7],
      [-52.5, -40.1]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-62.7, 113.8],
      [-52.5, 69.1],
      [-52.0, 33.4]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "科锐路",
    points: [
      [-52.0, 33.4],
      [-52.0, 18.7]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-1017326406",
    points: [
      [133.1, 94.3],
      [127.2, 101.9]
    ],
    width: 4.8,
    color: "#bcc4ce"
  },
  {
    id: "osm-road-1017326410",
    points: [
      [116.6, 36.7],
      [116.7, 21.9]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-1017326411",
    points: [
      [113.0, 21.9],
      [112.8, 36.7]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "致远北路",
    points: [
      [-93.0, 18.7],
      [-86.8, 20.5],
      [2.8, 20.8]
    ],
    width: 6.8,
    color: "#a8b1bd"
  },
  {
    id: "osm-road-1284924886",
    points: [
      [49.4, -92.7],
      [89.4, -79.9]
    ],
    width: 2.2,
    color: "#d6d3d1"
  },
  {
    id: "osm-road-1284924889",
    points: [
      [106.0, -101.8],
      [107.7, -96.9],
      [113.6, -90.4],
      [89.4, -79.9]
    ],
    width: 2.2,
    color: "#d6d3d1"
  },
  {
    id: "osm-road-1284924895",
    points: [
      [81.5, -81.6],
      [76.5, -59.7],
      [67.6, -61.4],
      [50.1, -68.9],
      [17.1, -76.6],
      [-9.4, -93.6],
      [-14.9, -112.1],
      [-23.3, -124.7],
      [-39.4, -123.4],
      [-51.9, -123.9],
      [-65.0, -117.2],
      [-89.2, -117.2],
      [-92.5, -115.7],
      [-97.9, -117.2],
      [-104.8, -124.9],
      [-100.8, -132.7],
      [-127.8, -130.1],
      [-137.6, -118.9]
    ],
    width: 2.2,
    color: "#d6d3d1"
  },
  {
    id: "学府路",
    points: [
      [-110.0, 54.4],
      [-70.1, 44.9]
    ],
    width: 8,
    color: "#9ca3af"
  },
  {
    id: "osm-road-1492706966",
    points: [
      [146.5, -45.1],
      [135.4, -44.3],
      [132.9, -45.6],
      [133.1, -51.6],
      [135.4, -54.3],
      [146.9, -57.5]
    ],
    width: 2.6,
    color: "#d1d5db"
  },
  {
    id: "osm-road-1492711429",
    points: [
      [165.3, -13.5],
      [160.0, -17.4],
      [143.7, -24.9],
      [142.5, -28.1],
      [152.7, -38.9],
      [153.9, -42.6]
    ],
    width: 2.6,
    color: "#d1d5db"
  },
  {
    id: "osm-road-1492711430",
    points: [
      [145.0, -24.1],
      [165.2, -32.4],
      [170.0, -33.0]
    ],
    width: 2.6,
    color: "#d1d5db"
  },
  {
    id: "osm-road-1496902321",
    points: [
      [-136.4, -12.1],
      [-136.4, -32.8]
    ],
    width: 2.6,
    color: "#d1d5db"
  }
]

export const osmFields: OSMFieldSeed[] = [
  {
    id: "south-stadium",
    name: "南体育场",
    center: [-113.8, -49.9],
    size: [31.0, 29.0],
    color: "#4ade80",
    stripeColor: "#86efac"
  }
]
