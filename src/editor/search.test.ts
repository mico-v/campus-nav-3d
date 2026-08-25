import { describe, expect, it } from 'vitest'
import { createDefaultCampusData } from '../data/campusData'
import { editorSearchResults, selectionForValidationError } from './search'

describe('editor structure search', () => {
  it('searches structures by human name and stable id', () => {
    const data = createDefaultCampusData()
    expect(editorSearchResults(data, '西部教学区')[0]?.selection).toEqual({ kind: 'zone', index: 1 })
    expect(editorSearchResults(data, 'road-10')[0]?.selection).toEqual({ kind: 'road', index: 0 })
  })

  it('maps source and topology validation errors back to editable roads', () => {
    const data = createDefaultCampusData()
    const segment = data.roadNetwork.segments.find((item) => item.sourceIds?.includes('road-10'))!
    expect(selectionForValidationError(data, `roadNetwork：道路段 ${segment.id} 宽度无效`)).toEqual({ kind: 'road', index: 0 })
    expect(selectionForValidationError(data, '道路 road-10 width 无效')).toEqual({ kind: 'road', index: 0 })
  })
})
