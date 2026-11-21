/**
 * M5-A 演示字段：当前 pack 未带详情字段，给默认数据集里几栋有代表性的建筑补一份。
 * 只在缺字段时填入；pack 后续带上了真实字段就以 pack 为准。
 */
import type { Building } from './campusData'

export const M5A_DEMO_BUILDING_FIELDS: Record<string, Partial<Building>> = {
  'place-05': {
    info: '图书馆：藏书借阅、自习与数字资源服务，是校园的核心学习空间。',
    floors: [
      { level: -1, name: 'B1' },
      { level: 0, name: '1F' },
      { level: 1, name: '2F' },
      { level: 2, name: '3F' },
    ],
    facilities: ['借阅台', '自习区', '电子阅览室', '无障碍电梯'],
    entrance: { level: 0, name: '南门', position: [1010, 330] },
  },
  'place-03': {
    info: 'C4 教学楼：承担本科与研究生课程，配有多媒体教室。',
    floors: [
      { level: 0, name: '1F' },
      { level: 1, name: '2F' },
      { level: 2, name: '3F' },
    ],
    facilities: ['多媒体教室', '阶梯教室'],
    entrance: { level: 0, name: '东侧主入口' },
  },
}
