/**
 * M4-A 兜底解析契约：新增文件，不改既有 deeplink / shell-deeplink 用例。
 * 覆盖：未知 / 畸形参数、缺字段默认值、短链形式一致、永不抛异常。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PACK,
  isDefaultIntent,
  parseIntent,
  type IntentCatalog,
} from '../src/core/deeplink/intent'
import { parseDeepLink } from '../src/deeplink/index'

const catalog: IntentCatalog = {
  knownPacks: new Set(['usts-tianping', 'campus']),
  knownBuildings: new Set(['central-core', 'main-hall']),
}

const defaultExpectation = (reason: string) => ({
  pack: DEFAULT_PACK,
  source: 'default',
  fallback: true,
  reason,
})

describe('parseIntent 正常输入', () => {
  it('保留深链的全部字段，不标兜底', () => {
    expect(parseIntent('/usts-tianping?building=central-core&level=2&q=图书馆', catalog)).toEqual({
      pack: 'usts-tianping',
      building: 'central-core',
      level: 2,
      q: '图书馆',
      source: 'deep-link',
      fallback: false,
      reason: 'none',
    })
  })

  it('缺字段时只带已给字段，其余不补假值', () => {
    expect(parseIntent('/campus?q=gate', catalog)).toEqual({
      pack: 'campus',
      q: 'gate',
      source: 'deep-link',
      fallback: false,
      reason: 'none',
    })
    expect(parseIntent('/campus?level=0', catalog)).toEqual({
      pack: 'campus',
      level: 0,
      source: 'deep-link',
      fallback: false,
      reason: 'none',
    })
  })

  it('不传 catalog 时不做已知性校验，兼容原解析结果', () => {
    const input = '/any-pack?building=any-building&level=3'
    const parsed = parseDeepLink(input)
    const intent = parseIntent(input)
    expect(intent.pack).toBe((parsed as { pack: string }).pack)
    expect(intent.building).toBe('any-building')
    expect(intent.level).toBe(3)
    expect(intent.fallback).toBe(false)
  })
})

describe('parseIntent 兜底：未知 / 畸形 / 缺输入', () => {
  it('未知 pack、未知 building 回落默认视图，并给出原因', () => {
    expect(parseIntent('/ghost-pack?building=central-core', catalog)).toEqual(
      defaultExpectation('unknown-pack'),
    )
    expect(parseIntent('/usts-tianping?building=ghost-room&level=1', catalog)).toEqual(
      defaultExpectation('unknown-building'),
    )
  })

  it('已知 pack 但未知 building 不会泄漏 building 字段', () => {
    const intent = parseIntent('/campus?building=ghost-room&level=2&q=lib', catalog)
    expect(intent).toEqual(defaultExpectation('unknown-building'))
    expect(intent).not.toHaveProperty('building')
    expect(intent).not.toHaveProperty('level')
  })

  it.each<unknown[]>([
    [null],
    [undefined],
    [42],
    [true],
    [{}],
    [[]],
    [''],
    ['   '],
  ])('非字符串 / 垃圾输入 %p 回退默认且不抛', (input) => {
    expect(() => parseIntent(input, catalog)).not.toThrow()
    expect(parseIntent(input, catalog)).toEqual(defaultExpectation('no-intent'))
  })

  it('带内容的垃圾字符串回退为 invalid-input', () => {
    expect(parseIntent('::not-a-url::', catalog)).toEqual(defaultExpectation('invalid-input'))
  })

  it.each([
    '/usts-tianping?building=UPPER',
    '/usts-tianping?level=1.5',
    '/usts-tianping?level=-1',
    '/usts-tianping?level=1000',
    '/usts-tianping?q=%20%20',
    '/usts-tianping?unknown=1',
    '/usts-tianping?building=a-1&building=b-2',
    '/usts-tianping?q=%ZZ',
    '/usts-tianping?building=a-1#frag',
    '/a/b?building=a-1',
  ])('畸形参数 %s 回退默认且不抛', (input) => {
    expect(() => parseIntent(input, catalog)).not.toThrow()
    expect(parseIntent(input, catalog)).toEqual(defaultExpectation('invalid-input'))
  })

  it.each<unknown[]>([
    ['/usts-tianping', null],
    ['/usts-tianping', undefined],
    ['/usts-tianping', 0],
    ['/usts-tianping', 'not-a-set'],
    ['/usts-tianping', { knownPacks: null }],
  ])('畸形 catalog %p 不抛异常', (input, badCatalog) => {
    expect(() => parseIntent(input, badCatalog as never)).not.toThrow()
  })
})

describe('parseIntent 短链形式一致', () => {
  it('识别 /s/<id>，shortId 与 parseDeepLink 完全一致', () => {
    for (const url of ['/s/abc123', 'https://map.mioc.cc/s/lib-42']) {
      const parsed = parseDeepLink(url)
      const intent = parseIntent(url, catalog)
      expect(parsed).not.toBeNull()
      expect(intent.source).toBe('short-link')
      expect(intent.reason).toBe('short-link')
      expect(intent.shortId).toBe((parsed as { shortId: string }).shortId)
      expect(intent.fallback).toBe(true)
      expect(intent.pack).toBe(DEFAULT_PACK)
    }
  })

  it('短链畸形参数走默认，不泄漏 shortId', () => {
    const intent = parseIntent('/s/ABC123?x=1', catalog)
    expect(intent).toEqual(defaultExpectation('invalid-input'))
    expect(intent).not.toHaveProperty('shortId')
  })
})

describe('isDefaultIntent', () => {
  it('只有默认视图且无短链时为真', () => {
    expect(isDefaultIntent(parseIntent('::bad::', catalog))).toBe(true)
    expect(isDefaultIntent(parseIntent('/usts-tianping', catalog))).toBe(false)
    expect(isDefaultIntent(parseIntent('/s/abc123', catalog))).toBe(false)
  })
})
