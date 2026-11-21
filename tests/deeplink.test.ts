import { describe, it, expect } from 'vitest'
import { parseDeepLink, buildDeepLink, shortLinkRedirect } from '../src/deeplink/index'

describe('parseDeepLink 正常输入', () => {
  it('解析 pack + 三参数全集', () => {
    expect(parseDeepLink('/usts-tianping?building=central-core&level=2&q=图书馆'))
      .toEqual({ pack: 'usts-tianping', building: 'central-core', level: 2, q: '图书馆' })
  })

  it('参数任意顺序、可缺省，level=0 合法', () => {
    expect(parseDeepLink('/campus?level=0&building=main-hall'))
      .toEqual({ pack: 'campus', building: 'main-hall', level: 0 })
    expect(parseDeepLink('https://map.mioc.cc/demo-pack?q=gate'))
      .toEqual({ pack: 'demo-pack', q: 'gate' })
    expect(parseDeepLink('/some-pack?building=place-02'))
      .toEqual({ pack: 'some-pack', building: 'place-02' })
  })

  it('完整 URL 与相对 URL 解析一致；URL 对象也可直接传入', () => {
    const relative = '/usts-tianping?building=a-1&level=1'
    const absolute = 'https://map.mioc.cc/usts-tianping?building=a-1&level=1'
    expect(parseDeepLink(absolute)).toEqual(parseDeepLink(relative))
    expect(parseDeepLink(new URL(absolute))).toEqual(parseDeepLink(relative))
  })

  it('q 两端空白被 trim', () => {
    expect(parseDeepLink('/campus?q=%20%20library%20%20')).toEqual({ pack: 'campus', q: 'library' })
  })

  it('query 中 + 解码为空格（URLSearchParams 兼容）', () => {
    expect(parseDeepLink('/campus?q=a+b')).toEqual({ pack: 'campus', q: 'a b' })
    expect(parseDeepLink('/campus?q=a%2Bb')).toEqual({ pack: 'campus', q: 'a+b' })
  })

  it('解析 /s/<id> 短链形态', () => {
    expect(parseDeepLink('/s/abc123')).toEqual({ shortId: 'abc123' })
    expect(parseDeepLink('https://map.mioc.cc/s/lib-42')).toEqual({ shortId: 'lib-42' })
  })

  it('老的无参 URL 不被误判为新深链（返回 null）', () => {
    expect(parseDeepLink('/')).toBeNull()
    expect(parseDeepLink('/demo.html')).toBeNull()
    expect(parseDeepLink('https://map.mioc.cc/')).toBeNull()
  })
})

describe('parseDeepLink 非法输入返回 null 且不抛', () => {
  const invalid: unknown[] = [
    null, undefined, 42, true, {}, [],
    '', '   ', '::not-a-url::',
    '/', '/USTS', '/Bad_Pack', '/-pack',
    '/campus?building=UPPER', '/campus?building=bad_id', '/campus?building=',
    '/campus?level=-1', '/campus?level=1.5', '/campus?level=1e3',
    '/campus?level=', '/campus?level=1000', '/campus?level=abc',
    '/campus?q=%20%20', '/campus?q=',
    '/campus?unknown=1', '/campus?building=a-1&building=b-2',
    '/campus?building=a-1#frag',
    '/campus?q=%ZZ',
    '/s/', '/s/ABC', '/s/abc?x=1',
    '/a/b?building=a-1', '/campus/?building=a-1',
  ]
  it.each(invalid)('rejects %p', (input) => {
    expect(() => parseDeepLink(input)).not.toThrow()
    expect(parseDeepLink(input)).toBeNull()
  })
})

describe('buildDeepLink', () => {
  it('生成相对深链，键顺序固定', () => {
    expect(buildDeepLink({ pack: 'usts-tianping', building: 'central-core', level: 2, q: '图书馆' }))
      .toBe('/usts-tianping?building=central-core&level=2&q=%E5%9B%BE%E4%B9%A6%E9%A6%86')
    expect(buildDeepLink({ pack: 'campus', q: 'a b', building: 'main-hall' }))
      .toBe('/campus?building=main-hall&q=a+b')
    expect(buildDeepLink({ pack: 'empty-pack' })).toBe('/empty-pack')
  })

  it('与 parseDeepLink 往返一致', () => {
    const state = { pack: 'usts-tianping', building: 'place-02', level: 0, q: '门禁' }
    expect(parseDeepLink(buildDeepLink(state)!)).toEqual(state)
  })

  it('非法输入返回 null 且不抛', () => {
    const invalid: unknown[] = [
      null, undefined, 42, 'campus', [], {},
      { building: 'a-1' },
      { pack: 'Bad' }, { pack: '' },
      { pack: 'campus', building: 'Bad_Id' },
      { pack: 'campus', level: -1 }, { pack: 'campus', level: 1.5 },
      { pack: 'campus', level: '2' }, { pack: 'campus', level: 1000 },
      { pack: 'campus', q: '   ' }, { pack: 'campus', q: 42 },
      { pack: 'campus', extra: 1 },
    ]
    for (const input of invalid) {
      expect(() => buildDeepLink(input)).not.toThrow()
      expect(buildDeepLink(input)).toBeNull()
    }
  })

  it('trim q 后再输出，保证 parse 后等价', () => {
    expect(buildDeepLink({ pack: 'campus', q: '  library  ' })).toBe('/campus?q=library')
  })
})

describe('短链解析契约', () => {
  it('从短链记录中提取并规范化 deepLink', () => {
    expect(shortLinkRedirect({ deepLink: '/usts-tianping?building=central-core&level=2' }))
      .toBe('/usts-tianping?building=central-core&level=2')
  })

  it('非法记录或非法 deepLink 返回 null', () => {
    expect(shortLinkRedirect(null)).toBeNull()
    expect(shortLinkRedirect({})).toBeNull()
    expect(shortLinkRedirect({ deepLink: 42 })).toBeNull()
    expect(shortLinkRedirect({ deepLink: '/s/another' })).toBeNull()
    expect(shortLinkRedirect({ deepLink: '/Bad?building=x' })).toBeNull()
  })
})

describe('入口装配 planDeepLinkBoot', () => {
  it('入口页带 ?q= 时指向 demo.html 并保留 q', async () => {
    const { planDeepLinkBoot } = await import('../src/deeplink/boot')
    expect(planDeepLinkBoot('https://map.mioc.cc/?q=library')).toEqual({
      pack: 'default',
      state: { pack: 'default', q: 'library' },
      shortId: null,
      targetUrl: 'demo.html?q=library',
    })
  })

  it('pack 深链直接规范化为相对 deep link', async () => {
    const { planDeepLinkBoot } = await import('../src/deeplink/boot')
    const result = planDeepLinkBoot('/usts-tianping?building=central-core&level=2')
    expect(result.targetUrl).toBe('/usts-tianping?building=central-core&level=2')
    expect(result.pack).toBe('usts-tianping')
  })

  it('短链形态只识别，不自行跳转', async () => {
    const { planDeepLinkBoot } = await import('../src/deeplink/boot')
    expect(planDeepLinkBoot('/s/abc123')).toEqual({
      pack: null, state: null, shortId: 'abc123', targetUrl: null,
    })
  })
})
