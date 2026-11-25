/**
 * M2-C 室内楼层条：从建筑 floors 派生楼层列表，渲染切换按钮与当前层标记。
 * 只读数据，不改相机与 schema；没有 floors 的建筑返回空，行为与之前完全一致。
 */
import type { CampusData, Building } from '../data/campusData'
import { floorRoomsOf, listBuildingConnectors } from '../editor/floors'
import { escapeHtml } from './panel'

export type IndoorLevelOption = {
  level: number
  label: string
}

/** M2-A floors 的 level/name；不写 fallback 到 levels，避免把编辑器私有语义带进地图页。 */
export function indoorLevelsOf(building: Building | undefined): IndoorLevelOption[] {
  const floors = (building as (Building & { floors?: { level: number; name?: string }[] }) | undefined)?.floors
  if (!Array.isArray(floors) || !floors.length) return []
  return floors
    .filter((floor): floor is { level: number; name?: string } => Boolean(floor) && Number.isInteger(floor.level))
    .map((floor) => ({ level: floor.level, label: floor.name || (floor.level < 0 ? `B${-floor.level}` : `${floor.level + 1}F`) }))
}

/** 选层合法性：地板不存在则 null，调用方据此回落整楼视图。 */
export function normalizeIndoorLevel(building: Building | undefined, level: unknown): number | null {
  if (!indoorLevelsOf(building).some((option) => option.level === level)) return null
  return level as number
}

/** 当前层在相邻楼层之间的竖向连接标记（stair/elevator/ramp 的终点层）。 */
export function connectorTargetsOf(data: CampusData, building: Building | undefined, level: number): number[] {
  if (!building) return []
  const targets = new Set<number>()
  for (const row of listBuildingConnectors(data, building)) {
    if (row.from === level) targets.add(row.to)
    else if (row.to === level) targets.add(row.from)
  }
  return [...targets].sort((a, b) => a - b)
}

export type IndoorRoomOption = {
  id: string
  label: string
}

/** 当前层的房间名列表；没有 rooms 时返回空数组，老 pack 行为不变。 */
export function indoorRoomsOf(building: Building | undefined, level: number | null): IndoorRoomOption[] {
  if (!building || level === null) return []
  return floorRoomsOf(building, level).map((room) => ({ id: room.id, label: room.name }))
}

export type IndoorLevelsHandle = {
  update: (building: Building | undefined, level: number | null) => void
  destroy: () => void
}

/**
 * 在给定容器挂楼层条。组件只管自己那块 DOM，调用方负责插到页面哪一层。
 * 按钮 44px 命中区；窄屏靠 CSS 贴底但不压状态条/抽屉手柄。
 */
export function mountIndoorLevels(host: HTMLElement, opts: {
  data: CampusData
  onSelect: (level: number) => void
  onSelectRoom?: (roomId: string) => void
}): IndoorLevelsHandle {
  const render = (building: Building | undefined, level: number | null): void => {
    const options = indoorLevelsOf(building)
    if (!building || !options.length || level === null) {
      host.innerHTML = ''
      host.hidden = true
      return
    }
    const targets = new Set(connectorTargetsOf(opts.data, building, level))
    const rooms = indoorRoomsOf(building, level)
    host.hidden = false
    host.innerHTML = `
      <div class="indoor-levels-inner" role="group" aria-label="室内楼层切换">
        <span class="indoor-levels-caption">${escapeHtml(building.name)} · 室内</span>
        <div class="indoor-level-buttons">
          ${options.map((option) => `<button type="button" class="indoor-level-btn${option.level === level ? ' is-active' : ''}${targets.has(option.level) ? ' has-connector' : ''}" data-level="${option.level}" aria-pressed="${option.level === level}" title="${escapeHtml(option.label)}${targets.has(option.level) ? ' · 竖向连接' : ''}">${escapeHtml(option.label)}</button>`).join('')}
        </div>
        ${rooms.length ? `<div class="indoor-room-list" role="group" aria-label="本层店面"><span class="indoor-room-caption">店面</span>${rooms.map((room) => `<button type="button" class="indoor-room-btn" data-room="${escapeHtml(room.id)}" title="${escapeHtml(room.label)}">${escapeHtml(room.label)}</button>`).join('')}</div>` : ''}
      </div>`
  }

  const onClick = (event: MouseEvent): void => {
    const levelButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.indoor-level-btn')
    if (levelButton && !levelButton.disabled) {
      const level = Number(levelButton.dataset.level)
      if (Number.isSafeInteger(level)) opts.onSelect(level)
      return
    }
    const roomButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.indoor-room-btn')
    if (roomButton && !roomButton.disabled && opts.onSelectRoom && roomButton.dataset.room) opts.onSelectRoom(roomButton.dataset.room)
  }
  host.addEventListener('click', onClick)
  render(undefined, null)
  return {
    update: render,
    destroy: () => { host.removeEventListener('click', onClick); host.innerHTML = ''; host.hidden = true },
  }
}
