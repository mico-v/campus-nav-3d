export type SheetState = 'peek' | 'half' | 'full'

export const SHEET_STATES: SheetState[] = ['peek', 'half', 'full']

export const SHEET_NEXT_STATE: Record<SheetState, SheetState> = {
  peek: 'half',
  half: 'full',
  full: 'peek',
}

const DRAG_THRESHOLD = 24
const SNAP_THRESHOLD_PX = 80

export function createSheet(
  root: HTMLElement,
  options: { onStateChange?: (state: SheetState) => void } = {},
): { destroy: () => void } {
  if (root.dataset.sheet !== 'half') root.dataset.sheet = 'half'

  let dragStartY: number | null = null
  let dragStartState: SheetState = root.dataset.sheet as SheetState
  let suppressClick = false

  const setState = (state: SheetState): void => {
    root.dataset.sheet = state
    root.style.removeProperty('--sheet-drag')
    options.onStateChange?.(state)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    dragStartY = event.clientY
    dragStartState = root.dataset.sheet as SheetState
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (dragStartY === null) return
    const delta = event.clientY - dragStartY
    if (Math.abs(delta) > DRAG_THRESHOLD) suppressClick = true
    root.style.setProperty('--sheet-drag', `${Math.round(delta)}px`)
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (dragStartY === null) return
    const delta = event.clientY - dragStartY
    dragStartY = null
    root.style.removeProperty('--sheet-drag')
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture(event.pointerId)
    if (Math.abs(delta) < DRAG_THRESHOLD) return
    const index = SHEET_STATES.indexOf(dragStartState)
    const nextIndex = Math.max(0, Math.min(SHEET_STATES.length - 1, index + (delta < 0 ? 1 : -1)))
    setState(SHEET_STATES[nextIndex])
  }

  const onHandleClick = (): void => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    setState(SHEET_NEXT_STATE[root.dataset.sheet as SheetState])
  }

  const handle = root.querySelector<HTMLElement>('.sheet-handle')
  handle?.addEventListener('pointerdown', onPointerDown)
  handle?.addEventListener('click', onHandleClick)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)

  return {
    destroy: () => {
      handle?.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      handle?.removeEventListener('click', onHandleClick)
    },
  }
}

export function sheetHeightRatio(state: SheetState, viewportHeight: number, styles: CSSStyleDeclaration = getComputedStyle(document.documentElement)): number {
  const token = styles.getPropertyValue(`--sheet-${state}`).trim()
  const ratio = Number.parseFloat(token)
  const pixels = token.endsWith('vh') ? viewportHeight * ratio / 100 : ratio
  return pixels / viewportHeight
}

export function snapAfterDrag(state: SheetState, deltaY: number, dragThreshold = DRAG_THRESHOLD, snapThreshold = SNAP_THRESHOLD_PX): SheetState {
  if (Math.abs(deltaY) < dragThreshold) return state
  if (Math.abs(deltaY) >= snapThreshold) {
    const index = SHEET_STATES.indexOf(state)
    const nextIndex = Math.max(0, Math.min(SHEET_STATES.length - 1, index + (deltaY < 0 ? 1 : -1)))
    return SHEET_STATES[nextIndex]
  }
  return state
}
