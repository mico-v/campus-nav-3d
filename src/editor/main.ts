import './editor.css'
import { createDefaultCampusData } from '../data/campusData.ts'
import { EditorStore } from './store.ts'
import { Canvas2D } from './canvas2d.ts'
import { FormPanel } from './form.ts'
import { loadCampus, saveCampus, ApiUnavailableError } from './api.ts'
import { defaultLayerFlags, type LayerFlags } from './types.ts'

const LAYER_LABELS: Array<{ key: keyof LayerFlags; label: string }> = [
  { key: 'buildings', label: '建筑' },
  { key: 'roads', label: '道路' },
  { key: 'zones', label: '区域' },
  { key: 'waters', label: '水体' },
  { key: 'fields', label: '操场' },
  { key: 'pois', label: 'POI' },
  { key: 'route', label: '路线' },
  { key: 'trees', label: '树木' },
]

const ADD_TYPES: Array<{ value: string; label: string }> = [
  { value: 'building', label: '建筑' },
  { value: 'road', label: '道路' },
  { value: 'zone', label: '区域' },
  { value: 'water', label: '水体' },
  { value: 'field', label: '操场' },
  { value: 'poi', label: 'POI' },
]

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('App root not found')

  let readOnly = false
  let data
  try {
    data = await loadCampus()
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      readOnly = true
      data = createDefaultCampusData()
    } else {
      throw error
    }
  }

  const store = new EditorStore(data)
  const layers = defaultLayerFlags()

  app.innerHTML = `
    <div class="editor-shell">
      ${readOnly ? '<div class="banner">只读模式：编辑后端不可用（请用 <code>npm run dev</code> 启动）。改动无法保存。</div>' : ''}
      <div class="toolbar">
        <h1>校园地图编辑器</h1>
        <div class="group">
          <button class="tool primary" id="btn-save"${readOnly ? ' disabled' : ''}>保存</button>
          <span class="dirty-dot" id="dirty-dot" title="未保存改动"></span>
        </div>
        <div class="group">
          <button class="tool" id="btn-undo" disabled>撤销</button>
          <button class="tool" id="btn-redo" disabled>重做</button>
        </div>
        <div class="group">
          <select id="add-type">
            ${ADD_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
          <button class="tool" id="btn-add">新增</button>
          <button class="tool danger" id="btn-delete" disabled>删除</button>
        </div>
        <div class="group layer-toggles" id="layer-toggles">
          ${LAYER_LABELS.map(
            (l) => `<label><input type="checkbox" data-layer="${l.key}" checked /> ${l.label}</label>`,
          ).join('')}
        </div>
        <div class="group">
          <a class="link" href="./index.html" target="_blank" rel="noopener">打开 3D 预览 ↗</a>
        </div>
      </div>
      <div class="workspace">
        <div class="canvas-host" id="canvas-host">
          <div class="canvas-hint">滚轮缩放 · 拖空白平移 · 点选对象 · 拖动/拖顶点编辑 · 双击边加点 · Delete 删点</div>
        </div>
        <div class="form-host" id="form-host"></div>
      </div>
      <div class="toast" id="toast"></div>
    </div>
  `

  const canvasHost = app.querySelector<HTMLDivElement>('#canvas-host')!
  const formHost = app.querySelector<HTMLDivElement>('#form-host')!
  const btnSave = app.querySelector<HTMLButtonElement>('#btn-save')!
  const btnUndo = app.querySelector<HTMLButtonElement>('#btn-undo')!
  const btnRedo = app.querySelector<HTMLButtonElement>('#btn-redo')!
  const btnAdd = app.querySelector<HTMLButtonElement>('#btn-add')!
  const btnDelete = app.querySelector<HTMLButtonElement>('#btn-delete')!
  const addType = app.querySelector<HTMLSelectElement>('#add-type')!
  const dirtyDot = app.querySelector<HTMLSpanElement>('#dirty-dot')!
  const toast = app.querySelector<HTMLDivElement>('#toast')!

  const canvas = new Canvas2D(canvasHost, store)
  const form = new FormPanel(formHost, store)
  canvas.setLayers(layers)
  canvas.fitToData()

  let toastTimer = 0
  function showToast(message: string, kind: 'ok' | 'err'): void {
    toast.textContent = message
    toast.className = `toast show ${kind}`
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.className = 'toast'
    }, 2600)
  }

  function refreshToolbar(): void {
    dirtyDot.classList.toggle('dirty', store.dirty)
    btnUndo.disabled = !store.canUndo
    btnRedo.disabled = !store.canRedo
    btnDelete.disabled = store.selection === null || readOnly
  }

  store.subscribe(() => {
    canvas.render()
    form.render()
    refreshToolbar()
  })

  // initial paint
  canvas.render()
  form.render()
  refreshToolbar()

  btnUndo.addEventListener('click', () => store.undo())
  btnRedo.addEventListener('click', () => store.redo())

  btnSave.addEventListener('click', async () => {
    if (readOnly) return
    btnSave.disabled = true
    try {
      const result = await saveCampus(store.data)
      store.markSaved()
      showToast(`已保存${result.backupPath ? '（已备份）' : ''}`, 'ok')
    } catch (error) {
      showToast(`保存失败：${(error as Error).message}`, 'err')
    } finally {
      btnSave.disabled = false
    }
  })

  btnAdd.addEventListener('click', () => {
    // wired up in the add/remove task
    canvas.addEntityAtViewCenter(addType.value)
  })

  btnDelete.addEventListener('click', () => {
    if (store.selection === null) return
    if (!window.confirm('确定删除选中的对象？')) return
    canvas.deleteSelected()
  })

  const toggles = app.querySelectorAll<HTMLInputElement>('#layer-toggles input[data-layer]')
  toggles.forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.layer as keyof LayerFlags
      layers[key] = input.checked
      canvas.setLayers({ ...layers })
    })
  })

  window.addEventListener('beforeunload', (event) => {
    if (store.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}

boot().catch((error) => {
  const app = document.querySelector('#app')
  if (app) app.textContent = `编辑器启动失败：${(error as Error).message}`
  console.error(error)
})
