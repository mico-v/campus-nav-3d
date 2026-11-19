import { describe, it, expect } from 'vitest'
import { readSearchQuery } from '../src/ui/searchQuery'

describe('readSearchQuery', () => {
  it('returns empty string when there is no query string', () => {
    expect(readSearchQuery('')).toBe('')
    expect(readSearchQuery('?')).toBe('')
    expect(readSearchQuery('?from=nav')).toBe('')
  })

  it('reads and decodes the shell search param', () => {
    expect(readSearchQuery('?q=%E5%9B%BE%E4%B9%A6%E9%A6%86')).toBe('图书馆')
    expect(readSearchQuery('?q=a+b')).toBe('a b')
    expect(readSearchQuery('?from=nav&q=library')).toBe('library')
    expect(readSearchQuery('from=nav&q=gate')).toBe('gate')
  })

  it('trims whitespace and ignores blank values', () => {
    expect(readSearchQuery('?q=%20%20')).toBe('')
    expect(readSearchQuery('?q=++library++')).toBe('library')
  })
})
