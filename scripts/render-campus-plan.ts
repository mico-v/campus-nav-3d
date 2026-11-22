/**
 * Render the campus pack as a self-contained SVG plan for side-by-side review
 * against the official guide map. Read-only on packs/**; pure string output.
 *
 * Coordinate convention: the world uses the x/z plane. SVG's second axis is y,
 * and north must stay up, so world +z (south) maps to SVG +y:
 *   sx = (x - minX) * scale + marginLeft
 *   sy = (z - minZ) * scale + marginTop
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Point = [number, number]

export interface Building {
  id: string
  name: string
  footprint: Point[]
  position: Point
  zoneId: string
  category?: string
}

export interface Zone {
  id: string
  name: string
  polygon: Point[]
  center?: Point
  size?: Point
  color?: string
}

export interface RoadNode {
  id: string
  position: Point
  kind?: string
}

export interface RoadSegment {
  id: string
  from: string
  to: string
  centerline: Point[]
  class?: string
  width?: number
}

export interface RoadPath {
  id: string
  points: Point[]
  width?: number
  kind?: string
}

export interface CampusPlanData {
  buildings: Building[]
  zones: Zone[]
  roads: RoadPath[]
  roadNetwork: { nodes: RoadNode[]; edges: RoadSegment[]; segments?: RoadSegment[] }
  pois?: unknown[]
  places?: unknown[]
}

export interface Bounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export interface Transform {
  scale: number
  offsetX: number
  offsetZ: number
}

export interface LabelBox { x: number; y: number; w: number; h: number }

export interface PlanLayout {
  svgWidth: number
  svgHeight: number
  marginLeft: number
  marginTop: number
  bounds: Bounds
  transform: Transform
  legendTop: number
}

export interface LabelPlacement {
  x: number
  y: number
  box?: LabelBox
  placed: boolean
}

const ZONE_ORDER = [
  'osm-campus-boundary',
  'west-academic',
  'south-campus',
  'central-core',
  'east-campus',
  'west-campus',
  'sports-belt',
] as const

const ZONE_COLORS: Record<string, string> = {
  'osm-campus-boundary': '#eef7dd',
  'west-academic': '#bfdbfe',
  'south-campus': '#c4b5fd',
  'central-core': '#fde68a',
  'east-campus': '#a7f3d0',
  'west-campus': '#fecdd3',
  'sports-belt': '#bbf7d0',
}

const LABEL_FONT = 11
const PLOT_HEIGHT = 900
const MIN_SVG_WIDTH = 1600
const MARGIN = 48
const LEGEND_HEIGHT = 540

// ---------- pure geometry / layout helpers (directly unit-tested) ----------

export function computeBounds(data: CampusPlanData): Bounds {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const points: Point[] = []
  for (const zone of data.zones) points.push(...zone.polygon)
  for (const b of data.buildings) points.push(...b.footprint)
  for (const road of data.roads) points.push(...road.points)
  for (const node of data.roadNetwork.nodes) points.push(node.position)
  for (const seg of roadSegments(data)) points.push(...seg.centerline)
  for (const p of points) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    minX = Math.min(minX, p[0])
    minZ = Math.min(minZ, p[1])
    maxX = Math.max(maxX, p[0])
    maxZ = Math.max(maxZ, p[1])
  }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 }
  return { minX, minZ, maxX, maxZ }
}

export function roadSegments(data: CampusPlanData): RoadSegment[] {
  const network = data.roadNetwork ?? ({} as CampusPlanData['roadNetwork'])
  if (Array.isArray(network.segments) && network.segments.length) return network.segments
  return Array.isArray(network.edges) ? network.edges : []
}

export function createTransform(bounds: Bounds, layout: Pick<PlanLayout, 'svgWidth' | 'marginLeft' | 'marginTop'>): Transform {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1)
  const usableWidth = Math.max(layout.svgWidth - layout.marginLeft * 2, 1)
  const scale = Math.min(usableWidth / spanX, PLOT_HEIGHT / spanZ)
  return {
    scale,
    offsetX: layout.marginLeft + (usableWidth - spanX * scale) / 2 - bounds.minX * scale,
    offsetZ: layout.marginTop - bounds.minZ * scale,
  }
}

/** World (x, z) -> SVG (x, y). z is the second plane axis; +z goes down (south). */
export function worldToSvg(point: Point, transform: Transform): Point {
  return [point[0] * transform.scale + transform.offsetX, point[1] * transform.scale + transform.offsetZ]
}

export function makeLayout(data: CampusPlanData): PlanLayout {
  const bounds = computeBounds(data)
  const spanX = Math.max(bounds.maxX - bounds.minX, 1)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1)
  const svgWidth = Math.max(MIN_SVG_WIDTH, Math.ceil(MARGIN * 2 + spanX * (PLOT_HEIGHT / spanZ)))
  const transform = createTransform(bounds, { svgWidth, marginLeft: MARGIN, marginTop: MARGIN })
  return {
    svgWidth,
    svgHeight: MARGIN + PLOT_HEIGHT + MARGIN + LEGEND_HEIGHT,
    marginLeft: MARGIN,
    marginTop: MARGIN,
    bounds,
    transform,
    legendTop: MARGIN + PLOT_HEIGHT + MARGIN,
  }
}

/** SVG y grows down; the world's north is -z, so the north arrow points up. */
export function northArrow(lineLength = 42): string {
  const top = 12
  return [
    `<line x1="0" y1="${top + lineLength}" x2="0" y2="${top}" stroke="#111827" stroke-width="2"/>`,
    `<path d="M 0 ${top - 6} L -5 ${top + 7} L 0 ${top + 3} L 5 ${top + 7} Z" fill="#111827"/>`,
    '<text x="0" y="6" text-anchor="middle" font-size="12" font-weight="bold" fill="#111827">N</text>',
  ].join('')
}

export interface ScaleSegment { x: number; label: string }

export function scaleBar(scale: number, barWidth = 160): { segments: ScaleSegment[]; pixelsPerSegment: number } {
  const pixelsPerSegment = 100 * scale
  const count = Math.max(1, Math.round(barWidth / pixelsPerSegment))
  const segments: ScaleSegment[] = []
  for (let i = 0; i < count; i++) segments.push({ x: i * pixelsPerSegment, label: i === 0 ? '0' : i === count - 1 ? `${i * 100} m` : `${i * 100}` })
  return { segments, pixelsPerSegment }
}

/** Estimate text width; CJK glyphs count as one full-width character. */
export function estimateTextWidth(text: string, fontSize = LABEL_FONT): number {
  let units = 0
  for (const ch of text) units += /[^\x00-\xff]/.test(ch) ? 1 : 0.55
  return units * fontSize
}

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Greedy label placement: try offsets around the anchor; keep the first free box. */
export function avoidLabels(anchors: Point[], labels: string[], occupied: LabelBox[] = [], padding = 2): LabelPlacement[] {
  const offsets: Point[] = [
    [0, -8], [0, 14], [12, 3], [-12, 3],
    [12, -10], [-12, -10], [12, 16], [-12, 16],
    [24, 0], [-24, 0], [0, -22], [0, 28],
  ]
  const boxes: LabelBox[] = [...occupied]
  return anchors.map((anchor, i) => {
    const text = labels[i] ?? ''
    const w = Math.max(14, estimateTextWidth(text))
    const h = LABEL_FONT + 4
    for (const [dx, dy] of offsets) {
      const box: LabelBox = { x: anchor[0] + dx - w / 2, y: anchor[1] + dy - h / 2, w, h }
      const candidate: LabelBox = { x: box.x - padding, y: box.y - padding, w: box.w + padding * 2, h: box.h + padding * 2 }
      if (boxes.some((b) => boxesOverlap(candidate, b))) continue
      boxes.push(candidate)
      return { x: anchor[0] + dx, y: anchor[1] + dy, box, placed: true }
    }
    return { x: anchor[0], y: anchor[1] - 8, placed: false }
  })
}

// ---------- SVG assembly ----------

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const polygon = (pts: Point[], transform: Transform) => pts.map((p) => { const [x, y] = worldToSvg(p, transform); return `${fmt(x)},${fmt(y)}` }).join(' ')

function zoneOrder(data: CampusPlanData): Zone[] {
  const byId = (id: string) => data.zones.find((z) => z.id === id)
  const ordered = ZONE_ORDER.map(byId).filter((z): z is Zone => Boolean(z))
  const seen = new Set(ordered.map((z) => z.id))
  return [...ordered, ...data.zones.filter((z) => !seen.has(z.id))]
}

export function renderCampusPlan(data: CampusPlanData, commitSha: string): string {
  const layout = makeLayout(data)
  const { transform, svgWidth, svgHeight, legendTop } = layout
  const out: string[] = []
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="Arial, sans-serif">`)
  out.push(`<!-- Generated by scripts/render-campus-plan.ts; source pack data @ ${esc(commitSha)} (packs/usts-tianping/campus.json). -->`)
  out.push(`<!-- World x/z -> SVG x/y: z maps to y (north up). Bounds from data; no bounds field read. -->`)
  out.push(`<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff"/>`)
  out.push(`<title>USTS Tianping campus plan — data audit (${esc(commitSha)})</title>`)
  out.push(`<desc>75 buildings, ${data.zones.length} zones and the full road network, rendered from packs/usts-tianping/campus.json for cross-checking against the official guide map.</desc>`)

  // zones first, boundary last on top but unfilled
  const zones = zoneOrder(data)
  for (const zone of zones) {
    if (!zone.polygon?.length) continue
    const isBoundary = zone.id === 'osm-campus-boundary'
    const fill = isBoundary ? 'none' : (zone.color ?? ZONE_COLORS[zone.id] ?? '#f3f4f6')
    out.push(`<polygon points="${polygon(zone.polygon, transform)}" fill="${fill}" stroke="${isBoundary ? '#374151' : '#9ca3af'}" stroke-width="${isBoundary ? 2 : 1}" ${isBoundary ? 'stroke-dasharray="8 4"' : ''}/>`)
  }
  // zone labels
  for (const zone of zones) {
    const center = zone.center ?? zone.polygon?.[0]
    if (!center) continue
    const [x, y] = worldToSvg(center, transform)
    out.push(`<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" font-size="12" font-weight="bold" fill="#1f2937" opacity="0.85" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(zone.id)}</text>`)
  }

  // roads: segments (full network incl. s2 feeder links), then legacy paths
  for (const seg of roadSegments(data)) {
    if (!seg.centerline || seg.centerline.length < 2) continue
    const d = seg.centerline.map((p, i) => { const [x, y] = worldToSvg(p, transform); return `${i ? 'L' : 'M'} ${fmt(x)} ${fmt(y)}` }).join(' ')
    const cls = seg.class ?? 'road'
    const color = cls === 'main' ? '#dc2626' : cls === 'secondary' ? '#ea580c' : '#6b7280'
    const width = Math.max(1.2, (seg.width ?? 3.2) * transform.scale)
    out.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${fmt(width + 2)}" stroke-linecap="round"/>`)
    out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(width)}" stroke-linecap="round"/>`)
  }
  for (const road of data.roads ?? []) {
    if (!road.points || road.points.length < 2) continue
    const d = road.points.map((p, i) => { const [x, y] = worldToSvg(p, transform); return `${i ? 'L' : 'M'} ${fmt(x)} ${fmt(y)}` }).join(' ')
    out.push(`<path d="${d}" fill="none" stroke="#9ca3af" stroke-width="${fmt(Math.max(1, (road.width ?? 3.2) * transform.scale))}" stroke-dasharray="4 3" opacity="0.6"/>`)
  }
  // nodes
  for (const node of data.roadNetwork?.nodes ?? []) {
    const [x, y] = worldToSvg(node.position, transform)
    const junction = node.kind === 'junction'
    out.push(junction
      ? `<rect x="${fmt(x - 2.5)}" y="${fmt(y - 2.5)}" width="5" height="5" fill="#1d4ed8"/>`
      : `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="1.8" fill="#3b82f6"/>`)
  }

  // buildings + labels
  const buildings = data.buildings ?? []
  const anchors: Point[] = []
  const labels: string[] = []
  const centroid = (pts: Point[]): Point => {
    if (!pts?.length) return [0, 0]
    const sx = pts.reduce((a, p) => a + p[0], 0)
    const sz = pts.reduce((a, p) => a + p[1], 0)
    return [sx / pts.length, sz / pts.length]
  }
  for (const b of buildings) {
    const pts = Array.isArray(b.footprint) && b.footprint.length >= 3 ? b.footprint : null
    if (pts) {
      out.push(`<polygon points="${polygon(pts, transform)}" fill="#f8fafc" stroke="#111827" stroke-width="1.2"/>`)
      const [x, y] = worldToSvg(centroid(pts), transform)
      anchors.push([x, y])
    } else {
      const [x, y] = worldToSvg(b.position, transform)
      out.push(`<rect x="${fmt(x - 4)}" y="${fmt(y - 4)}" width="8" height="8" fill="#f8fafc" stroke="#111827" stroke-width="1.2"/>`)
      anchors.push([x, y])
    }
    labels.push(b.name)
  }
  const placements = avoidLabels(anchors, labels)
  buildings.forEach((b, i) => {
    const placed = placements[i]
    const text = `${i + 1}. ${b.name}`
    out.push(`<text x="${fmt(placed.x)}" y="${fmt(placed.y)}" text-anchor="middle" font-size="${LABEL_FONT}" fill="#111827" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${esc(text)}</text>`)
  })

  // compass / scale / title (top-left)
  out.push(`<g transform="translate(${MARGIN + 18}, ${MARGIN + 8})">${northArrow()}</g>`)
  const { segments, pixelsPerSegment } = scaleBar(transform.scale)
  const barWidth = segments.length * pixelsPerSegment
  const barTop = MARGIN + 12
  out.push(`<g transform="translate(${svgWidth - MARGIN - barWidth}, ${barTop})">`)
  segments.forEach((s, i) => {
    out.push(`<rect x="${fmt(s.x)}" y="58" width="${fmt(pixelsPerSegment)}" height="8" fill="${i % 2 ? '#ffffff' : '#111827'}" stroke="#111827" stroke-width="1"/>`)
    out.push(`<text x="${fmt(s.x)}" y="52" font-size="10" fill="#111827">${s.label}</text>`)
  })
  out.push('</g>')
  out.push(`<text x="${MARGIN}" y="${MARGIN - 14}" font-size="14" font-weight="bold" fill="#111827">Campus plan — data audit (world x/z; z → SVG y, north up)</text>`)

  // legend (bottom-right, full building index)
  const legendX = svgWidth - MARGIN - 430
  out.push(`<g transform="translate(${legendX}, ${legendTop})">`)
  out.push(`<rect x="-12" y="-16" width="450" height="${LEGEND_HEIGHT - 12}" fill="#f9fafb" stroke="#9ca3af"/>`)
  out.push(`<text x="0" y="0" font-size="14" font-weight="bold" fill="#111827">Legend — building index (75)</text>`)
  out.push(`<rect x="0" y="10" width="14" height="10" fill="#f8fafc" stroke="#111827"/><text x="20" y="19" font-size="11" fill="#111827">building footprint</text>`)
  for (const zone of zones) out.push(`<rect x="0" y="${30 + zones.indexOf(zone) * 15}" width="14" height="10" fill="${zone.id === 'osm-campus-boundary' ? 'none' : zone.color ?? '#f3f4f6'}" stroke="#374151"/><text x="20" y="${39 + zones.indexOf(zone) * 15}" font-size="11" fill="#111827">${esc(zone.id)}</text>`)
  const legendStartY = 30 + zones.length * 15 + 8
  const perCol = Math.ceil(buildings.length / 3)
  buildings.forEach((b, i) => {
    const col = Math.floor(i / perCol)
    const row = i % perCol
    const x = col * 142
    const y = legendStartY + row * 15
    out.push(`<text x="${x}" y="${y}" font-size="10.5" fill="#111827">${i + 1}. ${esc(b.name)} [${esc(b.id)}]</text>`)
  })
  out.push('</g>')
  out.push('</svg>')
  return out.join('\n') + '\n'
}

// ---------- CLI ----------

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const packPath = resolve(root, 'packs/usts-tianping/campus.json')
const outPath = resolve(root, 'docs/audit/campus-plan.svg')

function gitSha(): string {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function main(): void {
  const data = JSON.parse(readFileSync(packPath, 'utf8')) as CampusPlanData
  const svg = renderCampusPlan(data, gitSha())
  writeFileSync(outPath, svg, 'utf8')
  console.log(`wrote ${outPath} (${data.buildings.length} buildings, ${data.zones.length} zones, ${data.roadNetwork.nodes.length} road nodes, ${roadSegments(data).length} segments)`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
