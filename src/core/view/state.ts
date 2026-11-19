/**
 * 主应用共享的轻量视图状态：当前选中 + 图层开关。
 *
 * 刻意不 import Three.js、也不碰 DOM —— 3D 场景和后续 2D 平面视图订阅同一份状态，
 * 这是设计文档 7.2 里「共享 ViewState」的地基。选中项的类型由调用方给泛型，
 * 免得把 `PickedEntity`（依赖 three）拖进 core。
 */

export interface LayerVisibility {
  showBuildings: boolean
  showPaths: boolean
  showWater: boolean
  showFields: boolean
  showTrees: boolean
  showZones: boolean
  showPois: boolean
  showLabels: boolean
}

export type LayerKey = keyof LayerVisibility

export const defaultLayerVisibility: LayerVisibility = {
  showBuildings: true,
  showPaths: true,
  showWater: true,
  showFields: true,
  showTrees: true,
  showZones: true,
  showPois: true,
  showLabels: true,
}

type Listener = () => void

export class ViewState<S = unknown> {
  private _selected: S | null
  private _layers: LayerVisibility
  private readonly listeners = new Set<Listener>()

  constructor(selected: S | null = null, layers: Partial<LayerVisibility> = {}) {
    this._selected = selected
    this._layers = { ...defaultLayerVisibility, ...layers }
  }

  get selected(): S | null {
    return this._selected
  }

  get layers(): Readonly<LayerVisibility> {
    return this._layers
  }

  setSelected(selected: S | null): void {
    this._selected = selected
    this.notify()
  }

  /** 设成同一个值不通知订阅者；返回是否真的变了。 */
  setLayer(key: LayerKey, visible: boolean): boolean {
    if (this._layers[key] === visible) return false
    this._layers = { ...this._layers, [key]: visible }
    this.notify()
    return true
  }

  toggleLayer(key: LayerKey): boolean {
    return this.setLayer(key, !this._layers[key])
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
