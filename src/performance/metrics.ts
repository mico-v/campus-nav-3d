export interface RenderMetrics {
  frames: number
  elapsedMs: number
  averageFrameMs: number
  maxFrameMs: number
  fps: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

export interface RenderBudget {
  minFps?: number
  maxAverageFrameMs?: number
  maxFrameMs?: number
  maxDrawCalls?: number
}

export interface RenderBudgetResult {
  passed: boolean
  failures: string[]
}

/** Small allocation-free frame sampler used by the 3D scene and performance tests. */
export class RenderMetricsMonitor {
  private frames = 0
  private elapsedMs = 0
  private maxFrameMs = 0
  private drawCalls = 0
  private triangles = 0
  private geometries = 0
  private textures = 0

  begin(): number {
    return performance.now()
  }

  end(start: number, info?: { calls?: number; triangles?: number; geometries?: number; textures?: number }): void {
    const duration = Math.max(0, performance.now() - start)
    this.frames += 1
    this.elapsedMs += duration
    this.maxFrameMs = Math.max(this.maxFrameMs, duration)
    this.drawCalls = info?.calls ?? this.drawCalls
    this.triangles = info?.triangles ?? this.triangles
    this.geometries = info?.geometries ?? this.geometries
    this.textures = info?.textures ?? this.textures
  }

  snapshot(): RenderMetrics {
    const averageFrameMs = this.frames ? this.elapsedMs / this.frames : 0
    return {
      frames: this.frames,
      elapsedMs: this.elapsedMs,
      averageFrameMs,
      maxFrameMs: this.maxFrameMs,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      geometries: this.geometries,
      textures: this.textures,
    }
  }

  reset(): void {
    this.frames = 0
    this.elapsedMs = 0
    this.maxFrameMs = 0
    this.drawCalls = 0
    this.triangles = 0
    this.geometries = 0
    this.textures = 0
  }
}

/** Evaluate a sampled browser run against explicit acceptance thresholds. */
export function evaluateRenderBudget(metrics: RenderMetrics, budget: RenderBudget = {}): RenderBudgetResult {
  const failures: string[] = []
  if (budget.minFps !== undefined && metrics.fps < budget.minFps) failures.push(`FPS ${metrics.fps.toFixed(1)} < ${budget.minFps}`)
  if (budget.maxAverageFrameMs !== undefined && metrics.averageFrameMs > budget.maxAverageFrameMs) failures.push(`平均帧耗时 ${metrics.averageFrameMs.toFixed(1)}ms > ${budget.maxAverageFrameMs}ms`)
  if (budget.maxFrameMs !== undefined && metrics.maxFrameMs > budget.maxFrameMs) failures.push(`最大帧耗时 ${metrics.maxFrameMs.toFixed(1)}ms > ${budget.maxFrameMs}ms`)
  if (budget.maxDrawCalls !== undefined && metrics.drawCalls > budget.maxDrawCalls) failures.push(`draw calls ${metrics.drawCalls} > ${budget.maxDrawCalls}`)
  return { passed: failures.length === 0, failures }
}
