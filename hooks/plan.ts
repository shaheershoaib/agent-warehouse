import type { Agent, Phase } from '../types'

// The warehouse floor, in the units of the scene's viewBox. A robot's day is a
// list of timed phases; nothing here depends on a clock but the times it is given.
export const W = 400
export const H = 250
export const WALL = 80
export const LANE = 226
const SPEED = 80
export const CHEER_MS = 1500
export const SULK_MS = 2400
// How long a letter is drawn after it is sent.
export const LETTER_MS = 1_500

export type Pt = { x: number; y: number }
export type StationId = Agent['station']

export const STATIONS = ['web', 'files', 'desk', 'bench', 'mail'] as const
export const stationX = (id: (typeof STATIONS)[number]) => 44 + 78 * STATIONS.indexOf(id)
const FRONT: [number, number][] = [[-17, 136], [17, 136], [-17, 170], [17, 170], [0, 202]]

export const DOOR_IN: Pt = { x: -26, y: LANE }
export const DOOR_OUT: Pt = { x: W + 26, y: LANE }

export const slotPoint = (station: StationId, slot: number): Pt => {
  if (station === 'lounge') {
    return { x: 132 + (slot % 5) * 34, y: 212 }
  }
  const [dx, y] = FRONT[slot % FRONT.length] ?? [0, 136]

  return { x: stationX(station) + dx, y }
}

export const freeSlot = (agents: Agent[], station: StationId, except: string) => {
  const taken = new Set(
    agents.filter(a => a.station === station && a.id !== except && a.status === 'running').map(a => a.slot),
  )
  let slot = 0
  while (taken.has(slot)) {
    slot += 1
  }

  return slot
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

// Down to the lane, along it, then up to the place: a warehouse aisle.
const aisle = (from: Pt, to: Pt): Pt[] => {
  if (Math.abs(from.y - to.y) < 4) {
    return [to]
  }
  const pts: Pt[] = []
  if (from.y !== LANE) {
    pts.push({ x: from.x, y: LANE })
  }
  if (to.x !== from.x) {
    pts.push({ x: to.x, y: LANE })
  }
  pts.push(to)

  return pts
}

const walk = (from: Pt, to: Pt, t0: number): Phase[] => {
  const out: Phase[] = []
  let at = from
  let t = t0
  for (const next of aisle(from, to)) {
    const ms = Math.max(1, Math.round((dist(at, next) / SPEED) * 1000))
    out.push({ kind: 'walk', t0: t, t1: t + ms, from: at, to: next })
    at = next
    t += ms
  }

  return out
}

const endOf = (phases: Phase[], fallback: number) => phases.at(-1)?.t1 ?? fallback

export const posAt = (phases: Phase[], now: number): Pt => {
  const first = phases[0]
  if (!first || now < first.t0) {
    return first?.from ?? DOOR_IN
  }
  for (const p of phases) {
    if (p.t1 === null || now < p.t1) {
      if (p.kind !== 'walk') {
        return p.to
      }
      const k = (now - p.t0) / Math.max(1, p.t1 === null ? 1 : p.t1 - p.t0)

      return { x: p.from.x + (p.to.x - p.from.x) * k, y: p.from.y + (p.to.y - p.from.y) * k }
    }
  }

  return phases.at(-1)?.to ?? first.from
}

// Anchors the plan at `now`: what is past is dropped and the phase underway
// starts from where the robot actually is.
export const reanchor = (a: Agent, now: number): Agent => {
  const { letter: _sent, ...kept } = a
  const here = posAt(a.phases, now)
  const rest = a.phases
    .filter(p => p.t1 === null || p.t1 > now)
    .map(p => (p.t0 < now ? { ...p, t0: now, from: p.kind === 'walk' ? here : p.from } : p))

  return { ...kept, planAt: now, phases: rest.length > 0 ? rest : [{ kind: 'work', t0: now, t1: null, from: here, to: here }] }
}

export const enter = (a: Agent, now: number): Agent => {
  const to = slotPoint(a.station, a.slot)

  return {
    ...a,
    planAt: now,
    phases: [...walk(DOOR_IN, to, now), { kind: 'work', t0: endOf(walk(DOOR_IN, to, now), now), t1: null, from: to, to }],
  }
}

export const goTo = (a: Agent, station: StationId, slot: number, now: number): Agent => {
  const { letter: _sent, ...kept } = a
  const here = posAt(a.phases, now)
  const to = slotPoint(station, slot)
  const steps = walk(here, to, now)

  return { ...kept, station, slot, planAt: now, phases: [...steps, { kind: 'work', t0: endOf(steps, now), t1: null, from: to, to }] }
}

// Cheer or sulk where it stands, then out through the exit door.
export const leave = (a: Agent, status: Agent['status'], now: number): Agent => {
  const { letter: _sent, ...kept } = a
  const here = posAt(a.phases, now)
  const hold = status === 'done' ? CHEER_MS : status === 'failed' ? SULK_MS : 0
  const phases: Phase[] = []
  if (hold > 0) {
    phases.push({ kind: status === 'done' ? 'cheer' : 'sulk', t0: now, t1: now + hold, from: here, to: here })
  }
  phases.push(...walk(here, DOOR_OUT, now + hold))

  return { ...kept, planAt: now, phases }
}

// When a robot has walked out of sight.
export const goneAt = (a: Agent) => (a.status === 'running' ? null : endOf(a.phases, a.planAt))

// The robot as it should be drawn at `now`. One that has stopped moving is a
// still pose that never changes, so its drawing never needs redrawing; one on
// the move is drawn from where it is right now, so a redrawn frame picks up
// where it was instead of starting the walk again.
export const asDrawn = (a: Agent, now: number): Agent => {
  const isResting = a.status === 'running' && a.phases.every(p => p.t1 === null || p.t1 <= now)
  const letter = a.letter && now - a.letter.at < LETTER_MS ? a.letter : undefined
  const pose = posAt(a.phases, now)
  const drawn: Agent = isResting
    ? { ...reanchor(a, now), planAt: 0, phases: [{ kind: 'work', t0: 0, t1: null, from: pose, to: pose }] }
    : reanchor(a, now)

  return letter ? { ...drawn, letter } : drawn
}
