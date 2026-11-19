/** 壳里搜索会带 ?q= 进来（见 Android SearchUrlPolicy），首屏要能读出来预填搜索框。 */
export function readSearchQuery(search: string, key = 'q'): string {
  if (!search) return ''
  const normalized = search.startsWith('?') ? search : `?${search}`
  return (new URLSearchParams(normalized).get(key) ?? '').trim()
}
