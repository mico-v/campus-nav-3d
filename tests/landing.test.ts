import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (file: string): string => readFileSync(resolve(root, file), 'utf8')

const landing = read('index.html')
const plan = read('plan.html')
const demo = read('demo.html')

describe('落地页结构', () => {
  it('首页承载项目介绍，而不是直接挂地图', () => {
    expect(landing).toContain('CampusNav 3D')
    expect(landing).toContain('大学生创新创业训练计划')
    expect(landing).not.toContain('/src/main.ts')
  })

  it('主要区块与锚点齐全', () => {
    for (const id of ['why', 'capability', 'ai', 'stack', 'shipped', 'roadmap']) {
      expect(landing).toContain(`id="${id}"`)
      expect(landing).toContain(`href="#${id}"`)
    }
  })

  it('AI 与社区区块盖住三个方向与四条原则', () => {
    for (const keyword of ['AI 情境推荐', 'XR 场景互动发现', '校园社区共建']) {
      expect(landing).toContain(keyword)
    }
    expect((landing.match(/class="ai"/g) ?? []).length).toBe(3)
    expect((landing.match(/class="rec"/g) ?? []).length).toBeGreaterThanOrEqual(3)
    for (const principle of ['端侧优先', '可解释', '匿名聚合', '人来把关']) {
      expect(landing).toContain(principle)
    }
    expect(landing).toContain('class="rec-src"')
  })

  it('三个核心能力都在页面上', () => {
    expect(landing).toContain('室内分层建模')
    expect(landing).toContain('课程与活动地图')
    expect(landing).toContain('VR / 沉浸导航')
    expect((landing.match(/class="cap"/g) ?? []).length).toBe(3)
  })

  it('指向原型、编辑器与计划报告', () => {
    for (const target of ['./demo.html', './editor.html', './plan.html']) {
      expect(landing).toContain(`href="${target}"`)
    }
  })

  it('路线图排到六个阶段，AI 与社区有独立阶段', () => {
    expect((landing.match(/class="phase"/g) ?? []).length).toBe(6)
    expect(landing).toContain('AI 推荐与社区共建')
  })

  it('带上首屏主题脚本与样式表，避免闪白', () => {
    expect(landing).toContain('campusnav-theme')
    expect(landing).toContain('href="./src/landing/landing.css"')
    expect(landing).toContain('name="theme-color"')
  })
})

describe('计划报告', () => {
  const sections = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12']

  it('十二个章节与目录一一对应', () => {
    for (const id of sections) {
      expect(plan).toContain(`id="${id}"`)
      expect(plan).toContain(`href="#${id}"`)
    }
  })

  it('覆盖立项所需的要点', () => {
    for (const keyword of ['立项背景', '研究内容', '技术路线', '创新点', '进度安排', '预期成果', '经费预算', '风险与应对', '数据与合规']) {
      expect(plan).toContain(keyword)
    }
  })

  it('AI 与社区在报告里落到研究内容、技术路线与阶段', () => {
    for (const keyword of ['情境推荐', '现场发现', '地点级社区内容', '智能层', '阶段六', 'AI 处理边界']) {
      expect(plan).toContain(keyword)
    }
    expect((plan.match(/<tr><td>阶段[一二三四五六]</g) ?? []).length).toBe(6)
  })

  it('公开页面不写个人联系方式', () => {
    for (const page of [landing, plan]) {
      expect(page).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
      expect(page).not.toMatch(/1[3-9]\d{9}/)
      expect(page).not.toMatch(/QQ\s*\d{5,}/)
    }
  })
})

describe('原型入口', () => {
  it('保留 3D 地图入口并加回首页的出口', () => {
    expect(demo).toContain('/src/main.ts')
    expect(demo).toContain('href="./index.html"')
  })

  it('每个 HTML 入口都存在', () => {
    for (const page of ['index.html', 'plan.html', 'demo.html', 'editor.html']) {
      expect(existsSync(resolve(root, page))).toBe(true)
    }
  })

  it('Vite 多页入口覆盖四个页面', () => {
    const config = read('vite.config.ts')
    for (const page of ['index.html', 'demo.html', 'plan.html', 'editor.html']) {
      expect(config).toContain(page)
    }
  })
})
