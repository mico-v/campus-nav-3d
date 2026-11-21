/**
 * M6-B：远程数据源。
 *
 * 从 baseUrl 拉 campus-pack/2 的完整 pack，过 validateCampusPack 后交给渲染层；
 * 校验失败 / 网络失败 / 非 2xx / 超时都按显式策略降级到静态包，并把原因 warn 出来，
 * 不把异常抛到调用方。
 */
import type { CampusPack, CampusPackMeta } from '../../packages/campus-schema/src/index'
import { validateCampusPack } from '../../packages/campus-schema/src/index'
import type { CampusDataSource } from './adapter'

/** 默认 8 秒：远程校园包通常很小，超时后必须让首屏走静态包。 */
export const DEFAULT_REMOTE_TIMEOUT_MS = 8000

export interface RemoteSourceOptions {
  baseUrl: string
  /** 仅测试注入；生产用全局 fetch。 */
  fetchFn?: typeof fetch
  /** 仅测试注入；0 或负数表示不限时。 */
  timeoutMs?: number
  /** 默认 console.warn；可注入收集提示用于断言。 */
  warn?: (message: string) => void
  /** 必填的降级工厂（由 adapter 注入，避免循环依赖）。 */
  staticSource: () => CampusDataSource
  /** 校验失败的 label，仅供 warn 文案。 */
  label?: string
}

function joinPackUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return /\.(?:json)(?:\?.*)?$/i.test(trimmed) ? trimmed : `${trimmed}/campus-pack.json`
}

function describeFailure(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message
  if (typeof reason === 'string' && reason) return reason
  return String(reason)
}

/**
 * 构造远程数据源。
 *
 * 契约：kind 恒为 'remote'；getMeta() 不触发请求，直接返回静态 pack meta（远程失败时
 * 渲染用的也是静态包，meta 必须与降级后的数据一致）。load() 成功返回校验过的远程包；
 * 任何失败都 warn 并降级到静态包，绝不 reject。连续 load 结果深比较相等（幂等）。
 */
export function createRemoteDataSource(options: RemoteSourceOptions): CampusDataSource {
  const {
    baseUrl,
    fetchFn = (...args) => fetch(...args),
    timeoutMs = DEFAULT_REMOTE_TIMEOUT_MS,
    warn = (message) => console.warn(message),
    staticSource,
    label = 'campus pack',
  } = options
  const url = joinPackUrl(baseUrl)
  const fallback = staticSource()

  let cached: CampusPack | undefined
  let warned = false

  const warnOnce = (message: string): void => {
    if (warned) return
    warned = true
    warn(message)
  }

  const fallbackLoad = async (reason: string): Promise<CampusPack> => {
    warnOnce(`[campus-data] 远程数据源不可用（${reason}），降级到静态包；baseUrl=${baseUrl}`)
    const pack = await fallback.load()
    cached = pack
    return structuredClone(pack)
  }

  return {
    kind: 'remote',

    async getMeta(): Promise<CampusPackMeta> {
      return fallback.getMeta()
    },

    async load(): Promise<CampusPack> {
      if (cached) return structuredClone(cached)

      let raw: unknown
      try {
        const controller = new AbortController()
        const timer = timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined
        try {
          const response = await fetchFn(url, { signal: controller.signal })
          if (!response.ok) {
            return await fallbackLoad(`HTTP ${response.status} ${response.statusText}`.trim())
          }
          raw = await response.json()
        } finally {
          if (timer !== undefined) clearTimeout(timer)
        }
      } catch (error) {
        const reason = error instanceof Error && error.name === 'AbortError'
          ? `请求超时（${timeoutMs}ms）`
          : `网络失败：${describeFailure(error)}`
        return await fallbackLoad(reason)
      }

      const result = validateCampusPack(raw)
      if (!result.ok) {
        const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
        return await fallbackLoad(`${label} 校验失败：${detail || '未知校验错误'}`)
      }

      cached = raw as CampusPack
      return structuredClone(cached)
    },
  }
}
