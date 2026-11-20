/* 站点导航（docs/ui-redesign-v3.md §2 StuDev 段）
   三入口并列：项目首页 / 3D 地图 / 地图编辑器。三个页面共用这一份入口表 ——
   `plan.html` 只是 Pages 上的独立页：不占三入口并列位，只在导航末尾挂一格
   `site-nav-aside` 出口，不进壳内、不进地图页主流程，也不挂「← 项目首页」这种孤立出口。
   原生壳（`?shell=1`）里不出现站点导航，见 site-nav.css 里的 data-shell 规则。 */

export type SiteNavKey = 'index' | 'demo' | 'editor'

export const SITE_NAV_ENTRIES: ReadonlyArray<{ key: SiteNavKey; href: string; label: string }> = [
  { key: 'index', href: './index.html', label: '项目首页' },
  { key: 'demo', href: './demo.html', label: '3D 地图' },
  { key: 'editor', href: './editor.html', label: '地图编辑器' },
]

/** 渲染站点导航；当前页带 `aria-current="page"`，键盘/读屏能读出「你在这」。 */
export function siteNavHtml(current: SiteNavKey): string {
  const links = SITE_NAV_ENTRIES.map(
    (entry) => `<a href="${entry.href}"${entry.key === current ? ' aria-current="page"' : ''}>${entry.label}</a>`,
  ).join('')
  return `<nav class="site-nav" aria-label="站点导航">${links}<a href="./plan.html" class="site-nav-aside">计划报告</a></nav>`
}
