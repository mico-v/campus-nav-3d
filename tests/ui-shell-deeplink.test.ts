// @vitest-environment happy-dom
/**
 * 壳内搜索深链守卫：?q= 不能只是「把字填进输入框」，必须真跑一次搜索。
 *
 * 原生壳把 ?q=图书馆 塞进 URL 后，如果只有 URL 变了没有重载，页面里的
 * 深链处理就永远不会执行，结果容器一直为空。这里用 happy-dom 的真 DOM
 * 复刻 main.ts 的 ?q= 分支：输入事件触发 renderSearchResults，断言结果区
 * 从空变成非空，顺带守住空串 / 纯空格不触发搜索。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultCampusData } from '../src/data/campusData'
import { searchEntities, escapeHtml } from '../src/ui/panel'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const deepLinkSource = read('src/main.ts').slice(read('src/main.ts').indexOf('const initialQuery ='))

/** 与 src/main.ts 中 renderSearchResults 的实现保持一致，用来验证输入事件链是否真跑。 */
function renderSearchResults(search: HTMLInputElement, searchResults: HTMLDivElement): void {
  const data = createDefaultCampusData()
  const results = searchEntities(data, search.value).slice(0, 8)
  searchResults.innerHTML = results.map((item, index) => `<button type="button" role="option" aria-selected="false" id="search-option-${index}" class="search-result" data-kind="${item.kind}" ${item.kind === 'building' ? `data-index="${item.index}"` : `data-id="${escapeHtml(item.id)}"`}><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)}</small></button>`).join('')
  searchResults.setAttribute('aria-expanded', String(results.length > 0))
  search.setAttribute('aria-controls', 'search-results')
  search.removeAttribute('aria-activedescendant')
}

interface ShellSetup {
  search: HTMLInputElement
  searchResults: HTMLDivElement
  runDeepLink: (url: string) => void
}

/** 起一个最小壳：真 input + 真 input 监听 + 真结果容器，跑 main.ts 里那一段深链逻辑。 */
function setupShell(): ShellSetup {
  document.body.innerHTML = `
    <input id="entity-search" type="search" />
    <div id="search-results" role="listbox" aria-live="polite"></div>
  `
  const search = document.querySelector<HTMLInputElement>('#entity-search')!
  const searchResults = document.querySelector<HTMLDivElement>('#search-results')!
  search.addEventListener('input', () => {
    renderSearchResults(search, searchResults)
  })

  // 这段就是 src/main.ts 里 ?q= 深链那几行，测试里照搬执行，避免「只断言源码文本」。
  const runDeepLink = (url: string) => {
    const initialQuery = new URLSearchParams(new URL(url, 'https://example.com/demo.html').search).get('q')?.trim()
    if (initialQuery) {
      search.value = initialQuery
      search.dispatchEvent(new Event('input'))
    }
  }
  return { search, searchResults, runDeepLink }
}

describe('壳内搜索深链 ?q=', () => {
  it('main.ts 的深链分支仍是「填入搜索框 + 派发 input」这一条', () => {
    expect(deepLinkSource).toContain("new URLSearchParams(window.location.search).get('q')?.trim()")
    expect(deepLinkSource).toMatch(/search\.value = initialQuery\s*\n\s*search\.dispatchEvent\(new Event\('input'\)\)/)
  })

  it('?q=图书馆：搜索框被填入，结果容器从空变非空（搜索真的跑了一次）', () => {
    const { search, searchResults, runDeepLink } = setupShell()
    expect(searchResults.querySelectorAll('.search-result')).toHaveLength(0)

    runDeepLink('demo.html?q=%E5%9B%BE%E4%B9%A6%E9%A6%86')

    expect(search.value).toBe('图书馆')
    const items = searchResults.querySelectorAll('.search-result')
    expect(items.length).toBeGreaterThan(0)
    expect([...items].some((item) => item.textContent?.includes('图书馆'))).toBe(true)
    expect(searchResults.getAttribute('aria-expanded')).toBe('true')
  })

  it('?q= 与无 q：搜索框保持空，不触发搜索', () => {
    for (const url of ['demo.html?q=', 'demo.html']) {
      const { search, searchResults, runDeepLink } = setupShell()
      runDeepLink(url)
      expect(search.value, url).toBe('')
      expect(searchResults.querySelectorAll('.search-result'), url).toHaveLength(0)
      expect(searchResults.innerHTML, url).toBe('')
      expect(searchResults.hasAttribute('aria-expanded'), url).toBe(false)
    }
  })

  it('?q=%20%20（纯空格）：trim 后视为空，不触发搜索', () => {
    const { search, searchResults, runDeepLink } = setupShell()
    runDeepLink('demo.html?q=%20%20')
    expect(search.value).toBe('')
    expect(searchResults.querySelectorAll('.search-result')).toHaveLength(0)
    expect(searchResults.innerHTML).toBe('')
    expect(searchResults.hasAttribute('aria-expanded')).toBe(false)
  })
})
