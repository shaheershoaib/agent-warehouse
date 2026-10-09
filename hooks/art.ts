import type { Agent, Phase } from '../types'
import { H, LANE, STATIONS, W, WALL, stationX } from './plan'

// Vector art for the warehouse: one still background, and one transparent layer
// per robot. A robot's layer only changes when that robot's own plan does, so
// the others keep walking undisturbed.
const INK = '#14161c'
const FONT = 'system-ui,-apple-system,Segoe UI,sans-serif'
// Without a color scheme, Desktop's sandboxed frame paints an opaque white square.
const SCHEME = '<style>:root{color-scheme:light dark}</style>'

const part = (c: string, at: number) => parseInt(c.slice(at, at + 2), 16)
const two = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
const shade = (c: string, k: number) => `#${two(part(c, 1) * k)}${two(part(c, 3) * k)}${two(part(c, 5) * k)}`
const mix = (a: string, b: string, k: number) =>
  `#${two(part(a, 1) * (1 - k) + part(b, 1) * k)}${two(part(a, 3) * (1 - k) + part(b, 3) * k)}${two(part(a, 5) * (1 - k) + part(b, 5) * k)}`
const n = (v: number) => Math.round(v * 100) / 100
const sec = (ms: number) => `${n(Math.max(0, ms) / 1000)}s`
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const open = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${w}" height="${h}">${SCHEME}`

// ---- the room -------------------------------------------------------------

const station = (id: (typeof STATIONS)[number]) => {
  const x = stationX(id) - 28
  const y = 24
  let art = ''
  if (id === 'web') {
    art =
      '<rect x="3" y="6" width="50" height="34" rx="4" fill="#cbd5e1"/><rect x="6" y="9" width="44" height="28" rx="2.5" fill="#0b1e3a"/>' +
      '<circle cx="28" cy="23" r="11" fill="#0e3a66" stroke="#38bdf8" stroke-width="1.6"/>' +
      '<ellipse cx="28" cy="23" rx="4.5" ry="11" fill="none" stroke="#38bdf8" stroke-width="1"><animate attributeName="rx" values="4.5;0.6;4.5" dur="3s" repeatCount="indefinite"/></ellipse>' +
      '<path d="M17 23h22M19 17.5h18M19 28.5h18" stroke="#38bdf8" stroke-width="0.8" fill="none"/>' +
      '<rect x="6" y="9" width="44" height="2" fill="#7dd3fc" fill-opacity="0.35"><animate attributeName="y" values="9;35;9" dur="3.4s" repeatCount="indefinite"/></rect>' +
      '<rect x="24" y="40" width="8" height="6" fill="#94a3b8"/><rect x="14" y="46" width="28" height="4" rx="2" fill="#64748b"/>'
  } else if (id === 'files') {
    const hues = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899']
    const books = [0, 1, 2].map(row =>
      Array.from({ length: 7 }, (_, i) => {
        const tall = 11 + ((i * 5 + row * 3) % 6)

        return `<rect x="${6 + i * 6.2}" y="${15 + row * 13 - tall + 11}" width="5" height="${tall}" rx="1" fill="${hues[(i + row * 2) % hues.length]}"/>`
      }).join(''),
    ).join('')
    art =
      '<rect x="2" y="2" width="52" height="50" rx="3" fill="#4a3524"/>' +
      [0, 1, 2].map(row => `<rect x="2" y="${15 + row * 13}" width="52" height="3" fill="#8b6a47"/>`).join('') +
      books +
      '<rect x="6" y="2" width="5" height="11" fill="#fff" fill-opacity="0"><animate attributeName="fill-opacity" values="0;0;0.7;0" dur="4.5s" repeatCount="indefinite"/></rect>'
  } else if (id === 'desk') {
    art =
      '<rect x="8" y="4" width="40" height="29" rx="3" fill="#334155"/><rect x="11" y="7" width="34" height="23" rx="1.5" fill="#0f172a"/>' +
      [['#4ade80', 10], ['#fbbf24', 18], ['#f472b6', 13], ['#38bdf8', 22]]
        .map(([c, w], i) => `<rect x="14" y="${10 + i * 5}" width="${w}" height="2.4" rx="1" fill="${c}"><animate attributeName="width" values="${w};${Number(w) + 7};${w}" dur="${2 + i * 0.6}s" repeatCount="indefinite"/></rect>`)
        .join('') +
      '<rect x="24" y="33" width="8" height="4" fill="#64748b"/><rect x="0" y="38" width="56" height="9" rx="2" fill="#a16207"/><rect x="10" y="40" width="22" height="3" rx="1" fill="#e5e7eb"/>' +
      '<rect x="4" y="47" width="4" height="9" fill="#78350f"/><rect x="48" y="47" width="4" height="9" fill="#78350f"/>'
  } else if (id === 'bench') {
    art =
      '<rect x="2" y="34" width="52" height="9" rx="2" fill="#94a3b8"/><rect x="5" y="43" width="4" height="13" fill="#64748b"/><rect x="47" y="43" width="4" height="13" fill="#64748b"/>' +
      '<g transform="translate(18 21)"><g><circle r="10" fill="none" stroke="#f59e0b" stroke-width="4" stroke-dasharray="5.2 4.4"/><circle r="7" fill="#b45309"/><circle r="2.5" fill="#fde68a"/>' +
      '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="5s" repeatCount="indefinite"/></g></g>' +
      '<g transform="translate(37 22)"><g><circle r="6" fill="none" stroke="#fb923c" stroke-width="3" stroke-dasharray="3.2 2.8"/><circle r="3.4" fill="#9a3412"/>' +
      '<animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="3.4s" repeatCount="indefinite"/></g></g>' +
      '<g fill="#fde047"><circle cx="46" cy="30" r="1.4"><animate attributeName="opacity" values="1;0;1" dur="0.5s" repeatCount="indefinite"/></circle>' +
      '<circle cx="49" cy="27" r="1"><animate attributeName="opacity" values="0;1;0" dur="0.5s" repeatCount="indefinite"/></circle></g>'
  } else {
    art =
      '<rect x="27" y="2" width="2.5" height="24" fill="#94a3b8"/><circle cx="28" cy="3" r="3" fill="#fde047"><animate attributeName="fill-opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></circle>' +
      '<circle cx="28" cy="3" r="3" fill="none" stroke="#fde047" stroke-width="1"><animate attributeName="r" values="3;12" dur="2s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.8;0" dur="2s" repeatCount="indefinite"/></circle>' +
      '<rect x="8" y="26" width="40" height="28" rx="8" fill="#ef4444"/><rect x="14" y="34" width="28" height="4" rx="2" fill="#7f1d1d"/>' +
      '<rect x="42" y="14" width="3" height="16" fill="#cbd5e1"/><path d="M45 14h9v7h-9z" fill="#fde047"><animateTransform attributeName="transform" type="skewY" values="0;-8;0" dur="2.4s" repeatCount="indefinite"/></path>'
  }
  const label = `<text x="28" y="-6" text-anchor="middle" font-family="${FONT}" font-size="8" letter-spacing="1.4" fill="#8b93a7">${id.toUpperCase()}</text>`

  return `<g transform="translate(${x} ${y})">${label}${art}</g>`
}

export const backgroundSvg = (w: number, h: number) => {
  const tiles = Array.from({ length: Math.ceil((H - WALL) / 20) }, (_, row) =>
    Array.from({ length: Math.ceil(W / 20) }, (_, col) =>
      (row + col) % 2 === 0 ? `<rect x="${col * 20}" y="${WALL + row * 20}" width="20" height="20" fill="#3b4150"/>` : '',
    ).join(''),
  ).join('')
  const dashes = Array.from({ length: 14 }, (_, i) => `<rect x="${10 + i * 29}" y="${LANE + 11}" width="14" height="2.4" rx="1" fill="#8a7a2c"/>`).join('')
  const windows = [83, 161, 239, 317]
    .map(x => `<rect x="${x - 17}" y="8" width="34" height="18" rx="2" fill="#27405f"/><rect x="${x - 15}" y="10" width="30" height="14" rx="1" fill="#4a79ad" fill-opacity="0.55"/><path d="M${x} 10v14M${x - 15} 17h30" stroke="#27405f" stroke-width="1.2"/>`)
    .join('')

  return (
    open(w, h) +
    `<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3544"/><stop offset="1" stop-color="#262b37"/></linearGradient>` +
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="#363c4a"/>${tiles}` +
    `<rect y="${WALL - 2}" width="${W}" height="4" fill="#14161c" fill-opacity="0.55"/>` +
    `<rect width="${W}" height="${WALL - 2}" fill="url(#wall)"/>${windows}` +
    `<rect x="0" y="${WALL - 6}" width="${W}" height="4" fill="#1b1e27"/>` +
    `<text x="${W / 2}" y="${WALL - 11}" text-anchor="middle" font-family="${FONT}" font-size="0" fill="#000">.</text>` +
    `<rect x="132" y="190" width="136" height="32" rx="12" fill="#4b3f63"/><rect x="140" y="196" width="120" height="20" rx="8" fill="#5b4d77"/>` +
    dashes +
    `<rect x="0" y="${LANE - 34}" width="9" height="46" rx="2" fill="#0e1015"/><rect x="0" y="${LANE - 40}" width="22" height="9" rx="3" fill="#166534"/><text x="11" y="${LANE - 33}" text-anchor="middle" font-family="${FONT}" font-size="6.5" font-weight="700" fill="#bbf7d0">IN</text>` +
    `<rect x="${W - 9}" y="${LANE - 34}" width="9" height="46" rx="2" fill="#0e1015"/><rect x="${W - 28}" y="${LANE - 40}" width="28" height="9" rx="3" fill="#991b1b"/><text x="${W - 14}" y="${LANE - 33}" text-anchor="middle" font-family="${FONT}" font-size="6.5" font-weight="700" fill="#fecaca">EXIT</text>` +
    STATIONS.map(station).join('') +
    `<rect width="${W}" height="${H}" fill="url(#shade)"/></svg>`
  )
}

// ---- a robot --------------------------------------------------------------

const ICONS: Record<Agent['station'], string> = {
  web:
    '<circle r="5.2" fill="none" stroke="#0284c7" stroke-width="1.4"/><ellipse rx="2.2" ry="5.2" fill="none" stroke="#0284c7" stroke-width="1"><animate attributeName="rx" values="2.2;0.4;2.2" dur="1.8s" repeatCount="indefinite"/></ellipse><path d="M-5.2 0h10.4" stroke="#0284c7" stroke-width="1"/>',
  files:
    '<g><circle cx="-1" cy="-1" r="3.6" fill="none" stroke="#7c3aed" stroke-width="1.5"/><path d="M1.8 1.8 5.4 5.4" stroke="#7c3aed" stroke-width="2" stroke-linecap="round"/><animateTransform attributeName="transform" type="translate" values="-2,0;2,0;-2,0" dur="1.4s" repeatCount="indefinite"/></g>',
  desk:
    '<g><path d="M-4 4 3 -3 5 -1 -2 6z" fill="#f59e0b"/><path d="M-4 4-5 7-2 6z" fill="#92400e"/><animateTransform attributeName="transform" type="translate" values="0,0;1.5,-1;0,0" dur="0.5s" repeatCount="indefinite"/></g>',
  bench:
    '<g><circle r="4.6" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="2.4 2.4"/><circle r="2.2" fill="none" stroke="#f59e0b" stroke-width="1.4"/><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.6s" repeatCount="indefinite"/></g>',
  mail:
    '<rect x="-5.5" y="-3.6" width="11" height="7.2" rx="1" fill="#fff" stroke="#ef4444" stroke-width="1.2"/><path d="M-5.5 -3.6 0 1 5.5 -3.6" fill="none" stroke="#ef4444" stroke-width="1.2"/>',
  lounge:
    '<circle cx="-4.5" r="1.5" fill="#64748b"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite"/></circle><circle r="1.5" fill="#64748b"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.2s" repeatCount="indefinite"/></circle><circle cx="4.5" r="1.5" fill="#64748b"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.4s" repeatCount="indefinite"/></circle>',
}

type Timeline = { start: Pt; moves: { dur: number; values: string; keyTimes: string } | null; walks: [number, number][]; work: number | null; cheer: [number, number] | null; sulk: [number, number] | null }
type Pt = { x: number; y: number }

// Reads a plan as seconds from its own anchor, so the same plan always gives the same drawing.
const timeline = (phases: Phase[], anchor: number): Timeline => {
  const rel = (t: number) => Math.max(0, (t - anchor) / 1000)
  const first = phases[0]
  const start = first ? first.from : { x: 0, y: 0 }
  const pts: { t: number; p: Pt }[] = [{ t: 0, p: start }]
  const walks: [number, number][] = []
  let work: number | null = null
  let cheer: [number, number] | null = null
  let sulk: [number, number] | null = null
  for (const ph of phases) {
    const end = ph.t1 === null ? ph.t0 : ph.t1
    if (rel(ph.t0) > (pts.at(-1)?.t ?? 0)) {
      pts.push({ t: rel(ph.t0), p: pts.at(-1)?.p ?? start })
    }
    pts.push({ t: rel(end), p: ph.to })
    if (ph.kind === 'walk') {
      walks.push([rel(ph.t0), rel(end)])
    } else if (ph.kind === 'work') {
      work = rel(ph.t0)
    } else if (ph.kind === 'cheer') {
      cheer = [rel(ph.t0), rel(end)]
    } else {
      sulk = [rel(ph.t0), rel(end)]
    }
  }
  const total = pts.at(-1)?.t ?? 0
  if (total <= 0) {
    return { start, moves: null, walks, work, cheer, sulk }
  }
  const kept = pts.filter((pt, i) => i === pts.length - 1 || (pts[i + 1]?.t ?? 0) > pt.t)
  const values = kept.map(pt => `${n(pt.p.x)},${n(pt.p.y)}`).join(';')
  const keyTimes = kept.map(pt => n(pt.t / total)).join(';')

  return { start, moves: { dur: total, values, keyTimes }, walks, work, cheer, sulk }
}

// The walk a robot's layer and its target on the top layer both follow.
const motion = (tl: Timeline) =>
  tl.moves
    ? `<animateTransform attributeName="transform" type="translate" values="${tl.moves.values}" keyTimes="${tl.moves.keyTimes}" dur="${n(tl.moves.dur)}s" begin="0s" fill="freeze"/>`
    : ''

const SAD_GREY = '#7b8190'
const SCALE = 0.84

export const robotSvg = (
  a: Agent,
  o: { width: number; height: number; selected: boolean },
) => {
  const tl = timeline(a.phases, a.planAt)
  const body = a.color
  const dark = shade(body, 0.66)
  const light = shade(body, 1.25)
  const ms = (t: number) => sec(t * 1000)
  const window = (w: [number, number]) => `begin="${ms(w[0])}" dur="${ms(w[1] - w[0])}"`
  const show = (w: [number, number] | number) =>
    typeof w === 'number'
      ? `<set attributeName="opacity" to="1" begin="${ms(w)}" fill="freeze"/>`
      : `<set attributeName="opacity" to="1" ${window(w)}/>`
  const hide = (w: [number, number] | null) => (w ? `<set attributeName="opacity" to="0" ${window(w)}/>` : '')
  const cycle = (type: string, w: [number, number], period: string, values: string) =>
    `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${period}" begin="${ms(w[0])}" repeatDur="${ms(w[1] - w[0])}"/>`
  const swing = (side: 1 | -1) =>
    tl.work === null
      ? ''
      : `<animateTransform attributeName="transform" type="rotate" values="${side * -26} ${side * 11} -22;${side * 22} ${side * 11} -22;${side * -26} ${side * 11} -22" dur="0.7s" begin="${ms(tl.work)}" repeatCount="indefinite"/>`

  const bob = tl.walks.map(w => cycle('translate', w, '0.42s', '0,0;0,-2.4;0,0')).join('') + (tl.cheer ? cycle('translate', tl.cheer, '0.5s', '0,0;0,-16;0,0') : '')
  const legL = tl.walks.map(w => cycle('rotate', w, '0.42s', '-24 -5 -9;24 -5 -9;-24 -5 -9')).join('')
  const legR = tl.walks.map(w => cycle('rotate', w, '0.42s', '24 5 -9;-24 5 -9;24 5 -9')).join('')
  const tint = tl.sulk ? `<animate attributeName="fill" to="${mix(body, SAD_GREY, 0.72)}" ${window(tl.sulk).replace(/ dur="[^"]*"/, ' dur="0.4s"')} fill="freeze"/>` : ''
  const move = motion(tl)

  const eye = (cx: number) =>
    `<ellipse cx="${cx}" cy="-36" rx="3.7" ry="3.9" fill="#f8fafc"><animate attributeName="ry" values="3.9;3.9;0.5;3.9" keyTimes="0;0.93;0.965;1" dur="4.2s" begin="${cx > 0 ? 0.35 : 0}s" repeatCount="indefinite"/></ellipse>` +
    `<circle cx="${cx + 0.7}" cy="-35.4" r="1.9" fill="#0f172a"/><circle cx="${cx + 1.3}" cy="-36.3" r="0.7" fill="#fff"/>`
  const sadEye = (cx: number) =>
    `<path d="M${cx - 3.4} -37q3.4 -3 6.8 0" fill="none" stroke="#f8fafc" stroke-width="1.6" stroke-linecap="round"/><circle cx="${cx}" cy="-32.6" r="1.2" fill="#93c5fd"/>`
  const mouth = tl.sulk
    ? `<path d="M-3 -27.4q3 -2.8 6 0" fill="none" stroke="#f8fafc" stroke-width="1.4" stroke-linecap="round"/>`
    : tl.cheer
      ? `<path d="M-4.6 -30q4.6 6 9.2 0z" fill="#f8fafc"/>`
      : `<path d="M-3.4 -30q3.4 3 6.8 0" fill="none" stroke="#f8fafc" stroke-width="1.4" stroke-linecap="round"/>`

  const bubble =
    tl.work === null
      ? ''
      : `<g opacity="0" transform="translate(0 -68)">${show(tl.work)}<g><animateTransform attributeName="transform" type="translate" values="0,0;0,-2.4;0,0" dur="1.6s" repeatCount="indefinite"/>` +
        '<path d="M-14 -10h28a4.5 4.5 0 0 1 4.5 4.5v11a4.5 4.5 0 0 1-4.5 4.5h-9.5l-4.5 5.5-4.5-5.5h-9.5a4.5 4.5 0 0 1-4.5-4.5v-11a4.5 4.5 0 0 1 4.5-4.5z" fill="#f8fafc" stroke="#14161c" stroke-width="1.2"/>' +
        `<g transform="translate(0 -2.5)">${ICONS[a.station]}</g></g></g>`
  const stars = tl.cheer
    ? `<g opacity="0">${show(tl.cheer)}` +
      ([[-19, -52], [19, -50], [-13, -66], [15, -64]] as const)
        .map(([x, y], i) => `<path d="M${x} ${y - 4}l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z" fill="#fde047"><animate attributeName="opacity" values="1;0.2;1" dur="${n(0.5 + i * 0.1)}s" repeatCount="indefinite"/></path>`)
        .join('') +
      '</g>'
    : ''
  const cloud = tl.sulk
    ? `<g opacity="0" transform="translate(0 -64)">${show(tl.sulk)}<ellipse cx="-6" cy="0" rx="9" ry="5.5" fill="#64748b"/><ellipse cx="5" cy="-2" rx="10" ry="6.5" fill="#64748b"/><ellipse cx="0" cy="2" rx="14" ry="4.5" fill="#64748b"/>` +
      [-6, 0, 6]
        .map((x, i) => `<path d="M${x} 7v4" stroke="#60a5fa" stroke-width="1.6" stroke-linecap="round"><animateTransform attributeName="transform" type="translate" values="0,0;0,10" dur="0.7s" begin="${n(i * 0.2)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="0.7s" begin="${n(i * 0.2)}s" repeatCount="indefinite"/></path>`)
        .join('') +
      '</g>'
    : ''
  const ring = o.selected
    ? '<ellipse cx="0" cy="0" rx="23" ry="6.5" fill="none" stroke="#fde047" stroke-width="1.8" stroke-dasharray="6 4"><animate attributeName="stroke-dashoffset" from="0" to="20" dur="1.2s" repeatCount="indefinite"/></ellipse>'
    : ''
  const letter = a.letter
    ? (() => {
        const { x0, y0, x1, y1 } = a.letter
        const path = `M${n(x0)} ${n(y0)}Q${n((x0 + x1) / 2)} ${n(Math.min(y0, y1) - 46)} ${n(x1)} ${n(y1)}`

        return (
          `<g opacity="0"><set attributeName="opacity" to="1" begin="0s" dur="1.15s"/><animateMotion dur="1.1s" path="${path}" fill="freeze"/>` +
          '<rect x="-7" y="-5" width="14" height="10" rx="1.6" fill="#f8fafc" stroke="#ef4444" stroke-width="1.2"/><path d="M-7 -5 0 1 7 -5" fill="none" stroke="#ef4444" stroke-width="1.2"/></g>'
        )
      })()
    : ''

  const art =
    `<ellipse cx="0" cy="0.6" rx="13" ry="3.4" fill="#000" fill-opacity="0.3"/>${ring}` +
    `<g>${bob}` +
    `<g><rect x="-8" y="-9" width="6" height="9.6" rx="2.6" fill="${INK}"/>${legL}</g><g><rect x="2" y="-9" width="6" height="9.6" rx="2.6" fill="${INK}"/>${legR}</g>` +
    `<rect x="-11" y="-26" width="22" height="19" rx="6" fill="${dark}" stroke="${INK}" stroke-width="1.4">${tint}</rect>` +
    '<rect x="-6.5" y="-22" width="13" height="8" rx="2" fill="#0f172a"/>' +
    '<circle cx="-2.6" cy="-18" r="1.7" fill="#4ade80"><animate attributeName="opacity" values="1;0.25;1" dur="1.3s" repeatCount="indefinite"/></circle><circle cx="2.6" cy="-18" r="1.7" fill="#38bdf8"><animate attributeName="opacity" values="0.25;1;0.25" dur="1.3s" repeatCount="indefinite"/></circle>' +
    `<g>${hide(tl.cheer)}<g><rect x="-15.8" y="-24" width="4.6" height="12.5" rx="2.3" fill="${dark}" stroke="${INK}" stroke-width="1">${tint}</rect>${swing(1)}</g><g><rect x="11.2" y="-24" width="4.6" height="12.5" rx="2.3" fill="${dark}" stroke="${INK}" stroke-width="1">${tint}</rect>${swing(-1)}</g></g>` +
    (tl.cheer
      ? `<g opacity="0">${show(tl.cheer)}<rect x="-19" y="-38" width="4.6" height="13" rx="2.3" fill="${dark}" stroke="${INK}" stroke-width="1" transform="rotate(-22 -15 -25)"/><rect x="14.4" y="-38" width="4.6" height="13" rx="2.3" fill="${dark}" stroke="${INK}" stroke-width="1" transform="rotate(22 15 -25)"/></g>`
      : '') +
    `<rect x="-17.4" y="-40" width="3.6" height="8.6" rx="1.8" fill="${dark}" stroke="${INK}" stroke-width="1"/><rect x="13.8" y="-40" width="3.6" height="8.6" rx="1.8" fill="${dark}" stroke="${INK}" stroke-width="1"/>` +
    `<rect x="-14" y="-47" width="28" height="22" rx="9" fill="${body}" stroke="${INK}" stroke-width="1.6">${tint}</rect>` +
    `<path d="M-9.5 -44.4q9.5 -3.4 19 0" fill="none" stroke="${light}" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.8"/>` +
    '<rect x="-10.6" y="-42.4" width="21.2" height="15.4" rx="6" fill="#0f172a"/>' +
    '<circle cx="-8.2" cy="-30.6" r="2" fill="#fb7185" fill-opacity="0.5"/><circle cx="8.2" cy="-30.6" r="2" fill="#fb7185" fill-opacity="0.5"/>' +
    `<g>${hide(tl.sulk)}${eye(-4.8)}${eye(4.8)}</g>` +
    (tl.sulk ? `<g opacity="0">${show(tl.sulk)}${sadEye(-4.8)}${sadEye(4.8)}</g>` : '') +
    mouth +
    `<path d="M0 -47v-6" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><circle cx="0" cy="-55" r="2.8" fill="${tl.work !== null ? '#fde047' : light}" stroke="${INK}" stroke-width="1"><animate attributeName="fill-opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite"/></circle>` +
    `${stars}${cloud}${bubble}</g>`

  return (
    open(o.width, o.height) +
    `<g transform="translate(${n(tl.start.x)} ${n(tl.start.y)})">${move}<g transform="scale(${SCALE})">${art}</g></g>${letter}</svg>`
  )
}

// ---- who is who -------------------------------------------------------------

// Each robot is its own frame and only the top frame hears the pointer, so this
// last layer carries an invisible target that walks with each robot and the card
// pointing at it or clicking it shows. All of it is CSS inside the frame: no
// message to the plugin, so no redraw.
export type Tag = { agent: Agent; doing: string }

// Up to `lines` lines of at most `size` characters, an ellipsis where it was cut.
const wrap = (text: string, size: number, lines: number) => {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const piece = word.length > size ? `${word.slice(0, size - 1)}…` : word
    if (!line || `${line} ${piece}`.length <= size) {
      line = line ? `${line} ${piece}` : piece
      continue
    }
    out.push(line)
    line = piece
    if (out.length === lines) {
      const last = out[lines - 1] ?? ''
      out[lines - 1] = `${last.length < size ? last : last.slice(0, size - 1)}…`

      return out
    }
  }

  return line ? [...out, line] : out
}

export const tagsSvg = (tags: Tag[], o: { width: number; height: number }) => {
  // Sized in screen pixels, whatever width the scene is drawn at.
  const k = W / o.width
  const body = n(12 * k)
  const head = n(13 * k)
  const gap = n(16 * k)
  const pad = n(9 * k)
  const left = 8
  const wide = W - 2 * left
  const size = Math.max(20, Math.floor((wide - 2 * pad - 10 * k) / (body * 0.56)))

  const style =
    '<style>:root{color-scheme:light dark}.h{cursor:pointer;outline:none}.r,.c{opacity:0;pointer-events:none}' +
    '.h:hover .r,.h:focus .r{opacity:1}' +
    tags.map((_, i) => `#h${i}:hover~#c${i}{opacity:1}`).join('') +
    tags.map((_, i) => `svg:not(:has(.h:hover)) #h${i}:focus~#c${i}{opacity:1}`).join('') +
    '</style>'

  const targets = tags
    .map(({ agent }, i) => {
      const tl = timeline(agent.phases, agent.planAt)

      return (
        `<g id="h${i}" class="h" tabindex="0" transform="translate(${n(tl.start.x)} ${n(tl.start.y)})">${motion(tl)}` +
        '<ellipse class="r" cx="0" cy="0.6" rx="21" ry="6" fill="none" stroke="#fde047" stroke-width="1.6" stroke-dasharray="5 3.5"/>' +
        '<rect x="-18" y="-52" width="36" height="56" fill="#000" fill-opacity="0"/></g>'
      )
    })
    .join('')

  const cards = tags
    .map(({ agent, doing }, i) => {
      const meta = `${agent.type} · ${agent.status}`
      const rows: { text: string; size: number; fill: string; weight?: string }[] = [
        { text: wrap(agent.label, size - 4, 1)[0] ?? '', size: head, fill: '#f8fafc', weight: '700' },
        { text: meta, size: body, fill: '#9aa3b5' },
        { text: wrap(`Doing: ${doing || 'Thinking'}`, size, 1)[0] ?? '', size: body, fill: '#e2e8f0' },
        ...wrap(`Task: ${agent.task || 'No task text.'}`, size, 2).map(text => ({ text, size: body, fill: '#cbd5e1' })),
      ]
      const tall = n(2 * pad + rows.length * gap - (gap - head) / 2)
      const text = rows
        .map(
          (row, r) =>
            `<text x="${n(left + pad + (r === 0 ? 10 * k : 0))}" y="${n(6 + pad + head * 0.8 + r * gap)}" font-family="${FONT}" font-size="${row.size}"${row.weight ? ` font-weight="${row.weight}"` : ''} fill="${row.fill}">${esc(row.text)}</text>`,
        )
        .join('')

      return (
        `<g id="c${i}" class="c"><rect x="${left}" y="6" width="${wide}" height="${tall}" rx="${n(7 * k)}" fill="#0f1117" fill-opacity="0.94" stroke="${agent.color}" stroke-width="${n(1.4 * k)}"/>` +
        `<circle cx="${n(left + pad + 3.5 * k)}" cy="${n(6 + pad + head * 0.45)}" r="${n(3.5 * k)}" fill="${agent.color}"/>${text}</g>`
      )
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${o.width}" height="${o.height}">${style}${targets}${cards}</svg>`
}
