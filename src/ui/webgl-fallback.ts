/**
 * WebGL 兜底（docs/design-overview-v2.md §6.5）。
 *
 * 壳里最难查的一类问题是「页面白屏」：没有报错、也没有任何可贴回来的信息。
 * 所以在建渲染器之前先探一次 WebGL，拿不到就把原因、地址、UA、时间摆在页面上，
 * 让人能直接截图或复制回来，而不是对着白屏猜。
 *
 * 探测本身只是「试建一个离屏 canvas 拿上下文」，不碰场景；
 * 真正建 Three.js 渲染器时仍可能抛（比如上下文数量到上限），那条由主程序兜住。
 */
import { escapeHtml } from './panel'

export type WebglContextName = 'webgl2' | 'webgl' | 'experimental-webgl'

export interface WebglProbe {
  ok: boolean
  /** 人能读的一句话失败原因；ok 时为空串 */
  reason: string
  /** 拿到的上下文名；失败时为空串 */
  context: '' | WebglContextName
}

const CONTEXT_NAMES: readonly WebglContextName[] = ['webgl2', 'webgl', 'experimental-webgl']

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** 试建离屏 canvas 拿 WebGL 上下文。按 webgl2 → webgl → experimental-webgl 依次降级。 */
export function probeWebgl(doc: Document): WebglProbe {
  let canvas: HTMLCanvasElement
  try {
    canvas = doc.createElement('canvas')
  } catch (error) {
    return { ok: false, reason: `连 canvas 都建不出来：${describeError(error)}`, context: '' }
  }
  const problems: string[] = []
  for (const name of CONTEXT_NAMES) {
    try {
      if (canvas.getContext(name)) return { ok: true, reason: '', context: name }
      problems.push(`${name} 返回 null`)
    } catch (error) {
      // 有些 WebView 收到 webgl2 会直接抛而不是返回 null，这也要记下来
      problems.push(`${name} 抛错：${describeError(error)}`)
    }
  }
  return { ok: false, reason: `拿不到 WebGL 上下文（${problems.join('；')}）`, context: '' }
}

export interface FallbackInfo {
  /** 探测或渲染器创建失败的原因 */
  reason: string
  /** 出问题的页面地址，带查询串才有用（壳内是 demo.html?shell=1） */
  url: string
  userAgent: string
  /** ISO 时间；不传就取当前时间 */
  time?: string
}

/** 纯文本版诊断信息：复制按钮和「选中复制」都走这一份，格式跟页面上的列表一致。 */
export function diagnosticsText(info: FallbackInfo): string {
  const time = info.time ?? new Date().toISOString()
  return [
    `原因：${info.reason}`,
    `地址：${info.url}`,
    `浏览器：${info.userAgent}`,
    `时间：${time}`,
  ].join('\n')
}

export function webglFallbackHtml(info: FallbackInfo): string {
  const time = info.time ?? new Date().toISOString()
  return `<section class="webgl-fallback" role="alert" aria-live="assertive">
  <h1>3D 地图没能启动</h1>
  <p class="wf-reason">原因：<code>${escapeHtml(info.reason)}</code></p>
  <p class="wf-hint">这台设备或这个 WebView 没给到 WebGL（三维渲染）能力。常见是壳里关着硬件加速、WebView 版本太老，或者省电模式把 GPU 关掉了。地图数据本身没问题——下面这段信息贴给开发者就能直接定位。</p>
  <dl class="wf-meta">
    <dt>地址</dt><dd><code>${escapeHtml(info.url)}</code></dd>
    <dt>浏览器</dt><dd><code>${escapeHtml(info.userAgent)}</code></dd>
    <dt>时间</dt><dd><code>${escapeHtml(time)}</code></dd>
  </dl>
  <div class="wf-actions">
    <button type="button" class="wf-copy" data-copy-diagnostics>复制诊断信息</button>
    <a class="wf-link" href="./index.html">回项目首页</a>
  </div>
</section>`
}

/** 把兜底页塞进 #app，并给「复制诊断信息」接上剪贴板（壳里没有剪贴板就退回选中文本）。 */
export function mountWebglFallback(host: HTMLElement, info: FallbackInfo): void {
  host.innerHTML = webglFallbackHtml(info)
  const button = host.querySelector<HTMLButtonElement>('[data-copy-diagnostics]')
  if (!button) return
  const text = diagnosticsText(info)
  button.addEventListener('click', () => {
    const clipboard = navigator.clipboard
    if (!clipboard?.writeText) {
      button.textContent = '请手动选中上面的诊断信息'
      return
    }
    clipboard.writeText(text)
      .then(() => { button.textContent = '已复制' })
      .catch(() => { button.textContent = '复制失败，请手动选中' })
  })
}
