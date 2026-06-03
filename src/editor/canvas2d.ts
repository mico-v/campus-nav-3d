import type { EditorStore } from './store.ts'
import type { LayerFlags } from './types.ts'
import { defaultLayerFlags } from './types.ts'

// Rendering and interaction are implemented in later tasks.
export class Canvas2D {
  private host: HTMLElement
  private store: EditorStore
  private layers: LayerFlags = defaultLayerFlags()

  constructor(host: HTMLElement, store: EditorStore) {
    this.host = host
    this.store = store
    void this.store
  }

  setLayers(flags: LayerFlags): void {
    this.layers = flags
    this.render()
  }

  fitToData(): void {
    this.render()
  }

  render(): void {
    void this.layers
    this.host.textContent = ''
  }

  // Implemented in the add/remove task.
  addEntityAtViewCenter(_type: string): void {}

  deleteSelected(): void {}
}
