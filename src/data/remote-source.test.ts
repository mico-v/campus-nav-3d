// @vitest-environment node
/**
 * M6-B：远程数据源三条路径。原 adapter.test.ts 的 9 例断言一字未改。
 */
import { describe, it, expect, vi } from 'vitest'
import type { CampusPack } from '../../packages/campus-schema/src/index'
import { validateCampusPack } from '../../packages/campus-schema/src/index'
import { createDataSource, createStaticDataSource, __adapterTestHooks } from './adapter'
import { createRemoteDataSource, DEFAULT_REMOTE_TIMEOUT_MS } from './remote-source'

function okResponse(pack: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => pack } as Response
}

function remoteConfig(extra: Partial<Parameters<typeof createDataSource>[0]> = {}) {
  return { kind: 'remote' as const, baseUrl: 'https://example.invalid/pack.json', fallback: 'static' as const, ...extra }
}

async function validPack(): Promise<CampusPack> {
  return __adapterTestHooks.buildPack()
}

describe('M6-B 远程数据源', () => {
  it('远程成功：返回校验通过的 pack，load 幂等，getMeta 不触发请求', async () => {
    const pack = await validPack()
    expect(validateCampusPack(pack).ok).toBe(true)
    const fetchFn = vi.fn(async () => okResponse(pack)) as unknown as typeof fetch
    const warn = vi.fn()
    const source = createDataSource({ ...remoteConfig(), fetchFn, warn })

    expect(source.kind).toBe('remote')
    const meta = await source.getMeta()
    expect(meta.id).toBe('usts-tianping')
    expect(fetchFn).not.toHaveBeenCalled()

    const first = await source.load()
    const second = await source.load()
    expect(validateCampusPack(first).ok).toBe(true)
    expect(second).toEqual(first)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('远程返回非法 pack：降级静态包 + 可读提示，调用方不炸', async () => {
    const warn = vi.fn()
    const fetchFn = vi.fn(async () => okResponse({ id: 'bad' })) as unknown as typeof fetch
    const source = createDataSource({ ...remoteConfig(), fetchFn, warn })

    const pack = await source.load()
    expect(validateCampusPack(pack).ok).toBe(true)
    expect(pack.buildings?.length ?? 0).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/校验失败/)
  })

  it('网络失败 / 非 2xx / 超时：均降级静态包，不抛异常', async () => {
    const cases: Array<{ name: string; fetchFn: typeof fetch; timeoutMs?: number; expectHint: RegExp }> = [
      {
        name: '网络失败',
        fetchFn: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch,
        expectHint: /网络失败/,
      },
      {
        name: '非 2xx',
        fetchFn: (async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' })) as unknown as typeof fetch,
        expectHint: /HTTP 503/,
      },
      {
        name: '超时',
        fetchFn: (async (_url: string, init?: RequestInit) => {
          await new Promise<void>((resolve) => {
            init?.signal?.addEventListener('abort', () => resolve(), { once: true })
          })
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        }) as unknown as typeof fetch,
        timeoutMs: 5,
        expectHint: /超时/,
      },
    ]

    for (const item of cases) {
      const warn = vi.fn()
      const source = createRemoteDataSource({
        ...remoteConfig({ timeoutMs: item.timeoutMs }),
        fetchFn: item.fetchFn,
        staticSource: createStaticDataSource,
        warn,
      })
      const pack = await source.load()
      expect(validateCampusPack(pack).ok, item.name).toBe(true)
      expect(warn, item.name).toHaveBeenCalled()
      expect(String(warn.mock.calls[0][0])).toMatch(item.expectHint)
    }
    expect(DEFAULT_REMOTE_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
