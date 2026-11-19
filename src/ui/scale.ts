/**
 * 地图比例尺（docs/design-overview-v2.md §6.3：左下角比例尺）。
 *
 * 透视相机下屏幕像素对应的地面米数随视距变化，所以比例尺不能写死。
 * 这里只用「相机到 orbit 目标的距离」近似地面深度 —— 目标点基本都贴在地面上，
 * 俯视时误差可以接受，比不显示比例尺强。1 场景单位 = 1 米（§7 坐标系约定）。
 */

export interface ScaleBar {
  /** 比例尺代表的米数，取自 1/2/5 阶梯 */
  meters: number
  /** 该米数在屏幕上的像素宽度 */
  pixels: number
  /** 展示文案，≥1000 米换成公里 */
  label: string
}

/**
 * 1-2-5 阶梯：地图比例尺只认这些整数值，避免出现「73 米」这种读数。
 * 上限必须够远 —— 拉远到 5 km/px 时预算有 400 多公里，
 * 阶梯如果只到 10 km，比例尺就会缩成 2px 的一条线，等于没有。
 */
export const SCALE_LADDER = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000,
  10000, 20000, 50000, 100000, 200000, 500000, 1000000,
] as const

export function formatMeters(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
}

/** 透视相机：距离 distance 处的可视高度 = 2·d·tan(fov/2)，除以视口高度就是每像素米数。 */
export function metersPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distance > 0) || !(viewportHeightPx > 0)) return 1
  const visibleHeight = 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
  return visibleHeight / viewportHeightPx
}

/**
 * 在 maxPixels 内取尽量长的一档。
 * 近到连最小档都装不下时退到最小档（宁可超宽也不空着），
 * 远到阶梯顶也没用完预算时取顶档 —— 有刻度读胜过一条看不见的线。
 */
export function chooseScaleBar(mpp: number, maxPixels = 88): ScaleBar {
  const safe = Number.isFinite(mpp) && mpp > 0 ? mpp : 1
  const budget = safe * maxPixels
  let meters: number = SCALE_LADDER[0]
  for (const step of SCALE_LADDER) if (step <= budget) meters = step
  const pixels = Math.max(2, Math.round(meters / safe))
  return { meters, pixels, label: formatMeters(meters) }
}
