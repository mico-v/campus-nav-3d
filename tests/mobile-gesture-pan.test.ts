// @vitest-environment node
/**
 * 手机手势映射回归：单指平移，双指旋转+缩放。
 * 桌面端 mouseButtons 不动；单击选中依赖的 pointerdown/up 位移阈值必须保留。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { configureTouchGestures } from '../src/scene/CampusScene'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sceneTs = readFileSync(join(repoRoot, 'src/scene/CampusScene.ts'), 'utf8')

/** OrbitControls 需要的 DOM 桩：构造时只挂监听并写 touchAction，不触发手势。 */
function stubElement(): HTMLElement {
  return {
    addEventListener: () => {},
    removeEventListener: () => {},
    getRootNode: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
    ownerDocument: { removeEventListener: () => {} },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    style: {},
    clientHeight: 100,
  } as unknown as HTMLElement
}

function makeControls(): OrbitControls {
  return new OrbitControls(new THREE.PerspectiveCamera(), stubElement())
}

describe('移动端 touches 映射', () => {
  it('configureTouchGestures 把单指设为 PAN、双指设为 DOLLY_ROTATE', () => {
    const controls = makeControls()
    // 先确认 three 默认值，证明是这个函数改的，不是库本身就这样
    expect(controls.touches).toEqual({ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN })

    configureTouchGestures(controls)

    expect(controls.touches.ONE).toBe(THREE.TOUCH.PAN)
    expect(controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_ROTATE)
  })

  it('桌面端 mouseButtons 保持不变', () => {
    const controls = makeControls()
    const before = { ...controls.mouseButtons }
    configureTouchGestures(controls)
    expect(controls.mouseButtons).toEqual(before)
    expect(controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN })
  })

  it('CampusScene 构造函数实际调用配置函数', () => {
    expect(sceneTs).toMatch(/this\.controls\s*=\s*new OrbitControls\([^)]*\)\s*\n\s*configureTouchGestures\(this\.controls\)/)
  })

  it('单击选中阈值逻辑仍在：pointerdown 记位、pointerup 按位移判定', () => {
    for (const name of ['handlePointerDown', 'handlePointerUp']) {
      expect(sceneTs, `${name} 不能丢`).toContain(`${name}(event: PointerEvent)`)
    }
    expect(sceneTs).toContain('this.pointerDownScreen = [event.clientX, event.clientY]')
    expect(sceneTs).toMatch(/if \(moved > 5\) return/)
    expect(sceneTs).toContain('this.onSelectionChange?.({ kind: \'building\', index: userData.index })')
  })
})
