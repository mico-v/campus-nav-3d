import type { CampusData } from '../data/campusData.ts'
import type { Selection } from './types.ts'

const UNDO_LIMIT = 100

function deepClone(data: CampusData): CampusData {
  return JSON.parse(JSON.stringify(data)) as CampusData
}

/**
 * Holds the editable working copy of the campus data plus selection, dirty flag,
 * and an undo/redo history of full snapshots. UI subscribes for change notifications.
 */
export class EditorStore {
  private _data: CampusData
  private _selection: Selection = null
  private _dirty = false
  private undoStack: CampusData[] = []
  private redoStack: CampusData[] = []
  private subscribers = new Set<() => void>()

  constructor(initial: CampusData) {
    this._data = deepClone(initial)
  }

  get data(): CampusData {
    return this._data
  }

  get selection(): Selection {
    return this._selection
  }

  get dirty(): boolean {
    return this._dirty
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  private notify(): void {
    for (const fn of this.subscribers) fn()
  }

  select(sel: Selection): void {
    this._selection = sel
    this.notify()
  }

  /** Apply a mutation: snapshot current state for undo, run `fn`, mark dirty, notify. */
  mutate(_label: string, fn: (data: CampusData) => void): void {
    this.undoStack.push(deepClone(this._data))
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = []
    fn(this._data)
    this._dirty = true
    this.notify()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(deepClone(this._data))
    this._data = prev
    this._dirty = true
    this.clampSelection()
    this.notify()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(deepClone(this._data))
    this._data = next
    this._dirty = true
    this.clampSelection()
    this.notify()
  }

  markSaved(): void {
    this._dirty = false
    this.notify()
  }

  replaceAll(data: CampusData): void {
    this._data = deepClone(data)
    this.undoStack = []
    this.redoStack = []
    this._selection = null
    this._dirty = false
    this.notify()
  }

  /** Drop a selection that points past the end of its collection after undo/redo. */
  private clampSelection(): void {
    const sel = this._selection
    if (!sel) return
    if (sel.kind === 'routePoint') {
      const route = this._data.routes[sel.routeIndex]
      if (!route || !route.points[sel.index]) this._selection = null
      return
    }
    const collection = this._data[`${sel.kind}s` as 'buildings'] as unknown[] | undefined
    if (!collection || !collection[sel.index]) this._selection = null
  }
}
