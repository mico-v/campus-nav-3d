/**
 * Top-down plan projection. World X maps to screen X, world Z maps to screen Y.
 * screen = world * scale + offset.
 */
export interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export interface ViewBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function worldToScreen(v: ViewState, x: number, z: number): [number, number] {
  return [x * v.scale + v.offsetX, z * v.scale + v.offsetY]
}

export function screenToWorld(v: ViewState, sx: number, sy: number): [number, number] {
  return [(sx - v.offsetX) / v.scale, (sy - v.offsetY) / v.scale]
}

/** Compute a view that centers `bounds` inside a `width`x`height` viewport with `pad` px margin. */
export function fitView(bounds: ViewBounds, width: number, height: number, pad: number): ViewState {
  const worldW = Math.max(1e-6, bounds.maxX - bounds.minX)
  const worldH = Math.max(1e-6, bounds.maxZ - bounds.minZ)
  const usableW = Math.max(1, width - pad * 2)
  const usableH = Math.max(1, height - pad * 2)
  const scale = Math.min(usableW / worldW, usableH / worldH)

  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const offsetX = width / 2 - centerX * scale
  const offsetY = height / 2 - centerZ * scale
  return { scale, offsetX, offsetY }
}

/** Zoom by `factor` while keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(v: ViewState, sx: number, sy: number, factor: number): ViewState {
  const [wx, wz] = screenToWorld(v, sx, sy)
  const scale = v.scale * factor
  return {
    scale,
    offsetX: sx - wx * scale,
    offsetY: sy - wz * scale,
  }
}

export function pan(v: ViewState, dxScreen: number, dyScreen: number): ViewState {
  return { scale: v.scale, offsetX: v.offsetX + dxScreen, offsetY: v.offsetY + dyScreen }
}
