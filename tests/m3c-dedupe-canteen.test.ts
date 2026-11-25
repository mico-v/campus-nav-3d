import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDefaultCampusData } from '../src/data/campusData'
import { searchEntities } from '../src/ui/panel'
import { editorSearchResults } from '../src/editor/search'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
type Place = { id: string; name: string; aliases?: string[]; floors?: Array<{ level: number; rooms?: Array<{ id: string; name: string }> }> }
const pack = JSON.parse(readFileSync(join(repoRoot, 'packs/usts-tianping/campus.json'), 'utf8')) as {
  places: Place[]
  buildings: Place[]
  pois: Array<{ id: string; name: string; parentBuilding?: string; floor?: number; indoor?: boolean }>
}

describe('M3-C 二食堂去重', () => {
  it('二食堂只有建筑 place-14 一个点名，POI 总数写死 63', () => {
    expect(pack.places.filter((place) => place.name === '二食堂').map((place) => place.id)).toEqual(['place-14'])
    expect(pack.buildings.filter((building) => building.name === '二食堂').map((building) => building.id)).toEqual(['place-14'])
    expect(pack.places).toEqual(pack.buildings)
    expect(pack.pois.filter((poi) => poi.name === '二食堂')).toEqual([])
    expect(pack.pois).toHaveLength(63)
    expect(createDefaultCampusData().pois).toHaveLength(65)
  })

  it('搜二食堂只出 1 条，指向建筑 place-14', () => {
    const data = createDefaultCampusData()
    expect(searchEntities(data, '二食堂').filter((item) => item.name === '二食堂')).toEqual([
      expect.objectContaining({ kind: 'building', id: 'place-14', name: '二食堂' }),
    ])
    const editorHits = editorSearchResults(data, '二食堂').filter((result) => result.label === '二食堂')
    expect(editorHits).toHaveLength(1)
    expect(editorHits[0]?.label).toBe('二食堂')
  })

  it('室内房间与 KFC / 肯悦咖啡引用链完整', () => {
    const canteen = pack.buildings.find((building) => building.id === 'place-14')!
    expect(canteen.floors?.map((floor) => floor.level)).toEqual([0, 1])
    const roomIds = canteen.floors?.flatMap((floor) => floor.rooms?.map((room) => room.id) ?? []) ?? []
    expect(roomIds).toContain('poi-m1-048')
    expect(roomIds).toContain('poi-m1-049')

    const indoor = pack.pois.filter((poi) => poi.indoor && poi.parentBuilding === '二食堂')
    expect(indoor.map((poi) => ({ id: poi.id, floor: poi.floor }))).toEqual([
      { id: 'poi-m1-048', floor: 0 },
      { id: 'poi-m1-049', floor: 1 },
    ])
    expect(pack.buildings.some((building) => building.name === '二食堂')).toBe(true)

    const data = createDefaultCampusData()
    expect(data.pois.some((poi) => poi.id === 'poi-m1-048')).toBe(true)
    expect(data.pois.some((poi) => poi.id === 'poi-m1-049')).toBe(true)
  })
})
