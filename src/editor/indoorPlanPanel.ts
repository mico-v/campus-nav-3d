/**
 * 建模页的「室内平面」面板：左侧建筑/楼层树 + 中间 SVG 平面 + 保存。
 *
 * 定位：它挂在既有编辑器的 form-host 里（`insertAdjacentHTML`），不接管主画布 —— 主画布是全校区
 * 的 2D/3D 编辑，室内平面是另一套坐标系（楼层局部 + 房间 polygon），混在一起会互相抢事件。
 *
 * 模式：面板内自己的三个小模式（选中 / 新描 / 拖点），与主编辑器的 select/reshape 无关。
 */
import type { CampusData } from '../data/campusData.ts'
import type { CampusFloor } from '../../packages/campus-schema/src/index.ts'
import { floorPlan, isValidRing, ringCenter, ringToPath, type PlanGeometry } from './planView.ts'
import {
  addRoom,
  findBuilding,
  findFloor,
  findRoom,
  insertRoomVertex,
  moveRoomVertex,
  promotePlaceholder,
  removeRoom,
  setRoomPolygon,
  validateRooms,
  type RoomRef,
} from './roomOps.ts'
import type { Selection } from './types.ts'
import type { EditorStore } from './store.ts'

export type PlanMode = 'select' | 'draw' | 'vertex'

export interface IndoorPlanPanelOptions {
  store: EditorStore
  host: HTMLElement
  toast: (message: string) => void
  /** 选中变化时同步给主编辑器（让右侧表单也能显示房间） */
  onSelect?: (selection: Selection) => void
  readOnly?: boolean
}

interface PanelState {
  buildingId: string | null
  floorLevel: number
  mode: PlanMode
  /** 正在描的新多边形（世界坐标） */
  draft: Array<[number, number]>
  selectedRoomId: string | null
  dragging: { index: number } | null
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

/** 把指针事件坐标换算成平面世界坐标 */
function toWorld(svgEl: SVGSVGElement, box: { minX: number; minY: number; width: number; height: number }) {
  return (event: PointerEvent | MouseEvent): [number, number] => {
    const rect = svgEl.getBoundingClientRect()
    const x = box.minX + ((event.clientX - rect.left) / rect.width) * box.width
    const y = box.minY + ((event.clientY - rect.top) / rect.height) * box.height
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
  }
}

export class IndoorPlanPanel {
  private readonly store: EditorStore
  private readonly host: HTMLElement
  private readonly toast: (message: string) => void
  private readonly onSelect?: (selection: Selection) => void
  private readonly readOnly: boolean

  private root: HTMLDivElement | null = null
  private treeEl: HTMLDivElement | null = null
  private stageEl: HTMLDivElement | null = null
  private issuesEl: HTMLDivElement | null = null
  private state: PanelState = { buildingId: null, floorLevel: 0, mode: 'select', draft: [], selectedRoomId: null, dragging: null }
  private unsubscribe: (() => void) | null = null
  private svgEl: SVGSVGElement | null = null

  constructor(options: IndoorPlanPanelOptions) {
    this.store = options.store
    this.host = options.host
    this.toast = options.toast
    this.onSelect = options.onSelect
    this.readOnly = options.readOnly ?? false
  }

  mount(): void {
    if (this.root) return
    this.host.insertAdjacentHTML(
      'beforeend',
      `<section class="indoor-plan" id="indoor-plan">
         <header class="indoor-plan-head">
           <h2>室内平面</h2>
           <span class="indoor-plan-mode" id="indoor-plan-mode">选中</span>
         </header>
         <div class="indoor-plan-body">
           <div class="indoor-plan-tree" id="indoor-plan-tree"></div>
           <div class="indoor-plan-stage" id="indoor-plan-stage"></div>
         </div>
         <div class="indoor-plan-toolbar">
           <button class="tool mode active" data-plan-mode="select" id="plan-mode-select">选中</button>
           <button class="tool mode" data-plan-mode="draw" id="plan-mode-draw">新描房间</button>
           <button class="tool mode" data-plan-mode="vertex" id="plan-mode-vertex">拖点</button>
           <button class="tool" id="plan-add-room">新增房间</button>
           <button class="tool danger" id="plan-remove-room">删除房间</button>
           <button class="tool" id="plan-finish-draft" hidden>完成描点</button>
         </div>
         <div class="indoor-plan-issues" id="indoor-plan-issues"></div>
       </section>`,
    )

    this.root = this.host.querySelector<HTMLDivElement>('#indoor-plan')
    this.treeEl = this.host.querySelector<HTMLDivElement>('#indoor-plan-tree')
    this.stageEl = this.host.querySelector<HTMLDivElement>('#indoor-plan-stage')
    this.issuesEl = this.host.querySelector<HTMLDivElement>('#indoor-plan-issues')

    this.root?.querySelectorAll<HTMLButtonElement>('[data-plan-mode]').forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.planMode as PlanMode))
    })
    this.root?.querySelector<HTMLButtonElement>('#plan-add-room')?.addEventListener('click', () => this.handleAddRoom())
    this.root?.querySelector<HTMLButtonElement>('#plan-remove-room')?.addEventListener('click', () => this.handleRemoveRoom())
    this.root?.querySelector<HTMLButtonElement>('#plan-finish-draft')?.addEventListener('click', () => this.commitDraft())

    this.unsubscribe = this.store.subscribe(() => this.render())
    this.pickInitialSelection()
    this.render()
  }

  unmount(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.root?.remove()
    this.root = null
  }

  /** 主编辑器选中房间时，平面跟着跳过去 */
  focusRoom(selection: Extract<Selection, { kind: 'room' }>): void {
    this.state.buildingId = selection.buildingId
    this.state.floorLevel = selection.floorLevel
    this.state.selectedRoomId = selection.roomId
    this.render()
  }

  private pickInitialSelection(): void {
    const data = this.store.data
    const withFloors = data.buildings.find((building) => (building.floors?.length ?? 0) > 0)
    const first = withFloors ?? data.buildings[0]
    this.state.buildingId = first?.id ?? null
    this.state.floorLevel = first?.floors?.[0]?.level ?? 0
  }

  private setMode(mode: PlanMode): void {
    this.state.mode = mode
    if (mode !== 'draw') this.state.draft = []
    this.root?.querySelectorAll<HTMLButtonElement>('[data-plan-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.planMode === mode)
    })
    const label = this.root?.querySelector<HTMLSpanElement>('#indoor-plan-mode')
    if (label) label.textContent = mode === 'draw' ? '新描' : mode === 'vertex' ? '拖点' : '选中'
    const finish = this.root?.querySelector<HTMLButtonElement>('#plan-finish-draft')
    if (finish) finish.hidden = mode !== 'draw'
    this.render()
  }

  private currentBuilding() {
    const id = this.state.buildingId
    return id ? findBuilding(this.store.data, id) : undefined
  }

  private currentFloor(): CampusFloor | undefined {
    const id = this.state.buildingId
    return id ? findFloor(this.store.data, id, this.state.floorLevel) : undefined
  }

  private currentRef(): RoomRef | null {
    if (!this.state.buildingId || !this.state.selectedRoomId) return null
    return { buildingId: this.state.buildingId, floorLevel: this.state.floorLevel, roomId: this.state.selectedRoomId }
  }

  private update(description: string, fn: (data: CampusData) => void): void {
    if (this.readOnly) {
      this.toast('只读模式：编辑后端不可用，改动无法保存')
      return
    }
    this.store.mutate(description, fn)
  }

  private handleAddRoom(): void {
    const buildingId = this.state.buildingId
    if (!buildingId) {
      this.toast('先选一栋楼')
      return
    }
    if (!this.currentFloor()) {
      this.toast('这栋楼没有这一层')
      return
    }
    let created: RoomRef | null = null
    this.update('新增房间', (data) => {
      created = addRoom(data, buildingId, this.state.floorLevel)
    })
    if (created) {
      this.state.selectedRoomId = (created as RoomRef).roomId
      this.setMode('vertex')
      this.render()
    }
  }

  private handleRemoveRoom(): void {
    const ref = this.currentRef()
    if (!ref) {
      this.toast('先选中一个房间')
      return
    }
    const name = findRoom(this.store.data, ref)?.name ?? ref.roomId
    this.update(`删除房间 ${name}`, (data) => {
      removeRoom(data, ref)
    })
    this.state.selectedRoomId = null
    this.onSelect?.(null)
    this.render()
  }

  /** 双击画布加点；新描模式下累积 draft，完成时写入选中房间或新房间 */
  private handleStageClick(event: MouseEvent): void {
    if (this.state.mode !== 'draw' || !this.svgEl) return
    const geometry = this.geometry()
    if (!geometry) return
    const point = toWorld(this.svgEl, geometry.viewBox)(event)
    this.state.draft.push(point)
    this.render()
  }

  private commitDraft(): void {
    const ring = this.state.draft
    if (ring.length < 3) {
      this.toast('至少要 3 个点')
      return
    }
    const ref = this.currentRef()
    if (ref && findRoom(this.store.data, ref)) {
      const promoted = isValidRing(findRoom(this.store.data, ref)?.polygon)
      this.update(promoted ? '重描房间轮廓' : '给房间描轮廓', (data) => {
        if (promoted) setRoomPolygon(data, ref, ring)
        else promotePlaceholder(data, ref, ring)
      })
    } else {
      const buildingId = this.state.buildingId
      if (!buildingId) return
      let created: RoomRef | null = null
      this.update('新增房间（描点）', (data) => {
        created = addRoom(data, buildingId, this.state.floorLevel, { polygon: ring.map((p) => [...p] as [number, number]) })
      })
      if (created) this.state.selectedRoomId = (created as RoomRef).roomId
    }
    this.state.draft = []
    this.setMode('select')
  }

  private geometry(): PlanGeometry | null {
    const building = this.currentBuilding()
    if (!building) return null
    return floorPlan(building as never, this.state.floorLevel)
  }

  render(): void {
    if (!this.root || !this.treeEl || !this.stageEl) return
    this.renderTree()
    this.renderStage()
    this.renderIssues()
  }

  private renderTree(): void {
    if (!this.treeEl) return
    const data = this.store.data
    const parts: string[] = ['<ul class="plan-tree-buildings">']
    for (const building of data.buildings) {
      const floors = (building.floors ?? []) as unknown as CampusFloor[]
      const active = building.id === this.state.buildingId
      parts.push(
        `<li class="${active ? 'active' : ''}"><button class="plan-tree-building" data-building="${building.id}">${escapeHtml(
          building.name || building.id,
        )}<span class="plan-tree-count">${floors.length ? `${floors.length} 层` : '未建模'}</span></button>`,
      )
      if (active && floors.length) {
        parts.push('<ul class="plan-tree-floors">')
        for (const floor of floors) {
          const roomCount = (floor.rooms ?? []).length
          const described = (floor.rooms ?? []).filter((room) => isValidRing(room.polygon)).length
          parts.push(
            `<li class="${floor.level === this.state.floorLevel ? 'active' : ''}"><button class="plan-tree-floor" data-level="${floor.level}">${escapeHtml(
              floor.name || `${floor.level}F`,
            )}<span class="plan-tree-count">${described}/${roomCount} 已描</span></button>`,
          )
          if (floor.level === this.state.floorLevel) {
            parts.push('<ul class="plan-tree-rooms">')
            for (const room of floor.rooms ?? []) {
              const describedRoom = isValidRing(room.polygon)
              parts.push(
                `<li class="${room.id === this.state.selectedRoomId ? 'active' : ''}"><button class="plan-tree-room" data-room="${room.id}">${escapeHtml(
                  room.name || room.id,
                )}${describedRoom ? '' : '<span class="plan-pill">占位</span>'}</button></li>`,
              )
            }
            if ((floor.rooms ?? []).length === 0) parts.push('<li class="plan-empty">这一层还没有房间</li>')
            parts.push('</ul>')
          }
        }
        parts.push('</ul>')
      }
      parts.push('</li>')
    }
    parts.push('</ul>')
    this.treeEl.innerHTML = parts.join('')

    this.treeEl.querySelectorAll<HTMLButtonElement>('.plan-tree-building').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.buildingId = button.dataset.building ?? null
        const building = this.currentBuilding()
        this.state.floorLevel = ((building?.floors ?? []) as unknown as CampusFloor[])[0]?.level ?? 0
        this.state.selectedRoomId = null
        this.render()
      })
    })
    this.treeEl.querySelectorAll<HTMLButtonElement>('.plan-tree-floor').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.floorLevel = Number(button.dataset.level ?? 0)
        this.state.selectedRoomId = null
        this.render()
      })
    })
    this.treeEl.querySelectorAll<HTMLButtonElement>('.plan-tree-room').forEach((button) => {
      button.addEventListener('click', () => {
        const roomId = button.dataset.room ?? null
        this.state.selectedRoomId = roomId
        if (roomId && this.state.buildingId) {
          this.onSelect?.({ kind: 'room', buildingId: this.state.buildingId, floorLevel: this.state.floorLevel, roomId })
        }
        this.render()
      })
    })
  }

  private renderStage(): void {
    if (!this.stageEl) return
    const geometry = this.geometry()
    if (!geometry) {
      this.stageEl.innerHTML = '<div class="plan-empty">选一栋楼看平面</div>'
      this.svgEl = null
      return
    }
    const { viewBox } = geometry
    const svgEl = svg('svg', {
      viewBox: `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`,
      class: 'plan-svg',
      preserveAspectRatio: 'xMidYMid meet',
    })
    this.svgEl = svgEl

    if (geometry.outline.length > 0) {
      svgEl.append(
        svg('path', {
          d: ringToPath(geometry.outline),
          class: 'plan-outline',
          'fill-rule': 'evenodd',
        }),
      )
    } else {
      const text = svg('text', {
        x: String(viewBox.minX + viewBox.width / 2),
        y: String(viewBox.minY + viewBox.height / 2),
        class: 'plan-hint-text',
        'text-anchor': 'middle',
      })
      text.textContent = '这栋楼还没有楼板轮廓'
      svgEl.append(text)
    }

    for (const item of geometry.rooms) {
      const selected = item.room.id === this.state.selectedRoomId
      const path = svg('path', {
        d: ringToPath(item.ring),
        class: `plan-room${item.placeholder ? ' placeholder' : ''}${selected ? ' selected' : ''}`,
        'data-room': item.room.id,
      })
      path.addEventListener('click', (event) => {
        event.stopPropagation()
        this.state.selectedRoomId = item.room.id
        if (this.state.buildingId) {
          this.onSelect?.({ kind: 'room', buildingId: this.state.buildingId, floorLevel: this.state.floorLevel, roomId: item.room.id })
        }
        this.render()
      })
      svgEl.append(path)

      const [cx, cy] = ringCenter(item.ring)
      const label = svg('text', { x: String(cx), y: String(cy), class: 'plan-room-label', 'text-anchor': 'middle' })
      label.textContent = item.placeholder ? `${item.room.name}（占位）` : item.room.name
      svgEl.append(label)

      if (selected && this.state.mode === 'vertex' && !item.placeholder) {
        item.ring.forEach(([x, y], index) => {
          const handle = svg('circle', {
            cx: String(x),
            cy: String(y),
            r: String(Math.max(viewBox.width, viewBox.height) * 0.008),
            class: 'plan-vertex',
            'data-index': String(index),
          })
          handle.addEventListener('pointerdown', (event) => {
            event.stopPropagation()
            this.state.dragging = { index }
            const move = (moveEvent: PointerEvent) => {
              if (!this.state.dragging || !this.svgEl) return
              const point = toWorld(this.svgEl, viewBox)(moveEvent)
              const ref = this.currentRef()
              if (!ref) return
              this.store.mutateSilently('拖点', (data) => moveRoomVertex(data, ref, index, point))
              this.renderStage()
            }
            const up = () => {
              this.state.dragging = null
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          })
          svgEl.append(handle)
        })
      }
    }

    if (this.state.draft.length > 0) {
      const draftPath = svg('path', {
        d: `${ringToPath(this.state.draft)}`,
        class: 'plan-draft',
      })
      svgEl.append(draftPath)
      for (const [x, y] of this.state.draft) {
        svgEl.append(
          svg('circle', { cx: String(x), cy: String(y), r: String(Math.max(viewBox.width, viewBox.height) * 0.006), class: 'plan-draft-dot' }),
        )
      }
    }

    svgEl.addEventListener('click', (event) => this.handleStageClick(event as MouseEvent))
    this.stageEl.innerHTML = ''
    this.stageEl.append(svgEl)
  }

  private renderIssues(): void {
    if (!this.issuesEl) return
    const issues = validateRooms(this.store.data).filter((issue) => !issue.ref || issue.ref.buildingId === this.state.buildingId)
    if (issues.length === 0) {
      this.issuesEl.innerHTML = '<div class="plan-issue ok">这一栋楼的房间数据没有问题</div>'
      return
    }
    const errors = issues.filter((issue) => issue.level === 'error')
    const warnings = issues.filter((issue) => issue.level === 'warning')
    this.issuesEl.innerHTML = [
      `<div class="plan-issue-summary">${errors.length} 个错误 · ${warnings.length} 条提醒</div>`,
      ...issues.slice(0, 12).map((issue) => {
        const ref = issue.ref
        const attrs = ref ? ` data-room="${ref.roomId}" data-level="${ref.floorLevel}"` : ''
        return `<button class="plan-issue ${issue.level}"${attrs}>${escapeHtml(issue.message)}</button>`
      }),
    ].join('')
    this.issuesEl.querySelectorAll<HTMLButtonElement>('.plan-issue[data-room]').forEach((button) => {
      button.addEventListener('click', () => {
        const roomId = button.dataset.room
        if (!roomId) return
        this.state.floorLevel = Number(button.dataset.level ?? this.state.floorLevel)
        this.state.selectedRoomId = roomId
        if (this.state.buildingId) {
          this.onSelect?.({ kind: 'room', buildingId: this.state.buildingId, floorLevel: this.state.floorLevel, roomId })
        }
        this.render()
      })
    })
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 供外部给拖点续插顶点用（暂未接到 UI 双击边） */
export { insertRoomVertex, el }
