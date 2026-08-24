import { describe, it, expect } from 'vitest'
import { createDefaultCampusData } from '../src/data/campusData'

describe('static map data contract', () => {
  it('does not persist navigation routes', () => {
    expect('routes' in createDefaultCampusData()).toBe(false)
  })
})
