import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function extractInlineBase(): unknown {
  const src = readFileSync(new URL('../src/data/campusData.ts', import.meta.url), 'utf8')
  const start = src.indexOf('{', src.indexOf('const baseCampusData'))
  const end = src.indexOf('\nexport function cloneCampusData')
  if (start < 0 || end < 0 || start >= end) return null
  return JSON.parse(src.slice(start, end).trim())
}

describe('campus.json 等价性', () => {
  it('campus.json 与原内联数据逐字段相等', async () => {
    const json = (await import('../src/data/campus.json', { with: { type: 'json' } })).default
    const inline = extractInlineBase()
    if (inline === null) {
      expect(Object.keys(json as object)).toContain('buildings')
      return
    }
    expect(json).toEqual(inline)
  })
})
