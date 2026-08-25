import './editor.css'
import { createDefaultCampusData, validateCampusData } from '../data/campusData.ts'
import { EditorStore } from './store.ts'
import { Canvas2D, type MapBackdropConfig, type BackdropAlign } from './canvas2d.ts'
import { FormPanel } from './form.ts'
import { loadCampus, saveCampus, ApiUnavailableError } from './api.ts'
import { defaultLayerFlags, type LayerFlags, DEFAULT_GRID_SETTINGS, type EditorMode, type Selection } from './types.ts'
import { CampusScene } from '../scene/CampusScene.ts'
import { translatePoints } from './geometry.ts'
import { moveRoadNode } from '../data/roadNetwork.ts'
import { editorSearchResults, selectionForValidationError } from './search.ts'

const ALIGN_KEY = 'campus-editor:backdrop-align'

function loadBackdropAlign(): BackdropAlign | null {
  try {
    const raw = localStorage.getItem(ALIGN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.offsetX === 'number' && typeof v?.offsetZ === 'number' && typeof v?.scale === 'number') {
      return { offsetX: v.offsetX, offsetZ: v.offsetZ, scale: v.scale }
    }
    return null
  } catch {
    return null
  }
}

function saveBackdropAlign(a: BackdropAlign): void {
  try {
    localStorage.setItem(ALIGN_KEY, JSON.stringify(a))
  } catch {
    // ignore (private mode / quota) — 对齐是辅助功能，存不了不致命
  }
}

const LAYER_LABELS: Array<{ key: keyof LayerFlags; label: string }> = [
  { key: 'buildings', label: '建筑' },
  { key: 'roads', label: '道路' },
  { key: 'zones', label: '区域' },
  { key: 'waters', label: '水体' },
  { key: 'fields', label: '操场' },
  { key: 'pois', label: 'POI' },
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

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
  // 本地固定底图：./export.png，不请求网络图源；比例固定，不随数据 bounds 变化。
  const mapBackdrop: MapBackdropConfig = {
    enabled: true,
    provider: 'local-file',
    imageUrl: './export.png',
  }

  app.innerHTML = `
    <div class="editor-shell">
      ${readOnly ? '<div class="banner">只读模式：编辑后端不可用（请用 <code>npm run dev</code> 启动）。改动无法保存。</div>' : ''}
      <div class="toolbar">
        <h1>校园地图编辑器</h1>
        <div class="group">
          <button class="tool" id="btn-validate" title="检查全部数据；错误会显示在右下角并可点击定位">校验</button>
          <button class="tool primary" id="btn-save"${readOnly ? ' disabled' : ''}>保存</button>
          <button class="tool" id="btn-export">导出 JSON</button>
          <button class="tool" id="btn-road-help" title="了解可编辑道路与自动路网的关系">道路说明</button>
          <span class="dirty-dot" id="dirty-dot" title="未保存改动"></span>
        </div>
        <div class="group structure-search-group">
          <label class="search-label" for="structure-search">快速查找</label>
          <input id="structure-search" type="search" placeholder="道路名 / ID / 建筑 / 场地" autocomplete="off" />
          <div class="structure-search-results" id="structure-search-results" hidden></div>
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
          <button class="tool danger" id="btn-delete-vertex" disabled title="删除当前选中的顶点/节点（也可按 Delete）">删除选中点</button>
        </div>
        <div class="group layer-toggles" id="layer-toggles">
          ${LAYER_LABELS.map(
            (l) => `<label><input type="checkbox" data-layer="${l.key}" checked /> ${l.label}</label>`,
          ).join('')}
        </div>
        <div class="group">
          <label class="lock-toggle"><input type="checkbox" id="backdrop-lock" checked /> 底图锁定</label>
          <label class="scale-control">底图缩放 <input type="range" id="backdrop-scale" min="0.5" max="2" step="0.01" value="1" /></label>
          <button class="tool" id="btn-building-transparent" type="button">建筑透明</button>
        </div>
        <div class="group mode-tools" id="mode-tools">
          <button class="tool mode active" data-mode="select">选择</button>
          <button class="tool mode" data-mode="pan">平移</button>
          <button class="tool mode" data-mode="add-road">加道路/节点</button>
          <button class="tool mode" data-mode="reshape">重塑</button>
          <button class="tool mode" data-mode="split-merge" title="只选择道路或路网节点，再使用右侧拆分/合并命令">道路拓扑选择</button>
          <button class="tool" id="btn-split-road" title="将选中道路从中间节点拆成两条">拆分选中道路</button>
          <button class="tool" id="btn-merge-road" title="把选中道路与相邻端点道路合并">合并相邻道路</button>
          <button class="tool" id="btn-merge-node" title="把选中道路节点与附近节点合并">合并相邻节点</button>
          <button class="tool mode" data-mode="area" title="穿过建筑和道路，优先选择底层区域、水体或场地">区域优先选择</button>
        </div>
        <div class="group precision-tools">
          <label class="lock-toggle"><input type="checkbox" id="grid-visible" checked /> 网格</label>
          <label class="scale-control">间距 <input id="grid-spacing" type="number" min="1" step="1" value="${DEFAULT_GRID_SETTINGS.spacing}" /></label>
          <label class="lock-toggle"><input type="checkbox" id="grid-snap" checked /> 吸附</label>
          <label class="lock-toggle"><input type="checkbox" id="angle-snap" checked /> 角度</label>
        </div>
        <div class="group view-tools">
          <button class="tool view active" data-view="2d">2D 编辑</button>
          <button class="tool view" data-view="3d">3D 检查</button>
          <button class="tool" id="btn-focus">聚焦选中</button>
          <button class="tool" id="btn-topdown">顶视图</button>
          <label class="lock-toggle"><input type="checkbox" id="three-edit" /> 3D 地面编辑</label>
        </div>
      </div>
      <div class="workspace">
        <div class="canvas-host" id="canvas-host">
          <div class="canvas-hint">滚轮缩放 · 拖空白平移 · 点选对象或顶点 · 拖动编辑 · 双击边加点 · Delete/「删除选中点」删除建模顶点</div>
        </div>
        <div class="scene-host" id="scene-host" hidden>
          <div class="scene-hint">左键拖动选中对象 · 右键/中键平移 · 拖动编辑与相机轨道已分离</div>
        </div>
        <div class="form-host" id="form-host"></div>
      </div>
      <div class="toast" id="toast"></div>
      <div class="validation-output" id="validation-output" hidden></div>
      <div class="road-help" id="road-help" hidden>
        <button type="button" class="road-help-close" id="road-help-close" aria-label="关闭">×</button>
        <h2>道路是如何工作的</h2>
        <ol>
          <li><code>roads</code> 是你直接编辑和保存的道路中心线；每条道路由 ID、可选名称、节点坐标、宽度和通行属性组成。</li>
          <li><code>roadNetwork</code> 是系统根据道路中心线自动生成的导航拓扑。交叉处会自动切分成路段和路口节点，无需手工维护。</li>
          <li>移动、拆分或合并道路后，编辑器会立即重建路网；保存前校验会检查中心线、宽度、节点引用和拓扑一致性。</li>
          <li>定位问题：输入名称或 ID 快速查找；校验失败后点击右下角的具体错误，可直接选中相关道路或节点。</li>
        </ol>
      </div>
      <div class="status-bar" id="status-bar">选择模式 · 网格 10 · 吸附优先：节点/交叉点/锚点 → 网格</div>
    </div>
  `

  const canvasHost = app.querySelector<HTMLDivElement>('#canvas-host')!
  const formHost = app.querySelector<HTMLDivElement>('#form-host')!
  const btnSave = app.querySelector<HTMLButtonElement>('#btn-save')!
  const btnExport = app.querySelector<HTMLButtonElement>('#btn-export')!
  const btnValidate = app.querySelector<HTMLButtonElement>('#btn-validate')!
  const btnUndo = app.querySelector<HTMLButtonElement>('#btn-undo')!
  const btnRedo = app.querySelector<HTMLButtonElement>('#btn-redo')!
  const btnAdd = app.querySelector<HTMLButtonElement>('#btn-add')!
  const btnDelete = app.querySelector<HTMLButtonElement>('#btn-delete')!
  const btnDeleteVertex = app.querySelector<HTMLButtonElement>('#btn-delete-vertex')!
  const addType = app.querySelector<HTMLSelectElement>('#add-type')!
  const dirtyDot = app.querySelector<HTMLSpanElement>('#dirty-dot')!
  const toast = app.querySelector<HTMLDivElement>('#toast')!
  const validationOutput = app.querySelector<HTMLDivElement>('#validation-output')!
  const structureSearch = app.querySelector<HTMLInputElement>('#structure-search')!
  const structureSearchResults = app.querySelector<HTMLDivElement>('#structure-search-results')!
  const btnRoadHelp = app.querySelector<HTMLButtonElement>('#btn-road-help')!
  const roadHelp = app.querySelector<HTMLDivElement>('#road-help')!
  const roadHelpClose = app.querySelector<HTMLButtonElement>('#road-help-close')!
  const backdropLock = app.querySelector<HTMLInputElement>('#backdrop-lock')!
  const backdropScale = app.querySelector<HTMLInputElement>('#backdrop-scale')!
  const btnBuildingTransparent = app.querySelector<HTMLButtonElement>('#btn-building-transparent')!
  const angleSnap = app.querySelector<HTMLInputElement>('#angle-snap')!
  const gridVisible = app.querySelector<HTMLInputElement>('#grid-visible')!
  const gridSnap = app.querySelector<HTMLInputElement>('#grid-snap')!
  const gridSpacing = app.querySelector<HTMLInputElement>('#grid-spacing')!
  const statusBar = app.querySelector<HTMLDivElement>('#status-bar')!
  const sceneHost = app.querySelector<HTMLDivElement>('#scene-host')!
  const btnFocus = app.querySelector<HTMLButtonElement>('#btn-focus')!
  const btnTopdown = app.querySelector<HTMLButtonElement>('#btn-topdown')!
  const threeEdit = app.querySelector<HTMLInputElement>('#three-edit')!
  const btnSplitRoad = app.querySelector<HTMLButtonElement>('#btn-split-road')!
  const btnMergeRoad = app.querySelector<HTMLButtonElement>('#btn-merge-road')!
  const btnMergeNode = app.querySelector<HTMLButtonElement>('#btn-merge-node')!

  const canvas = new Canvas2D(canvasHost, store)
  const scene3d = new CampusScene(sceneHost, sceneHost)
  if (import.meta.env.DEV) {
    const debugWindow = window as Window & {
      __editorRenderMetrics?: () => ReturnType<CampusScene['getRenderMetrics']>
      __editorRender?: () => void
      __editorResetMetrics?: () => void
      __editor2dRenderMetrics?: () => ReturnType<Canvas2D['getRenderMetrics']>
      __editor2dRender?: () => void
    }
    debugWindow.__editorRenderMetrics = () => scene3d.getRenderMetrics()
    debugWindow.__editorRender = () => scene3d.render(performance.now() / 1000)
    debugWindow.__editorResetMetrics = () => scene3d.resetRenderMetrics()
    debugWindow.__editor2dRenderMetrics = () => canvas.getRenderMetrics()
    debugWindow.__editor2dRender = () => canvas.render()
  }
  scene3d.setDisplayOptions({})
  scene3d.setDataAndEditorSelection(store.data, store.selection)
  canvas.setMapBackdrop(mapBackdrop)
  const savedAlign = loadBackdropAlign()
  if (savedAlign) {
    canvas.setBackdropAlign(savedAlign)
    backdropScale.value = String(savedAlign.scale)
  }
  canvas.onBackdropAlignChange = (a) => saveBackdropAlign(a)
  const form = new FormPanel(formHost, store)
  canvas.setLayers(layers)
  canvas.fitToData()

  backdropLock.addEventListener('change', () => {
    canvas.setBackdropLocked(backdropLock.checked)
  })
  backdropScale.addEventListener('input', () => {
    canvas.setBackdropScale(Number(backdropScale.value))
  })
  btnBuildingTransparent.addEventListener('click', () => {
    const transparent = !canvas.getBuildingsTransparent()
    canvas.setBuildingsTransparent(transparent)
    btnBuildingTransparent.classList.toggle('active', transparent)
    btnBuildingTransparent.setAttribute('aria-pressed', String(transparent))
    btnBuildingTransparent.title = transparent ? '恢复建筑填充颜色' : '降低建筑填充透明度，便于查看底图和点位'
    btnBuildingTransparent.textContent = transparent ? '建筑不透明' : '建筑透明'
  })

  const modeButtons = app.querySelectorAll<HTMLButtonElement>('[data-mode]')
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.mode as EditorMode
    canvas.setMode(mode)
    modeButtons.forEach((candidate) => candidate.classList.toggle('active', candidate === button))
    statusBar.textContent = `${button.textContent}模式 · 网格 ${canvas.getGridSettings().spacing} · 吸附优先：节点/交叉点/锚点 → 网格`
    showToast(button.title || `已切换到${button.textContent}模式`, 'ok')
  }))
  const updateGrid = () => {
    canvas.setGridSettings({ visible: gridVisible.checked, snap: gridSnap.checked, angleSnap: angleSnap.checked, spacing: Number(gridSpacing.value) || 10 })
    statusBar.textContent = `${canvas.getMode()} · 网格 ${Number(gridSpacing.value) || 10} · ${gridSnap.checked ? '吸附开启' : '自由编辑'}`
  }
  ;[gridVisible, gridSnap, angleSnap, gridSpacing].forEach((control) => control.addEventListener('input', updateGrid))
  ;[gridVisible, gridSnap, angleSnap].forEach((control) => control.addEventListener('change', updateGrid))

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
    btnDelete.disabled = store.selection === null || store.selection?.kind === 'road-node' || readOnly
    btnDeleteVertex.disabled = !canvas.canDeleteActiveVertex || readOnly
    const roadSelected = store.selection?.kind === 'road'
    btnSplitRoad.disabled = !roadSelected || readOnly
    btnMergeRoad.disabled = !roadSelected || readOnly
    btnMergeNode.disabled = store.selection?.kind !== 'road-node' || readOnly
  }

  btnRoadHelp.addEventListener('click', () => { roadHelp.hidden = false })
  roadHelpClose.addEventListener('click', () => { roadHelp.hidden = true })

  let activeView: '2d' | '3d' = '2d'
  let threeRenderScheduled = false
  const request3dRender = (): void => {
    if (activeView !== '3d' || threeRenderScheduled) return
    threeRenderScheduled = true
    window.requestAnimationFrame((time) => {
      threeRenderScheduled = false
      scene3d.render(time / 1000)
    })
  }
  scene3d.controls.addEventListener('change', request3dRender)
  let sceneDataRevision = -1
  let sceneSelectionKey = ''
  let sceneSyncScheduled = false
  let threeDragBefore: typeof store.data | null = null
  let threeDragOrigin: [number, number] | null = null
  const snapGround = (value: number): number => {
    const settings = canvas.getGridSettings()
    return settings.snap ? Math.round(value / settings.spacing) * settings.spacing : value
  }
  const applyThreeGroundEdit = (point: [number, number], phase: 'start' | 'move' | 'end', selection: Selection): void => {
    if (phase === 'start') {
      threeDragBefore = JSON.parse(JSON.stringify(store.data)) as typeof store.data
      threeDragOrigin = [point[0], point[1]]
      scene3d.beginEditorPreview(selection)
    }
    if (!threeDragOrigin || !threeDragBefore || !selection) return
    const dx = snapGround(point[0]) - snapGround(threeDragOrigin[0])
    const dz = snapGround(point[1]) - snapGround(threeDragOrigin[1])
    const data = store.data
    if (selection.kind === 'building') {
      const item = data.buildings[selection.index]
      const before = threeDragBefore.buildings[selection.index]
      if (item && before) {
        item.position = [before.position[0] + dx, before.position[1] + dz]
        if (before.footprint) item.footprint = translatePoints(before.footprint, dx, dz)
      }
    } else if (selection.kind === 'poi') {
      const item = data.pois[selection.index]
      const before = threeDragBefore.pois[selection.index]
      if (item && before && !item.sourceBuildingId) item.position = [before.position[0] + dx, before.position[1], before.position[2] + dz]
    } else if (selection.kind === 'road') {
      const item = data.roads[selection.index]
      const before = threeDragBefore.roads[selection.index]
      if (item && before) item.points = before.points.map(([x, z]) => [x + dx, z + dz])
    } else if (selection.kind === 'road-node') {
      const beforeNode = threeDragBefore.roadNetwork?.nodes.find((node) => node.id === selection.id)
      if (beforeNode && data.roadNetwork) moveRoadNode(data.roads, data.roadNetwork, selection.id, [beforeNode.position[0] + dx, beforeNode.position[1] + dz], 1)
    }
    store.notifyChange()
    scene3d.previewEditorTranslation(selection, dx, dz)
    if (phase === 'end') {
      store.recordUndo(threeDragBefore)
      scene3d.commitEditorPreview()
      sceneDataRevision = store.revision
      sceneSelectionKey = selectionKey(store.selection)
      threeDragBefore = null
      threeDragOrigin = null
    }
  }
  scene3d.onGroundEdit = applyThreeGroundEdit
  scene3d.onSelectionChange = (selection) => store.select(selection)
  scene3d.setEditorEditMode(false)

  const selectionKey = (selection: Selection): string => {
    if (!selection) return 'none'
    return selection.kind === 'road-node' ? `${selection.kind}:${selection.id}` : `${selection.kind}:${selection.index}`
  }
  const syncScene = (): void => {
    if (sceneHost.hidden) return
    if (threeDragBefore) return
    const nextSelectionKey = selectionKey(store.selection)
    if (sceneDataRevision !== store.revision) {
      scene3d.setDataAndEditorSelection(store.data, store.selection)
      sceneDataRevision = store.revision
      sceneSelectionKey = nextSelectionKey
    } else if (sceneSelectionKey !== nextSelectionKey) {
      scene3d.setEditorSelection(store.selection)
      sceneSelectionKey = nextSelectionKey
    }
  }
  const requestSceneSync = (): void => {
    if (sceneHost.hidden || sceneSyncScheduled) return
    sceneSyncScheduled = true
    const run = () => {
      sceneSyncScheduled = false
      syncScene()
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run)
    else run()
  }

  const setView = (view: '2d' | '3d'): void => {
    activeView = view
    canvasHost.hidden = view !== '2d'
    sceneHost.hidden = view !== '3d'
    app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view))
    modeButtons.forEach((button) => { button.disabled = view === '3d' })
    backdropLock.disabled = view === '3d'
    backdropScale.disabled = view === '3d'
    btnBuildingTransparent.disabled = view === '3d'
    if (view === '3d') {
      // 2D 期间数据可能已被就地修改，切回 3D 时强制重建一次场景。
      syncScene()
      scene3d.resize()
      if (store.selection) scene3d.focusSelection()
      else scene3d.setOverviewCamera()
      request3dRender()
    }
    statusBar.textContent = view === '3d' ? '3D 检查 · 拖拽旋转 · 滚轮缩放 · 右键平移 · 可点击选择对象' : `${canvas.getMode()} · 2D 几何编辑`
  }
  app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view as '2d' | '3d')))
  btnFocus.addEventListener('click', () => {
    if (!store.selection) {
      if (activeView === '3d') scene3d.setOverviewCamera()
      else canvas.fitToData()
      showToast('未选择对象，已适应全图', 'ok')
    } else if (activeView === '3d') scene3d.focusSelection()
    else canvas.focusSelection()
    request3dRender()
  })
  let topDown = false
  btnTopdown.addEventListener('click', () => {
    setView('3d')
    topDown = !topDown
    scene3d.setTopDown(topDown)
    btnTopdown.classList.toggle('active', topDown)
    btnTopdown.textContent = topDown ? '退出顶视图' : '顶视图'
    request3dRender()
  })
  threeEdit.addEventListener('change', () => {
    if (threeEdit.checked) setView('3d')
    scene3d.setEditorEditMode(threeEdit.checked)
    showToast(threeEdit.checked ? '3D 地面编辑已开启：拖动选中对象进行平移' : '3D 地面编辑已关闭', 'ok')
  })
  btnSplitRoad.addEventListener('click', () => {
    if (!canvas.splitSelectedRoad()) showToast('请选择包含内部节点的道路后再拆分', 'err')
    else showToast('道路已拆分，请检查两个新道路对象', 'ok')
  })
  btnMergeRoad.addEventListener('click', () => {
    if (!canvas.mergeSelectedRoadWithNearest()) showToast('未找到可合并的相邻道路', 'err')
  })
  btnMergeNode.addEventListener('click', () => {
    if (!canvas.mergeSelectedRoadNodeWithNearest()) showToast('未找到可合并的相邻节点', 'err')
  })

  const renderStructureSearch = (): void => {
    const results = editorSearchResults(store.data, structureSearch.value)
    structureSearchResults.innerHTML = results.map((result, index) => `<button type="button" class="structure-search-result" data-result-index="${index}"><strong>${escapeHtml(result.label)}</strong><small>${escapeHtml(result.meta)}</small></button>`).join('')
    structureSearchResults.hidden = results.length === 0
  }
  structureSearch.addEventListener('input', renderStructureSearch)
  structureSearchResults.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-result-index]')
    if (!button) return
    const result = editorSearchResults(store.data, structureSearch.value)[Number(button.dataset.resultIndex)]
    if (!result?.selection) return
    store.select(result.selection)
    structureSearch.value = result.label
    structureSearchResults.hidden = true
    if (activeView === '3d') scene3d.focusSelection(result.selection)
    else canvas.focusSelection(result.selection)
    showToast(`已定位：${result.label}`, 'ok')
  })
  structureSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { structureSearch.value = ''; structureSearchResults.hidden = true }
  })


  store.subscribe(() => {
    canvas.requestRender()
    form.render()
    // 3D 重建开销大：仅在该视图可见时同步，隐藏期间的改动在切换视图时补齐。
    requestSceneSync()
    request3dRender()
    refreshToolbar()
  })

  // initial paint
  canvas.render()
  form.render()
  scene3d.resize()
  scene3d.render(0)
  refreshToolbar()

  btnUndo.addEventListener('click', () => store.undo())
  btnRedo.addEventListener('click', () => store.redo())

  const showValidationErrors = (errors: string[]): void => {
    validationOutput.hidden = errors.length === 0
    validationOutput.innerHTML = errors.length === 0 ? '' : `<strong>校验失败（${errors.length} 项）</strong><ul>${errors.map((error, index) => `<li><button type="button" data-error-index="${index}">${escapeHtml(error)}</button></li>`).join('')}</ul>`
  }
  validationOutput.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-error-index]')
    if (!button) return
    const errors = validateCampusData(store.data)
    const selection = selectionForValidationError(store.data, errors[Number(button.dataset.errorIndex)] ?? '')
    if (!selection) { showToast('该错误暂时无法自动定位，请使用快速查找', 'err'); return }
    store.select(selection)
    if (activeView === '3d') scene3d.focusSelection(selection)
    showToast('已定位到相关结构', 'ok')
  })

  const validateBeforeSave = (): boolean => {
    const errors = validateCampusData(store.data)
    showValidationErrors(errors)
    if (errors.length) {
      showToast(`校验失败：${errors.length} 项，点击下方错误可定位`, 'err')
      return false
    }
    showToast('数据校验通过', 'ok')
    return true
  }
  btnValidate.addEventListener('click', validateBeforeSave)

  btnExport.addEventListener('click', () => {
    if (!validateBeforeSave()) return
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'campus.json'
    link.click()
    URL.revokeObjectURL(url)
    showToast('已导出 campus.json', 'ok')
  })

  btnSave.addEventListener('click', async () => {
    if (readOnly || !validateBeforeSave()) return
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

  btnDeleteVertex.addEventListener('click', () => {
    if (!canvas.hasActiveVertex) showToast('请先点击选中一个顶点/节点', 'err')
    else if (!canvas.deleteActiveVertex()) showToast('当前几何至少需要保留 2 个道路节点或 3 个多边形顶点', 'err')
  })

  const toggles = app.querySelectorAll<HTMLInputElement>('#layer-toggles input[data-layer]')
  toggles.forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.layer as keyof LayerFlags
      layers[key] = input.checked
      canvas.setLayers({ ...layers })
      scene3d.setDisplayOptions({
        showBuildings: layers.buildings,
        showPaths: layers.roads,
        showZones: layers.zones,
        showWater: layers.waters,
        showFields: layers.fields,
        showPois: layers.pois,
        showTrees: layers.trees,
      })
      request3dRender()
    })
  })

  window.addEventListener('resize', () => {
    if (activeView === '3d') { scene3d.resize(); request3dRender() }
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
