import type { EditorStore } from './store.ts'

// The full attribute form is implemented in a later task.
export class FormPanel {
  private host: HTMLElement
  private store: EditorStore

  constructor(host: HTMLElement, store: EditorStore) {
    this.host = host
    this.store = store
  }

  render(): void {
    const sel = this.store.selection
    if (!sel) {
      this.host.innerHTML = '<p class="empty-hint">未选择对象</p>'
    }
  }
}
