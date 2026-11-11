type Theme = 'light' | 'dark'

const STORAGE_KEY = 'campusnav-theme'
const THEME_COLORS: Record<Theme, string> = { light: '#f7f9fa', dark: '#0d1417' }

const systemTheme = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const readStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLORS[theme]
}

const initThemeToggle = (): void => {
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle')
  const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

  applyTheme(readStoredTheme() ?? systemTheme())

  button?.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage may be unavailable in private mode */
    }
  })

  // Follow the OS only while the visitor has not chosen explicitly.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (readStoredTheme()) return
    applyTheme(event.matches ? 'dark' : 'light')
  })
}

const initYear = (): void => {
  const el = document.querySelector<HTMLElement>('#year')
  if (el) el.textContent = String(new Date().getFullYear())
}

const initPrintButton = (): void => {
  document.querySelector<HTMLButtonElement>('#print-btn')?.addEventListener('click', () => window.print())
}

const initTocSpy = (): void => {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]')]
  if (!links.length) return
  const sections = links
    .map((link) => document.querySelector<HTMLElement>(link.hash))
    .filter((el): el is HTMLElement => Boolean(el))
  if (!sections.length || typeof IntersectionObserver === 'undefined') return

  const setActive = (id: string): void => {
    for (const link of links) link.classList.toggle('active', link.hash === `#${id}`)
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    },
    { rootMargin: '-88px 0px -60% 0px', threshold: 0 },
  )

  for (const section of sections) observer.observe(section)
}

initThemeToggle()
initYear()
initPrintButton()
initTocSpy()
