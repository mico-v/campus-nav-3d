/**
 * 详情卡与搜索联想守卫（docs/design-overview-v2.md §6.3 / §6.4）。
 *
 * 渲染断言用 renderDetails 真跑一遍（node 环境里给个只带 innerHTML 的假容器即可），
 * 交互与样式断言读源码文本 —— 键盘焦点、aria 状态这类没有 DOM 就没法演。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultCampusData } from '../src/data/campusData'
import { DETAIL_BLOCKS, renderDetails } from '../src/ui/panel'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')
const css = read('src/style.css')
const mainTs = read('src/main.ts')

/** renderDetails 只写 innerHTML，给个最小替身就够了，不必起 jsdom。 */
const fakeContainer = (): HTMLElement => ({ innerHTML: '' } as unknown as HTMLElement)

const ruleFor = (selector: string): string => {
  const match = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(css)
  if (!match) throw new Error(`样式里没有这条规则：${selector}`)
  return match[0]
}

describe('详情卡四区块', () => {
  it('区块固定四块，顺序是概览 / 活动 / 提示 / 路线', () => {
    expect([...DETAIL_BLOCKS]).toEqual(['overview', 'activity', 'notice', 'route'])
  })

  it('选中建筑：出四块，概览默认展开，标题回给卡片头', () => {
    const data = createDefaultCampusData()
    const container = fakeContainer()
    const summary = renderDetails(data, { kind: 'building', index: 0 }, container)
    expect(summary?.name).toBe(data.buildings[0].name)
    expect(summary?.subtitle).toContain('建筑')
    const blocks = [...container.innerHTML.matchAll(/data-block="([a-z]+)"/g)].map((m) => m[1])
    expect(blocks).toEqual(['overview', 'activity', 'notice', 'route'])
    expect(container.innerHTML).toMatch(/data-block="overview" open/)
    // 占位块不许编数据：活动与路线明确写「暂无 / 待接入」
    expect(container.innerHTML).toContain('暂无活动')
    expect(container.innerHTML).toContain('路线规划待接入')
  })

  it('选中地标也走同一套四区块', () => {
    const data = createDefaultCampusData()
    const poi = data.pois[0]
    const container = fakeContainer()
    const summary = renderDetails(data, { kind: 'poi', id: poi.id }, container)
    expect(summary?.name).toBe(poi.name)
    expect(summary?.subtitle).toContain('地标')
    expect(container.innerHTML.match(/data-block=/g)).toHaveLength(4)
  })

  it('没选中返回 null，主程序据此收起卡片', () => {
    const container = fakeContainer()
    expect(renderDetails(createDefaultCampusData(), null, container)).toBeNull()
    expect(container.innerHTML).toContain('empty-state')
    expect(mainTs).toContain('detailCard.hidden = !summary ||')
  })

  it('名称里的尖括号会被转义，不会被当标签注进卡片', () => {
    const data = createDefaultCampusData()
    const evil = { ...data, buildings: [{ ...data.buildings[0], name: '<img src=x onerror=alert(1)>' }] }
    const container = fakeContainer()
    renderDetails(evil, { kind: 'building', index: 0 }, container)
    expect(container.innerHTML).not.toContain('<img src=x')
  })
})

describe('详情卡是浮在图上的一张卡', () => {
  it('绝对定位、宽 320px、不挤压地图', () => {
    const card = ruleFor('.detail-card')
    expect(card).toContain('position: absolute')
    expect(card).toContain('width: 320px')
    expect(card).toContain('right: var(--gap)')
    // hidden 必须真的不占位，否则空卡片会一直挂在图上
    expect(ruleFor('.detail-card[hidden]')).toContain('display: none')
  })

  it('有独立关闭按钮，Esc 也能收', () => {
    expect(mainTs).toContain('id="detail-close"')
    expect(css).toMatch(/\.dc-close\s*\{[^}]*min-height:\s*var\(--tap\)/)
    expect(mainTs).toContain("detailClose.addEventListener('click'")
    expect(mainTs).toMatch(/document\.activeElement === search[\s\S]{0,80}closeSearchResults\(\)[\s\S]{0,80}else if \(!detailCard\.hidden\)/)
  })
})

describe('搜索联想浮层', () => {
  it('输入即出、结果区声明 aria-expanded / aria-controls', () => {
    expect(mainTs).toContain('function renderSearchResults')
    expect(mainTs).toContain("searchResults.setAttribute('aria-expanded'")
    expect(mainTs).toContain("search.setAttribute('aria-controls', 'search-results')")
    expect(mainTs).toContain('role="option"')
  })

  it('↑↓ 走焦点、Enter 选中、失焦收起', () => {
    expect(mainTs).toContain("event.key === 'ArrowDown'")
    expect(mainTs).toContain("event.key === 'ArrowUp'")
    expect(mainTs).toContain("event.key === 'Enter' && searchIndex >= 0")
    expect(mainTs).toContain("search.addEventListener('blur'")
    expect(mainTs).toContain("'aria-activedescendant'")
  })

  it('高亮项有可见样式，不只靠 hover', () => {
    expect(css).toMatch(/\.search-result\.active\s*\{[^}]*var\(--primary-soft\)/)
    expect(css).toMatch(/\.search-result\.active\s*\{[^}]*outline/)
  })
})

describe('窄屏版式', () => {
  it('窄屏卡片铺满宽度、夹在顶栏与抽屉之间，抽屉拉满时先收起', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 959px)'))
    const cardRule = /\.detail-card\s*\{[^}]*\}/.exec(narrow)?.[0] ?? ''
    expect(cardRule).toContain('left: 8px')
    expect(cardRule).toContain('right: 8px')
    expect(cardRule).toContain('bottom: calc(var(--drawer-h)')
    expect(narrow).toMatch(/\.sidebar\[data-drawer='full'\]\s*~\s*\.detail-card\s*\{\s*display:\s*none/)
  })

  it('用户手动关掉的卡片不会被切图层之类的重绘弹回来', () => {
    expect(mainTs).toContain('dismissedDetail')
    expect(mainTs).toMatch(/dismissedDetail\s*=\s*selectionKey\(view\.selected\)/)
    // 重新选中对象要清掉「已关闭」记录，否则点同一栋楼没反应
    expect(mainTs).toMatch(/view\.setSelected\(entity\)\n\s*dismissedDetail = null/)
  })
})

describe('触屏点击区 ≥44px', () => {
  it('搜索结果与详情卡关闭按钮都吃到 --tap', () => {
    expect(ruleFor('.search-result')).toContain('min-height: var(--tap)')
    expect(ruleFor('.dc-close')).toContain('min-width: var(--tap)')
    expect(css).toMatch(/--tap:\s*44px/)
  })
})
