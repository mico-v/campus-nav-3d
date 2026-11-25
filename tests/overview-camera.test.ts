// @vitest-environment node
/**
 * S3 初始机位回归：降低仰角、放大画面。
 * 固定包围盒（1200 x 900，楼高 60）下，直接跑真实的 setOverviewCamera()，
 * 断言相机 y / distance 落在具体数值区间（不用 >=，避免「照旧也算过」）。
 */
import { describe, it, expect, vi } from 'vitest'
import type { CampusData } from '../src/data/campusData'
import { CampusScene } from '../src/scene/CampusScene'

function stubElement(): HTMLElement {
  return {
    addEventListener() {}, removeEventListener() {},
    getRootNode: () => ({ addEventListener() {}, removeEventListener() {} }),
    ownerDocument: { removeEventListener() {} },
    setPointerCapture() {}, releasePointerCapture() {},
    style: {}, clientHeight: 100, clientWidth: 100, appendChild() {}, innerHTML: '',
  } as unknown as HTMLElement
}

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = stubElement()
      setPixelRatio() {}
      setSize() {}
      render() {}
      shadowMap = { enabled: false }
      outputColorSpace = ''
      toneMapping = 0
      toneMappingExposure = 1
      info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } }
    },
  }
})

const fixedData = {
  buildings: [{ id: 'fixed', name: 'Fixed', category: 'teaching', position: [0, 0], size: [1200, 900], height: 60 }],
  roads: [], zones: [], waters: [], fields: [], trees: [], pois: [], routes: [], labels: [],
} as unknown as CampusData

function pose(width: number, height: number) {
  const host = { ...stubElement(), clientWidth: width, clientHeight: height } as unknown as HTMLDivElement
  const labels = stubElement() as unknown as HTMLDivElement
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('document', { createElement: () => stubElement() })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
  const scene = new CampusScene(host, labels)
  // 绕过 rebuild：只给 setOverviewCamera 读几何所需的 data，避免建整张地图。
  ;(scene as unknown as { data: CampusData }).data = fixedData
  scene.resize()
  scene.setOverviewCamera()
  return {
    distance: scene.camera.position.distanceTo(scene.controls.target),
    camY: scene.camera.position.y,
  }
}

describe('setOverviewCamera 初始机位', () => {
  it('横屏：仰角 22.3° / distance 1591 / 相机 y 604（改前 30.7° / 1929 / 984）', () => {
    const { distance, camY } = pose(1280, 800)
    expect(distance).toBeGreaterThan(1585)
    expect(distance).toBeLessThan(1598)
    expect(camY).toBeGreaterThan(598)
    expect(camY).toBeLessThan(612)
  })

  it('竖屏：仰角 19.1° / distance 3403 / 相机 y 1113（改前 27.0° / 3514 / 1595）', () => {
    const { distance, camY } = pose(390, 844)
    expect(distance).toBeGreaterThan(3396)
    expect(distance).toBeLessThan(3410)
    expect(camY).toBeGreaterThan(1106)
    expect(camY).toBeLessThan(1121)
  })
})
