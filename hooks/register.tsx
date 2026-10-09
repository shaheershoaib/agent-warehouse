import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Ping, Strip } from '../types'
import { backgroundSvg, robotSvg, tagsSvg } from './art'
import { H, W, asDrawn, enter, freeColor, freeSlot, goTo, goneAt, leave, posAt, reanchor, stationX } from './plan'
import { verdictOf } from './verdict'

const PANE = 'agents'
// The strip stays a while after the last agent finishes, then makes room again.
const LINGER_MS = 30_000
const TICK_MS = 2_500
// Robots change station at most this often, all together: one redraw, however busy the agents.
const MOVE_FLUSH_MS = 4_000
const MAX_AGENTS = 40
const MAX_PINGS = 12
const MIN_COLUMNS = 36
// About how long a redrawn picture takes to load and start; moving robots are drawn this far ahead.
const LOAD_LEAD_MS = 150
const GLYPHS = { running: '●', done: '✓', failed: '✗', stopped: '■' } as const

const agents = atom({ plugin: 'agent-warehouse', key: 'agents' } as const, [])
const pings = atom({ plugin: 'agent-warehouse', key: 'pings' } as const, [])
const strip = atom({ plugin: 'agent-warehouse', key: 'strip' } as const, null)
const selected = atom({ plugin: 'agent-warehouse', key: 'selected' } as const, null)

let counter = 0
let hasOpened = false
// What each agent is doing is kept here, not in shared state: a tool call must never redraw the pane.
const activity = new Map<string, { tool: string; doing: string }>()
// Where each robot stands, mirrored so a tool call never has to read state.
const seats = new Map<string, Agent['station']>()
const wanted = new Map<string, Agent['station']>()
let isFlushQueued = false
// Agents whose answer is still being judged: the engine's own list must not settle them first.
const judging = new Set<string>()
// Spawns and moves are applied one after another, so each sees the one before it.
let chain: Promise<unknown> = Promise.resolve()
const serial = <T,>(work: () => Promise<T>) => {
  const next = chain.then(work, work)
  chain = next.catch(() => undefined)

  return next
}

const clip = (text: string, size: number) => (text.length > size ? `${text.slice(0, size - 1)}…` : text)
const labelOf = (list: Agent[], id: string) =>
  id === 'main' ? 'Main' : clip(list.find(agent => agent.id === id)?.label ?? id, 22)
const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

// Where a tool is done in the warehouse.
const stationOf = (tool: string): Agent['station'] => {
  if (/^(WebFetch|WebSearch)$/.test(tool) || tool.startsWith('mcp__')) {
    return 'web'
  }
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) {
    return 'files'
  }
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) {
    return 'desk'
  }
  if (/^(Bash|BashOutput|KillShell)$/.test(tool)) {
    return 'bench'
  }
  if (/^(SendMessage|Agent|Task)$/.test(tool)) {
    return 'mail'
  }

  return 'lounge'
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const nameOfPath = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return clip(url, 30)
  }
}

// A short plain-words line for what a tool call is doing.
const doingOf = (tool: string, input: Record<string, unknown>) => {
  switch (tool) {
    case 'Read':
      return `Reading ${nameOfPath(text(input.file_path))}`
    case 'Grep':
      return `Searching for “${clip(text(input.pattern), 30)}”`
    case 'Glob':
      return `Finding files: ${clip(text(input.pattern), 30)}`
    case 'Bash':
      return `Running ${clip(text(input.command), 44)}`
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return `Editing ${nameOfPath(text(input.file_path))}`
    case 'WebFetch':
      return `Fetching ${hostOf(text(input.url))}`
    case 'WebSearch':
      return `Searching the web: ${clip(text(input.query), 36)}`
    case 'SendMessage':
      return `Messaging ${clip(text(input.to), 20)}`
    case 'Agent':
      return `Starting an agent: ${clip(text(input.description), 30)}`
    default:
      return tool.startsWith('mcp__') ? `Using ${tool.split('__').slice(1).join(' · ')}` : `Using ${tool}`
  }
}

// Who a message is for: an agent by id or by the name it was given. A reply
// from an agent to anyone else this map does not know goes to the session.
const addressee = (list: Agent[], to: string, from: string) => {
  const found = list.find(agent => agent.id === to || agent.name === to)
  if (found) {
    return found.id
  }

  return from === 'main' ? null : 'main'
}

// The strip speaks only when its words change, so it never redraws for nothing.
const syncStrip = async ($: EngineInterface) => {
  const list = await read($, agents)
  const now = await $.clock.now()
  const running = list.filter(agent => agent.status === 'running').length
  const isRecent = list.some(agent => agent.endedAt !== undefined && now - agent.endedAt < LINGER_MS)
  const plural = (count: number) => `${count} agent${count === 1 ? '' : 's'}`
  const next: Strip =
    running > 0 ? { title: `${plural(running)} working` } : isRecent ? { title: `${plural(list.length)} finished` } : null
  if (JSON.stringify(await read($, strip)) !== JSON.stringify(next)) {
    await update($, strip, () => next)
  }
}

// An agent is done: it cheers (or sulks) where it stands, then walks out.
const settle = (agent: Agent, status: Agent['status'], now: number): Agent => {
  const { tool: _tool, ...rest } = leave(agent, status, now)
  seats.delete(agent.id)
  activity.delete(agent.id)

  return { ...rest, status, endedAt: now, doing: status === 'done' ? 'Finished' : status === 'failed' ? 'Failed' : 'Stopped' }
}

// An agent that ended without its own turn.complete (stopped, or failed) is
// settled from the engine's own list.
const reconcile = async ($: EngineInterface) => {
  const before = await read($, agents)
  if (!before.some(agent => agent.status === 'running')) {
    return
  }
  const live = await $.agent.list()
  const now = await $.clock.now()
  const gone = before.filter(agent => {
    const info = agent.status === 'running' && !judging.has(agent.id) ? live.find(one => one.id === agent.id) : undefined

    return info !== undefined && info.status !== 'running'
  })
  if (gone.length > 0) {
    await update($, agents, list =>
      list.map(agent => {
        const info = gone.some(one => one.id === agent.id) ? live.find(one => one.id === agent.id) : undefined

        return info
          ? settle(agent, info.status === 'completed' ? 'done' : info.status === 'failed' ? 'failed' : 'stopped', now)
          : agent
      }),
    )
  }
  await syncStrip($)
}

const finish = async ($: EngineInterface, id: string, status: Agent['status']) => {
  const now = await $.clock.now()
  await serial(() =>
    update($, agents, list =>
      list.map(agent => (agent.id === id && agent.status === 'running' ? settle(agent, status, now) : agent)),
    ),
  )
  await syncStrip($)
  $.clock.after(LINGER_MS + 200, () => void syncStrip($))
}

// All the stations robots asked for since the last flush, applied together.
const flush = async ($: EngineInterface) => {
  isFlushQueued = false
  const asked = [...wanted]
  wanted.clear()
  if (asked.length === 0) {
    return
  }
  const now = await $.clock.now()
  await serial(() =>
    update($, agents, list => {
      // Each robot is seated against the list as the robots before it left it.
      const next = [...list]
      for (const [id, st] of asked) {
        const at = next.findIndex(agent => agent.id === id)
        const agent = next[at]
        if (!agent || agent.status !== 'running' || agent.station === st) {
          continue
        }
        seats.set(id, st)
        next[at] = goTo(agent, st, freeSlot(next, st, id), now)
      }

      return next
    }),
  )
}

// Picks a robot (or lets go of it): one write, so one redraw.
const select = async ($: EngineInterface, id: string) => {
  const before = await read($, selected)
  await update($, selected, () => (before === id ? null : id))
}

const openPane = ($: EngineInterface, focus: boolean) =>
  $.ui.open({ id: PANE, title: 'Agent Warehouse', closeOnEscape: true, ...(focus ? { focus: true as const } : {}) })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'warehouse',
      description: 'Open the live warehouse of this session’s agents',
    })
    $.clock.every(TICK_MS, () => void reconcile($))

    return next(e)
  })

  on('command.run', { command: 'warehouse' }, async $ => {
    await openPane($, true)

    return { text: 'Agent warehouse opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId) {
      const now = await $.clock.now()
      const id = spawned.agentId
      await serial(() =>
        update($, agents, list => {
          const slot = freeSlot(list, 'lounge', id)
          seats.set(id, 'lounge')
          const born = enter(
            {
              id,
              label: e.description || e.subagentType,
              type: e.subagentType,
              parent: e.parentAgentId ?? 'main',
              ...(e.name ? { name: e.name } : {}),
              status: 'running',
              bornAt: now,
              station: 'lounge',
              doing: 'Getting started',
              task: clip(e.prompt.replace(/\s+/g, ' ').trim(), 220),
              slot,
              planAt: now,
              phases: [],
              color: freeColor(list, now),
            },
            now,
          )

          return [...list, born].slice(-MAX_AGENTS)
        }),
      )
      await syncStrip($)
      // The first agent of a session opens the warehouse by itself, without taking focus.
      if (!hasOpened) {
        hasOpened = true
        void openPane($, false)
      }
    }

    return spawned
  })

  // A tool call only notes what the agent is up to. It never touches shared
  // state: that would redraw the pane on every call.
  on('tool.call', ($, e, next) => {
    const id = e.agentId
    if (id) {
      activity.set(id, { tool: e.tool, doing: doingOf(e.tool, e as unknown as Record<string, unknown>) })
      const station = stationOf(e.tool)
      if (seats.has(id) && seats.get(id) !== station) {
        wanted.set(id, station)
        if (!isFlushQueued) {
          isFlushQueued = true
          $.clock.after(MOVE_FLUSH_MS, () => void flush($))
        }
      } else {
        wanted.delete(id)
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id && e.reason === 'answer') {
      // An answer can still say the task failed. It is judged off the hook's
      // path, so the model call never holds up the turn.
      judging.add(id)
      const task = (await read($, agents)).find(agent => agent.id === id)?.task ?? ''
      void verdictOf(e.answer, task, (text, labels) => $.model.classify(text, labels))
        .then(status => finish($, id, status))
        .catch(() => undefined)
        .finally(() => judging.delete(id))
    } else if (id) {
      await finish($, id, e.reason === 'aborted' ? 'stopped' : 'failed')
    }

    return next(e)
  })

  on('session.send', async ($, e, next) => {
    const list = await read($, agents)
    const from = e.agentId ?? 'main'
    const to = addressee(list, e.to, from)
    if (to) {
      const now = await $.clock.now()
      const entry: Ping = { id: (counter += 1), from, to, text: clip(e.text, 140), at: now }
      void update($, pings, all => [...all, entry].slice(-MAX_PINGS))
      // The letter flies in the sender's layer, or the receiver's when the session writes.
      const spot = (id: string) => {
        const found = list.find(agent => agent.id === id)
        const at = found ? posAt(found.phases, now) : { x: stationX('mail'), y: 128 }

        return { x: at.x, y: at.y - 34 }
      }
      const a = spot(from)
      const b = spot(to)
      const owner = from === 'main' ? to : from
      void serial(() =>
        update($, agents, all =>
          all.map(agent =>
            agent.id === owner && agent.status === 'running'
              ? { ...reanchor(agent, now), letter: { x0: a.x, y0: a.y, x1: b.x, y1: b.y, at: now } }
              : agent,
          ),
        ),
      )
    }

    return next(e)
  })

  // The strip: a quiet line while agents work, and a way into the warehouse.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const line = await read($, strip)
    if (e.props.hasSurvey || !line) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const bar = (
      <Box key="strip" borderStyle="round" borderDimColor paddingX={1} gap={2} alignItems="center" flexWrap="wrap">
        <Text color="#22d3ee">●</Text>
        <Box flexGrow={1}>
          <Text bold>{line.title}</Text>
        </Box>
        <Button key="open" label="Open warehouse" onPress={() => openPane($, true)} />
      </Box>
    )

    return below.type === 'engine' ? (
      bar
    ) : (
      <Box flexDirection="column">
        {bar}
        {below}
      </Box>
    )
  })

  // The warehouse: a still floor, one transparent layer per robot, then who is who.
  // A robot at rest is a pose that never changes, so redraws leave it alone.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const list = await read($, agents)
    const recent = await read($, pings)
    const chosen = await read($, selected)
    const now = await $.clock.now()
    const columns = e.props.bodyColumns
    const floor = list.filter(agent => {
      const out = goneAt(agent)

      return out === null || now < out + 800
    })
    const working = list.filter(agent => agent.status === 'running').length
    const done = list.filter(agent => agent.status === 'done').length
    const failed = list.filter(agent => agent.status === 'failed').length
    const counts = `${working} working · ${done} done${failed ? ` · ${failed} failed` : ''}`
    const talk = recent.slice(-2)
    const pick = floor.find(agent => agent.id === chosen)
    const doingNow = pick ? (activity.get(pick.id)?.doing ?? pick.doing) : ''

    const notes = (
      <Box flexDirection="column">
        {pick ? (
          <Box flexDirection="column">
            <Box gap={1}>
              <Text color={pick.color}>●</Text>
              <Text bold>{clip(pick.label, 40)}</Text>
              <Text dimColor>
                {pick.type} · {pick.status} · {elapsed((pick.endedAt ?? now) - pick.bornAt)}
              </Text>
            </Box>
            <Text dimColor>Doing</Text>
            <Text>{clip(doingNow, 160)}</Text>
            <Text dimColor>Task</Text>
            <Text>{clip(pick.task || 'No task text.', 220)}</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text bold>Agent warehouse</Text>
            <Text dimColor>{counts}</Text>
            {working > 0 && <Text dimColor>Point at or click a robot, or click its name, to see what it is doing.</Text>}
            {list.length === 0 && <Text dimColor>No agents yet. They appear here when Claude starts subagents.</Text>}
          </Box>
        )}
        {talk.map(ping => (
          <Text key={`ping-${ping.id}`} dimColor>
            {labelOf(list, ping.from)} → {labelOf(list, ping.to)}: {clip(ping.text, 60)}
          </Text>
        ))}
      </Box>
    )

    if (!('Svg' in ui) || columns < MIN_COLUMNS) {
      // A surface without pictures, or too narrow for them: a plain list.
      return (
        <Box flexDirection="column" gap={1}>
          {list
            .slice(-10)
            .reverse()
            .map(agent => (
              <Box key={`row-${agent.id}`} gap={1}>
                <Text color={agent.color}>{GLYPHS[agent.status]}</Text>
                <Text bold>{clip(agent.label, 28)}</Text>
                <Text dimColor>{clip(activity.get(agent.id)?.doing ?? agent.doing, 40)}</Text>
              </Box>
            ))}
          {notes}
        </Box>
      )
    }

    const width = Math.min(640, Math.max(300, Math.round(columns * 9)))
    const height = Math.round((width * H) / W)
    const drawn = floor.map(agent => asDrawn(agent, now + LOAD_LEAD_MS))

    return (
      <Box flexDirection="column" gap={1}>
        <Box position="relative">
          <Box key="floor">
            <ui.Svg source={backgroundSvg(width, height)} alt="The warehouse floor" width={width} height={height} isInteractive />
          </Box>
          {drawn.map(agent => (
            <Box key={`bot-${agent.id}`} position="absolute" top={0} left={0}>
              <ui.Svg
                source={robotSvg(agent, { width, height, selected: agent.id === chosen })}
                alt={`${agent.label}: ${activity.get(agent.id)?.doing ?? agent.doing}`}
                width={width}
                height={height}
                isInteractive
              />
            </Box>
          ))}
          {drawn.length > 0 && (
            <Box key="tags" position="absolute" top={0} left={0}>
              <ui.Svg
                source={tagsSvg(
                  drawn.map(agent => ({ agent, doing: activity.get(agent.id)?.doing ?? agent.doing })),
                  { width, height },
                )}
                alt="Point at or click a robot to see what it is doing"
                width={width}
                height={height}
                isInteractive
              />
            </Box>
          )}
        </Box>
        <Box gap={1} flexWrap="wrap">
          {floor
            .filter(agent => agent.status === 'running')
            .map(agent => (
              <Button
                key={`pick-${agent.id}`}
                variant={agent.id === chosen ? 'primary' : 'secondary'}
                label={`${GLYPHS.running} ${clip(agent.label, 16)}`}
                onPress={() => select($, agent.id)}
              />
            ))}
        </Box>
        {notes}
      </Box>
    )
  })
}
