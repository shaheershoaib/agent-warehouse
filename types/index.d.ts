// A step of a robot's day. Times are epoch milliseconds; `t1: null` runs on until the next event.
export type Phase = {
  kind: 'walk' | 'work' | 'cheer' | 'sulk'
  t0: number
  t1: number | null
  from: { x: number; y: number }
  to: { x: number; y: number }
}
// A letter in flight from one point of the scene to another, sent at `at`.
export type Letter = { x0: number; y0: number; x1: number; y1: number; at: number }

// `id` is the engine's agent id.
export type Agent = {
  id: string
  label: string
  type: string
  parent: string
  name?: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  bornAt: number
  endedAt?: number
  // Where it works, what it is doing now, and what it was asked to do.
  station: 'web' | 'files' | 'desk' | 'bench' | 'mail' | 'lounge'
  tool?: string
  doing: string
  task: string
  // Its route through the warehouse, planned from `planAt` (the moment of its last change).
  slot: number
  planAt: number
  phases: Phase[]
  color: string
  letter?: Letter
}
// One message between two agents (from and to are agent ids, or 'main').
export type Ping = { id: number; from: string; to: string; text: string; at: number }
// What the strip above the prompt says, or null when it has nothing to say.
export type Strip = { title: string } | null

declare module 'claude-code' {
  interface PluginState {
    'agent-warehouse': { agents: Agent[]; pings: Ping[]; strip: Strip; selected: string | null }
  }
}
