import { describe, expect, it } from 'vitest'
import { RenderMetricsMonitor, evaluateRenderBudget } from './metrics'

describe('render metrics', () => {
  it('summarizes frame timing and renderer counters', () => {
    const monitor = new RenderMetricsMonitor()
    const start = monitor.begin()
    monitor.end(start, { calls: 12, triangles: 300, geometries: 8, textures: 2 })
    const result = monitor.snapshot()
    expect(result.frames).toBe(1)
    expect(result.averageFrameMs).toBeGreaterThanOrEqual(0)
    expect(result.drawCalls).toBe(12)
    expect(result.triangles).toBe(300)
  })

  it('resets accumulated samples', () => {
    const monitor = new RenderMetricsMonitor()
    monitor.end(monitor.begin())
    monitor.reset()
    expect(monitor.snapshot()).toMatchObject({ frames: 0, elapsedMs: 0, maxFrameMs: 0, fps: 0 })
  })

  it('evaluates explicit acceptance thresholds', () => {
    const result = evaluateRenderBudget({ frames: 10, elapsedMs: 160, averageFrameMs: 16, maxFrameMs: 24, fps: 62.5, drawCalls: 80, triangles: 0, geometries: 0, textures: 0 }, { minFps: 55, maxAverageFrameMs: 20, maxFrameMs: 30, maxDrawCalls: 100 })
    expect(result.passed).toBe(true)
    expect(evaluateRenderBudget({ frames: 1, elapsedMs: 50, averageFrameMs: 50, maxFrameMs: 50, fps: 20, drawCalls: 120, triangles: 0, geometries: 0, textures: 0 }, { minFps: 55, maxAverageFrameMs: 20, maxFrameMs: 30, maxDrawCalls: 100 }).failures).toHaveLength(4)
  })
})
