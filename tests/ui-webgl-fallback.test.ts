// @vitest-environment node
/**
 * WebGL 兜底守卫（docs/design-overview-v2.md §6.5）。
 *
 * 壳里白屏之所以难查，就是因为什么信息都没有。这里钉三件事：
 * ① 探不到 WebGL 要返回人能读的原因，不能静默；② 兜底页要把原因 / 地址 / UA 写出来
 * （并且转义，别把 URL 里的尖括号当标签注入）；③ 主程序必须在建渲染器之前探。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagnosticsText, mountWebglFallback, probeWebgl, webglFallbackHtml } from '../src/ui/webgl-fallback'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const mainTs = read('src/main.ts')
const css = read('src/style.css')

type ContextMode = 'ok' | 'null' | 'throw'

/** 最小假 document：只要能 createElement('canvas') 且 getContext 按剧本返回。 */
function fakeDoc(behavior: Record<string, ContextMode>): Document {
  const canvas = {
    getContext(name: string): unknown {
      const mode = behavior[name] ?? 'null'
      if (mode === 'throw') throw new Error(`${name} 抛了`)
      return mode === 'ok' ? { name } : null
    },
  }
  return {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`只该建 canvas，实际建了 ${tag}`)
      return canvas
    },
  } as unknown as Document
}

const info = {
  reason: '示例原因',
  url: 'https://map.mioc.cc/demo.html?shell=1',
  userAgent: 'Mozilla/5.0 (Linux; Android 14) WebView',
  time: '2026-11-19T09:30:00.000Z',
}

describe('WebGL 探测', () => {
  it('有 webgl2 就用 webgl2', () => {
    const probe = probeWebgl(fakeDoc({ webgl2: 'ok' }))
    expect(probe.ok).toBe(true)
    expect(probe.context).toBe('webgl2')
    expect(probe.reason).toBe('')
  })

  it('webgl2 抛错但 webgl 能用时，降级不算失败', () => {
    const probe = probeWebgl(fakeDoc({ webgl2: 'throw', webgl: 'ok' }))
    expect(probe.ok).toBe(true)
    expect(probe.context).toBe('webgl')
  })

  it('全都没有时 ok=false，且原因里点名每个上下文', () => {
    const probe = probeWebgl(fakeDoc({}))
    expect(probe.ok).toBe(false)
    expect(probe.reason).toContain('拿不到 WebGL 上下文')
    expect(probe.reason).toContain('webgl2 返回 null')
    expect(probe.reason).toContain('experimental-webgl 返回 null')
  })

  it('异常也写进原因，不能吞掉', () => {
    const probe = probeWebgl(fakeDoc({ webgl2: 'throw', webgl: 'throw', 'experimental-webgl': 'throw' }))
    expect(probe.ok).toBe(false)
    expect(probe.reason).toContain('webgl2 抛错：webgl2 抛了')
  })

  it('连 canvas 都建不出来时也给原因', () => {
    const doc = { createElement: () => { throw new Error('no canvas') } } as unknown as Document
    const probe = probeWebgl(doc)
    expect(probe.ok).toBe(false)
    expect(probe.reason).toContain('no canvas')
  })
})

describe('兜底页内容', () => {
  it('四类信息都写出来：原因 / 地址 / 浏览器 / 时间', () => {
    const html = webglFallbackHtml(info)
    expect(html).toContain('class="webgl-fallback"')
    expect(html).toContain(info.reason)
    expect(html).toContain(info.url)
    expect(html).toContain('Android 14')
    expect(html).toContain(info.time)
    // 壳里也能用：复制按钮 + 回首页出口（壳内由 CSS 藏掉）
    expect(html).toContain('data-copy-diagnostics')
    expect(html).toContain('class="wf-link"')
  })

  it('role=alert，读屏也会念出来', () => {
    const html = webglFallbackHtml(info)
    expect(html).toContain('role="alert"')
    expect(html).toContain('3D 地图没能启动')
  })

  it('地址与 UA 会被转义，不会被当标签注入', () => {
    const html = webglFallbackHtml({ ...info, url: 'https://x/?q=<img src=x onerror=alert(1)>', userAgent: '<script>bad()</script>' })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>bad()')
    expect(html).toContain('&lt;img src=x')
  })

  it('复制的纯文本与页面列表同源', () => {
    const text = diagnosticsText(info)
    expect(text.split('\n')).toHaveLength(4)
    expect(text).toContain(`地址：${info.url}`)
    expect(text).toContain(`时间：${info.time}`)
  })

  it('挂载后 #app 里就是兜底页，白屏不再留空', () => {
    const host = { innerHTML: '', querySelector: () => null } as unknown as HTMLElement
    mountWebglFallback(host, info)
    expect(host.innerHTML).toContain('class="webgl-fallback"')
    expect(host.innerHTML).toContain(info.reason)
  })
})

describe('主程序接线', () => {
  it('探 WebGL 在建 CampusScene 之前，探测失败就挂兜底', () => {
    const probeAt = mainTs.indexOf('probeWebgl(document)')
    const sceneAt = mainTs.indexOf('new CampusScene(')
    expect(probeAt).toBeGreaterThan(-1)
    expect(sceneAt).toBeGreaterThan(-1)
    expect(probeAt).toBeLessThan(sceneAt)
    expect(mainTs).toMatch(/if \(!webgl\.ok\) \{\s*mountWebglFallback\(app, \{ reason: webgl\.reason/)
  })

  it('渲染器创建抛错也走同一张兜底页', () => {
    expect(mainTs).toContain('function createScene')
    expect(mainTs).toMatch(/catch \(error\) \{\s*mountWebglFallback\(app, \{\s*reason: `WebGL 渲染器创建失败/)
    expect(mainTs).toContain('const campus = createScene(sceneHost, labelLayer)')
  })

  it('兜底页把地址带上查询串——壳内是 demo.html?shell=1，用路径猜不出来', () => {
    expect(mainTs).toMatch(/url: window\.location\.href/)
    expect(mainTs).toMatch(/userAgent: navigator\.userAgent/)
  })
})

describe('兜底页样式', () => {
  const ruleFor = (selector: string): string => {
    const match = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(css)
    if (!match) throw new Error(`样式里没有这条规则：${selector}`)
    return match[0]
  }

  it('铺满视口、盖在地图上面，颜色只走令牌', () => {
    const rule = ruleFor('.webgl-fallback')
    expect(rule).toContain('position: absolute')
    expect(rule).toContain('inset: 0')
    expect(rule).toContain('background: var(--bg)')
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('小屏也能滚、让开刘海，复制按钮吃到 44px', () => {
    expect(ruleFor('.webgl-fallback')).toContain('overflow: auto')
    expect(ruleFor('.webgl-fallback')).toContain('env(safe-area-inset-bottom')
    expect(ruleFor('.wf-copy')).toContain('min-height: var(--tap)')
  })

  it('壳里不出现「回项目首页」的出口', () => {
    expect(css).toMatch(/html\[data-shell='1'\] \.wf-link \{\s*display: none;/)
  })
})
