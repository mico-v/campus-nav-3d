/**
 * 壳内 ?q= 遗留契约回归锁（M4-A 不得为了新参数改动本文件）。
 * 行为来自 src/main.ts 现有逻辑：new URLSearchParams(location.search).get('q')?.trim()，
 * 非空则填入搜索框并触发一次 input。
 */
import { describe, it, expect } from 'vitest'
import { parseDeepLink } from '../src/deeplink/index'

function shellInitialQuery(href: string): string {
  const url = new URL(href, 'https://map.mioc.cc/')
  return new URLSearchParams(url.search).get('q')?.trim() ?? ''
}

describe('shell ?q= 遗留深链（不可改动）', () => {
  it('?q=图书馆 预填搜索词', () => {
    expect(shellInitialQuery('https://map.mioc.cc/demo.html?q=%E5%9B%BE%E4%B9%A6%E9%A6%86')).toBe('图书馆')
  })

  it('?q=  空白词不触发搜索', () => {
    expect(shellInitialQuery('https://map.mioc.cc/demo.html?q=%20%20')).toBe('')
    expect(shellInitialQuery('https://map.mioc.cc/demo.html')).toBe('')
  })

  it('?q= 保留大小写与内部空格，只 trim 两端', () => {
    expect(shellInitialQuery('https://map.mioc.cc/demo.html?q=%20C%20%20Hall%20')).toBe('C  Hall')
  })

  it('parseDeepLink 兼容老的 ?q= 链接，结果带默认 pack', () => {
    expect(parseDeepLink('/demo.html?q=library')).toEqual({ pack: 'default', q: 'library' })
    expect(parseDeepLink('https://map.mioc.cc/?q=%E5%9B%BE%E4%B9%A6%E9%A6%86'))
      .toEqual({ pack: 'default', q: '图书馆' })
  })
})
