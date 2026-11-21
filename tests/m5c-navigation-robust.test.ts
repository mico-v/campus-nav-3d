/**
 * M5-C 导航健壮性硬用例（ISSUE #47）：聚合层校验 + 深链 + UI 接线。
 * 不碰 pathfinding 算法主体，也不改 M4-A 既有深链断言。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CampusData } from '../src/data/campusData'
import type { RoadNetwork } from '../src/data/roadNetwork'
import { parseDeepLink, buildDeepLink } from '../src/deeplink/index'
import { isNavigationMode, planRoute, resolveBuildingIndex } from '../src/navigation/route'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainTs = readFileSync(join(repoRoot, 'src/main.ts'), 'utf8')
const navUiTs = readFileSync(join(repoRoot, 'src/ui/navigation-ui.ts'), 'utf8')

function network(access = { pedestrian: true, bicycle: true, vehicle: true }, length = 100, extra?: RoadNetwork): RoadNetwork {
  return extra ?? {
    nodes: [
      { id: 'a-node', position: [0, 0], kind: 'entrance' },
      { id: 'b-node', position: [length, 0], kind: 'entrance' },
    ],
    segments: [{
      id: 'direct', from: 'a-node', to: 'b-node',
      centerline: [[0, 0], [length, 0]], width: 8, class: 'walkway', surface: 'paving', access,
    }],
  }
}

function campus(roadNetwork: RoadNetwork | undefined = network(), bounds = { width: 500, depth: 500 }): CampusData {
  return {
    name: '测试校园', bounds, zones: [], roads: [],
    waters: [], fields: [], trees: [], pois: [], roadNetwork,
    buildings: [
      { id: 'a', name: '教学楼 A', category: 'academic', position: [0, 0], size: [4, 4], height: 10 },
      { id: 'b', name: '图书馆', category: 'library', position: [100, 0], size: [4, 4], height: 12 },
    ],
  }
}

describe('硬用例 1：起点 = 终点', () => {
  it('error 含「相同」，不返回 0 米路线', () => {
    const result = planRoute(campus(), 0, 0)
    expect(result.route).toBeNull()
    expect(result.error?.message).toContain('相同')
    expect(result.error?.code).toBe('same-point')
  })
})

describe('硬用例 2：建筑没有路网节点', () => {
  it('error 含「没有」/「不可达」，不抛异常', () => {
    const data = campus(network())
    data.buildings[1].position = [15000, 0]
    let result
    expect(() => { result = planRoute(data, 0, 1) }).not.toThrow()
    expect(result!.route).toBeNull()
    expect(result!.error?.message).toMatch(/没有|不可达/)
    expect(() => planRoute(campus({ nodes: [], segments: [] }), 0, 1)).not.toThrow()
  })
})

describe('硬用例 3：两簇孤岛不连通', () => {
  it('error 提示不可达，不给半条路线', () => {
    const islands: RoadNetwork = {
      nodes: [
        { id: 'a1', position: [0, 0], kind: 'entrance' },
        { id: 'a2', position: [10, 0], kind: 'junction' },
        { id: 'b1', position: [100, 0], kind: 'entrance' },
        { id: 'b2', position: [110, 0], kind: 'junction' },
      ],
      segments: [
        { id: 'island-a', from: 'a1', to: 'a2', centerline: [[0, 0], [10, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
        { id: 'island-b', from: 'b1', to: 'b2', centerline: [[100, 0], [110, 0]], width: 6, class: 'walkway', surface: 'paving', access: { pedestrian: true, bicycle: true, vehicle: true } },
      ],
    }
    const data = campus(islands)
    data.buildings[0].position = [5, 0]
    data.buildings[1].position = [105, 0]
    const result = planRoute(data, 0, 1)
    expect(result.route).toBeNull()
    expect(result.error?.message).toContain('不可达')
  })
})

describe('硬用例 4：非法坐标', () => {
  it.each([NaN, Infinity, -Infinity, 1e9])('坐标 %p 返回 error，不抛异常、不进渲染', (bad) => {
    const data = campus()
    data.buildings[1].position = [bad, 0]
    let result
    expect(() => { result = planRoute(data, 0, 1) }).not.toThrow()
    expect(result!.route).toBeNull()
    expect(result!.error?.code).toBe('invalid-position')
  })
})

describe('硬用例 5：三档 mode 的 duration 关系', () => {
  it('同一路段 vehicle < bicycle < pedestrian', () => {
    const data = campus()
    const pedestrian = planRoute(data, 0, 1, { mode: 'pedestrian' })
    const bicycle = planRoute(data, 0, 1, { mode: 'bicycle' })
    const vehicle = planRoute(data, 0, 1, { mode: 'vehicle' })
    for (const result of [pedestrian, bicycle, vehicle]) {
      expect(result.route).not.toBeNull()
      expect(result.route!.mode).toBe(result === pedestrian ? 'pedestrian' : result === bicycle ? 'bicycle' : 'vehicle')
    }
    expect(vehicle.route!.durationSeconds).toBeLessThan(bicycle.route!.durationSeconds)
    expect(bicycle.route!.durationSeconds).toBeLessThan(pedestrian.route!.durationSeconds)
    // 无车行权时返回不可达，而不是退化成步行时长。
    const walkOnly = planRoute(campus(network({ pedestrian: true, bicycle: false, vehicle: false })), 0, 1, { mode: 'vehicle' })
    expect(walkOnly.route).toBeNull()
    expect(walkOnly.error?.message).toContain('不可达')
  })
})

describe('硬用例 6：?from=&to= 深链', () => {
  it('合法 id 解析出 from/to，main.ts 接进导航态', () => {
    const state = parseDeepLink('/usts-tianping?from=a&to=b&mode=bicycle')
    expect(state).toEqual({ pack: 'usts-tianping', from: 'a', to: 'b', mode: 'bicycle' })
    expect(mainTs).toContain('deepLink?.from')
    expect(mainTs).toContain('deepLink?.to')
    expect(mainTs).toContain('resolveBuildingIndex(data, deepLink?.from)')
    expect(mainTs).toContain('if (routeState.origin !== null && routeState.destination !== null) applyRoute()')
    expect(resolveBuildingIndex(campus(), 'a')).toBe(0)
    expect(resolveBuildingIndex(campus(), 'ghost')).toBeNull()
  })

  it('非法 id 或缺 to 整条回落，页面不报错', () => {
    for (const url of ['/usts-tianping?from=A&to=b', '/usts-tianping?from=a', '/usts-tianping?from=&to=b', '/usts-tianping?from=a&to=B']) {
      expect(() => parseDeepLink(url)).not.toThrow()
      expect(parseDeepLink(url)).toBeNull()
    }
    expect(buildDeepLink({ pack: 'usts-tianping', from: 'A', to: 'b' })).toBeNull()
    expect(buildDeepLink({ pack: 'usts-tianping', from: 'a' })).toBeNull()
  })

  it('新参数与 q / building / level 共存，不覆盖既有解析', () => {
    expect(parseDeepLink('/usts-tianping?building=a&level=2&q=图书馆&from=a&to=b&mode=vehicle'))
      .toEqual({ pack: 'usts-tianping', building: 'a', level: 2, q: '图书馆', from: 'a', to: 'b', mode: 'vehicle' })
    expect(parseDeepLink('/usts-tianping?building=a&level=2')).toEqual({ pack: 'usts-tianping', building: 'a', level: 2 })
    expect(buildDeepLink({ pack: 'usts-tianping', from: 'a', to: 'b', mode: 'vehicle' }))
      .toBe('/usts-tianping?from=a&to=b&mode=vehicle')
  })
})

describe('硬用例 7：?mode=flying 回落 pedestrian', () => {
  it('mode 非法不抛异常，入口回落步行', () => {
    expect(() => parseDeepLink('/usts-tianping?from=a&to=b&mode=flying')).not.toThrow()
    expect(parseDeepLink('/usts-tianping?from=a&to=b&mode=flying'))
      .toEqual({ pack: 'usts-tianping', from: 'a', to: 'b', mode: 'flying' })
    expect(isNavigationMode('flying')).toBe(false)
    expect(isNavigationMode('pedestrian')).toBe(true)
    expect(mainTs).toContain("isNavigationMode(requestedMode) ? requestedMode : 'pedestrian'")
    expect(buildDeepLink({ pack: 'usts-tianping', from: 'a', to: 'b', mode: 'flying' }))
      .toBe('/usts-tianping?from=a&to=b&mode=flying')
  })
})

describe('UI 接线：模式切换 + 错误提示 + 摘要模式', () => {
  it('三类控件与文案都在白名单文件里', () => {
    for (const mode of ['pedestrian', 'bicycle', 'vehicle']) {
      expect(navUiTs).toContain(`data-mode="${mode}"`)
    }
    expect(navUiTs).toContain('onModeChange')
    expect(navUiTs).toContain('state.error.message')
    expect(navUiTs).toContain('当前模式：')
    expect(navUiTs).toContain('NAVIGATION_MODE_LABELS[state.mode]')
  })
})
