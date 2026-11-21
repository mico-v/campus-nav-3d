// @vitest-environment node
/**
 * M6-A 契约用例：签名 + 四条契约（meta 独立 / load 幂等 / pack 合法 / 失败 message 非空）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createStaticDataSource, toCampusData, __adapterTestHooks } from './adapter'
import { createDefaultCampusData } from './campusData'
import { validateCampusPack } from '../../packages/campus-schema/src/index'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('M6-A 数据源适配层契约', () => {
  it('createStaticDataSource 返回 kind 为 static，且 load/getMeta 是方法', async () => {
    const source = createStaticDataSource()
    expect(source.kind).toBe('static')
    expect(typeof source.load).toBe('function')
    expect(typeof source.getMeta).toBe('function')
    await expect(source.getMeta()).resolves.toBeDefined()
  })

  it('getMeta 不依赖 load：未调用 load 就能拿到元信息，且 getMeta 不触发 load', async () => {
    const source = createStaticDataSource()
    const loadSpy = vi.spyOn(source, 'load')
    const meta = await source.getMeta()
    expect(meta.id).toBe('usts-tianping')
    expect(meta.schema).toBe('campus-pack/2')
    expect(meta.name).toBeTruthy()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('load 两次返回的 pack 深比较相等（幂等）', async () => {
    const source = createStaticDataSource()
    const first = await source.load()
    const second = await source.load()
    expect(second).toEqual(first)
  })

  it('load 结果过 validateCampusPack，ok === true', async () => {
    const pack = await createStaticDataSource().load()
    expect(validateCampusPack(pack).ok).toBe(true)
  })

  it('getMeta 与 load 的 meta 字段一致', async () => {
    const source = createStaticDataSource()
    const meta = await source.getMeta()
    const pack = await source.load()
    expect(pack.schema).toBe(meta.schema)
    expect(pack.id).toBe(meta.id)
    expect(pack.bounds).toEqual(meta.bounds)
  })

  it('main 装配路径与直接调用 createDefaultCampusData 等价', async () => {
    const original = createDefaultCampusData()
    const pack = await createStaticDataSource().load()
    expect(toCampusData(pack)).toEqual(original)
  })

  it('失败路径 reject 的 message 是非空字符串', async () => {
    // 通过测试钩子注入坏 pack，验证 load 校验失败时抛可读错误。
    const original = __adapterTestHooks.buildPack
    __adapterTestHooks.buildPack = () => ({ id: 'bad' }) as never
    try {
      const source = createStaticDataSource()
      await expect(source.load()).rejects.toMatchObject({ message: expect.stringMatching(/\S/) })
    } finally {
      __adapterTestHooks.buildPack = original
    }
  })
})
