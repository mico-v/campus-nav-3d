// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { sheetHeightRatio, type SheetState } from '../src/ui/sheet'

describe('sheet viewport tokens', () => {
  const ratios: Record<SheetState, number> = { peek: 0.16, half: 0.52, full: 0.86 }

  it.each([320, 768, 1280] as const)('keeps heights token-based at %ipx width', (width) => {
    void width
    const styles = {
      getPropertyValue: (name: string) => `${((ratios[name.replace('--sheet-', '') as SheetState] ?? 0) * 100).toFixed(0)}vh`,
    } as CSSStyleDeclaration
    const height = 720
    for (const state of ['peek', 'half', 'full'] as const) {
      expect(Math.abs(sheetHeightRatio(state, height, styles) - ratios[state])).toBeLessThanOrEqual(0.02)
    }
    expect(sheetHeightRatio('peek', height, styles) * height).toBeLessThanOrEqual(height * 0.3)
  })
})
