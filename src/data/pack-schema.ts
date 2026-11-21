/**
 * M2-A：campus pack 的室内楼层类型。
 *
 * 只加可选字段，老 pack 的 `buildings` / `levels` 语义不变。
 * `floors` 是「一层一张平面」的显式建模，和旧的 `levels`（楼层高度 + 门/房间）
 * 不是同一层概念；两者可以共存，本片不负责桥接。
 */
import type { CampusBuilding, CampusPack, Point } from '../../packages/campus-schema/src/index'

/**
 * 楼层编号约定：
 * - `level: 0` 是一层（地面层）；
 * - 正数为地上层（1 = 二层），负数为地下层（-1 = B1）；
 * - 同一建筑内 `level` 唯一，但不要求连续。
 */
export interface CampusFloor {
  level: number
  name: string
  /** 该层的平面轮廓，缺省时沿用建筑的 footprint。 */
  footprint?: Point[]
  /** 该层层高，单位米；缺省不推断。 */
  height?: number
}

export interface FloorEndpoint {
  building: string
  level: number
}

/** 竖向连接类型：只收楼梯 / 电梯 / 坡道，自动扶梯暂不纳入。 */
export type FloorConnectorKind = 'stairs' | 'elevator' | 'ramp'

export const FLOOR_CONNECTOR_KINDS: readonly FloorConnectorKind[] = ['stairs', 'elevator', 'ramp']

/**
 * 楼与楼之间的竖向/连廊连接。跨楼合法（例如两栋楼二层之间的连廊）。
 * `from` / `to` 是有序端点：`A→B` 与 `B→A` 算两对。
 * `id` 是包内唯一标识，错误信息用它定位具体连接。
 */
export interface FloorConnector {
  /** 包内唯一标识；建议小写连字符 slug。 */
  id: string
  from: FloorEndpoint
  to: FloorEndpoint
  kind: FloorConnectorKind
  /** 连接在地面坐标中的位置；可选，渲染层可自行决定怎么画。 */
  position?: Point
}

export interface BuildingWithFloors extends CampusBuilding {
  floors?: CampusFloor[]
}

/** `pack.json + campus.json` 合并后的对象，允许带 M2-A 可选字段。 */
export interface FloorAwareCampusPack extends Omit<CampusPack, 'buildings'> {
  buildings?: BuildingWithFloors[]
  connectors?: FloorConnector[]
}
