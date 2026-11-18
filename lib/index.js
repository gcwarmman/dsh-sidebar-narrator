/**
 * dsh-sidekick-lens — host half.
 *
 * Two jobs, deliberately kept apart:
 *
 *  1. Watch: fold the live session's events into the three-line view
 *     (`lib/narrative.js`) and hand it to the right-sidebar panel over an SSE
 *     feed. Nothing here talks to the model.
 *
 *  2. Intervene: expose three separate HTTP doors, matching the three things a
 *     person may want to do while watching —
 *       /ask   — a detached model call. Read-only, no session, no inbox, no
 *                tools: it cannot influence the main agent even by accident.
 *       /steer — `agent.steer(message)`: lands in the next-step inbox slot and
 *                is read at the next step boundary. The running tool call is
 *                not interrupted.
 *       /stop  — `agent.cancel({kind:'user'}, {keepInbox:true})`: aborts the
 *                current turn and keeps queued work, then reports what was kept
 *                and what was cut.
 *
 * Every door answers HTTP 200 with `{ok:false, message}` on failure, because a
 * broken sidebar must never look like a broken conversation.
 */

import { randomUUID } from 'node:crypto'
import {
  applyAgentError,
  applyAgentStatus,
  applySessionEvent,
  applyStream,
  buildDigest,
  buildView,
  clockText,
  createLensState,
  cut,
  explainPrompt,
  sentence,
} from './narrative.js'

export const name = 'dsh-sidekick-lens'
export const inject = ['webServer']

const STREAM_PATH = '/__sidekick_lens/stream'
const VIEW_PATH = '/__sidekick_lens/view'
const ASK_PATH = '/__sidekick_lens/ask'
const STEER_PATH = '/__sidekick_lens/steer'
const STOP_PATH = '/__sidekick_lens/stop'

const MAX_BODY = 32 * 1024
const MAX_SESSIONS = 16
const MAX_SEED_EVENTS = 400
const STREAM_THROTTLE_MS = 350
const PING_MS = 15_000
const IDLE_SETTLE_MS = 3_000

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** The rows a settings form projects, each with its default in `meta`. */
const FIELDS = {
  showLight: {
    type: 'boolean',
    meta: { default: true, description: '显示那盏状态灯（蓝在读、黄在写、青在跑、绿完成、红出错）' },
  },
  expandDetails: {
    type: 'boolean',
    meta: { default: false, description: '默认展开每行详情；关掉则点一行才展开' },
  },
  explainProvider: {
    type: 'string',
    meta: { default: '', description: '「问解释助手」用的模型提供方，留空则用当前默认模型' },
  },
  explainModel: {
    type: 'string',
    meta: { default: '', description: '「问解释助手」用的模型名，留空则用当前默认模型' },
  },
  steerTemplate: {
    type: 'string',
    meta: { default: '【侧边栏提醒】{text}', description: '「告诉 Agent」发出的文案模板，{text} 会换成你写的那句' },
  },
  emptyState: {
    type: 'string',
    meta: { default: '', description: '空闲时显示的那句话，可用 {duration} 和 {files}，留空则自动生成' },
  },
}

const SCHEMA = {
  uid: 1,
  refs: {
    2: FIELDS.showLight,
    3: FIELDS.expandDetails,
    4: { type: 'string', meta: { default: '' } },
    5: { type: 'string', meta: { default: '' } },
    6: { type: 'string', meta: { default: '【侧边栏提醒】{text}' } },
    7: { type: 'string', meta: { default: '' } },
    8: {
      type: 'object',
      meta: { default: {} },
      dict: {
        showLight: 2,
        expandDetails: 3,
        explainProvider: 4,
        explainModel: 5,
        steerTemplate: 6,
        emptyState: 7,
      },
    },
  },
}

/**
 * Exported as the plugin's Config so Settings can render the rows. Validation
 * never throws: a rejected config would fail the startup entry and take the
 * whole app down, so an unreadable value falls back to its default instead.
 */
export const Config = {
  ...SCHEMA,
  type: 'object',
  dict: FIELDS,
  meta: { default: {} },
  toJSON() {
    return SCHEMA
  },
  '~standard': {
    version: 1,
    vendor: 'dsh-sidekick-lens',
    validate(value) {
      return { value: normalizeConfig(value) }
    },
  },
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/** Read every setting defensively; a hand-edited config must not break the panel. */
function normalizeConfig(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  return {
    showLight: typeof source.showLight === 'boolean' ? source.showLight : true,
    expandDetails: typeof source.expandDetails === 'boolean' ? source.expandDetails : false,
    explainProvider: text(source.explainProvider, ''),
    explainModel: text(source.explainModel, ''),
    steerTemplate: text(source.steerTemplate, '【侧边栏提醒】{text}'),
    emptyState: text(source.emptyState, ''),
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sse(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`
}

/** One plain sentence for a failure the user is allowed to see. Never a stack trace. */
function human(message) {
  return typeof message === 'string' && message.trim() !== '' ? message : '这边出了点问题，刷新一下侧边栏试试。'
}

function errorText(error) {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  if (typeof error.message === 'string') return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * True when a browser made this request from somewhere other than this page.
 *
 * These routes are served by the DSH web server but sit outside its own access
 * check, so without this a page open in the same browser could read the session's
 * progress or fire the steer/stop doors. The panel is always same-origin, so a
 * foreign `Origin` — or a fetch that announces itself as cross-site — is not ours.
 *
 * Requests carrying neither header (curl, the test harness, a script on this
 * machine) pass on purpose: this guard is about a browser's cross-site reach, not
 * about authentication. Anyone who can run code as this user can talk to the Host
 * directly and does not need these routes.
 */
export function isCrossSite(headers) {
  const origin = headers?.origin
  if (typeof origin === 'string' && origin !== '') {
    const own = String(headers?.host ?? '')
    let host = ''
    try {
      host = new URL(origin).host
    } catch {
      return true
    }
    if (own === '' || host !== own) return true
  }
  const site = headers?.['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return true
  return false
}

/** Answer a request that came from another page, and go no further. */
function refuseCrossSite(res) {
  reply(res, 200, { ok: false, message: human('这个请求不是从侧边栏发来的，没有执行。') })
}

/** Read and cap a JSON request body. Resolves `null` for anything unusable. */
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        resolve(null)
        try {
          req.destroy()
        } catch {
          /* already gone */
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : null)
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function reply(res, status, payload) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  } catch {
    /* the client hung up first */
  }
}

function queryOf(req, fallbackPath) {
  try {
    return new URL(req.url || fallbackPath, 'http://127.0.0.1').searchParams
  } catch {
    return new URLSearchParams()
  }
}

/** Provider/model for the explain channel: config first, then the session default. */
function explanationRoute(ctx, settings) {
  if (settings.explainProvider !== '' && settings.explainModel !== '') {
    return { provider: settings.explainProvider, model: settings.explainModel }
  }
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (selection !== undefined && selection !== null) {
      return { provider: selection.provider, model: selection.model }
    }
  } catch {
    /* fall through */
  }
  return null
}

/** A steer message shaped exactly like the ones the session controller builds. */
function steerMessage(body) {
  return {
    id: `sidekick-${randomUUID()}`,
    role: 'user',
    content: [{ type: 'text', text: body }],
    source: { kind: 'user' },
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const settings = () => normalizeConfig(config)

  /** sessionId -> { state, view, connections:Set<res>, lastPush, signature } */
  const buckets = new Map()

  function seedFromSession(sessionId) {
    const state = createLensState(sessionId)
    // Ask the live agent how it is doing BEFORE replaying: `agent/status` only
    // fires on change, so a plugin reloaded mid-turn would otherwise believe the
    // agent is idle and show a green light while it is plainly working.
    let liveAgent
    try {
      liveAgent = ctx.get('agents')?.get?.(sessionId)
    } catch {
      liveAgent = undefined
    }
    if (liveAgent !== undefined && liveAgent !== null) {
      state.running = liveAgent.status === 'running'
    }
    try {
      const session = liveAgent?.session
      if (session === undefined || session === null || typeof session.snapshotEvents !== 'function') return state
      const events = session.snapshotEvents()
      const tail = events.length > MAX_SEED_EVENTS ? events.slice(-MAX_SEED_EVENTS) : events
      for (const event of tail) {
        try {
          applySessionEvent(state, event, event?.time ?? Date.now())
        } catch {
          /* one unreadable event must not stop the replay */
        }
      }
      // The replay ends at whatever the log says; the live status is newer.
      if (liveAgent !== undefined && liveAgent !== null) state.running = liveAgent.status === 'running'
    } catch {
      /* a cold session simply starts empty; the panel then says it is idle */
    }
    return state
  }

  /**
   * Fill a bucket from the durable session log when the session is not attached.
   *
   * The in-memory buckets die with the plugin, so after a reload (or for a session
   * that is not running right now) the panel used to say 「还没干过活」 about work
   * that plainly happened. `sessionQuery.readSession` reads the same log the
   * conversation UI reads, so the panel can show real history again.
   */
  async function reseedFromLog(sessionId, record) {
    if (record.seeding !== undefined) return record.seeding
    const query = ctx.get('sessionQuery')
    if (query === undefined || query === null || typeof query.readSession !== 'function') return
    record.seeding = (async () => {
      try {
        const snapshot = await query.readSession(sessionId)
        const events = Array.isArray(snapshot?.events) ? snapshot.events : []
        if (events.length === 0) return
        // Only fill a bucket that is still empty: live events that arrived while we
        // were reading are newer and must win.
        if (record.state.stepsDone > 0 || record.state.current !== null) return
        const tail = events.length > MAX_SEED_EVENTS ? events.slice(-MAX_SEED_EVENTS) : events
        const rebuilt = createLensState(sessionId)
        for (const event of tail) {
          try {
            applySessionEvent(rebuilt, event, event?.time ?? Date.now())
          } catch {
            /* skip an unreadable event, keep the rest */
          }
        }
        // Carry over anything the live feed already knows better than the log.
        rebuilt.running = record.state.running
        rebuilt.error = record.state.error ?? rebuilt.error
        rebuilt.cancelNote = record.state.cancelNote ?? rebuilt.cancelNote
        rebuilt.updatedAt = Math.max(rebuilt.updatedAt, record.state.updatedAt)
        record.state = rebuilt
        publish(sessionId, { force: true })
      } catch {
        /* an unreadable log is not an error the user needs to see */
      } finally {
        record.seeding = undefined
      }
    })()
    return record.seeding
  }

  function bucketFor(sessionId) {
    const existing = buckets.get(sessionId)
    if (existing !== undefined) {
      existing.touchedAt = Date.now()
      return existing
    }
    const created = {
      sessionId,
      state: seedFromSession(sessionId),
      view: null,
      connections: new Set(),
      lastPush: 0,
      signature: '',
      seeding: undefined,
      touchedAt: Date.now(),
    }
    buckets.set(sessionId, created)
    // If the live agent was attached we already have the truth; otherwise go read
    // the durable log so a reloaded panel is not blind.
    if (created.state.stepsDone === 0 && created.state.current === null) {
      void reseedFromLog(sessionId, created)
    }
    if (buckets.size > MAX_SESSIONS) {
      let oldestId = null
      let oldestAt = Infinity
      for (const [id, record] of buckets) {
        if (record.connections.size > 0) continue
        if (record.touchedAt < oldestAt) {
          oldestAt = record.touchedAt
          oldestId = id
        }
      }
      if (oldestId !== null && oldestId !== sessionId) buckets.delete(oldestId)
    }
    return created
  }

  /** Signature of the visible content; unchanged signatures are never re-sent. */
  function signatureOf(view) {
    if (view === null) return ''
    return [
      view.light,
      view.running ? '1' : '0',
      view.position.index,
      view.position.total,
      view.rows.map((row) => `${row.key}:${row.text}:${row.source}`).join('|'),
      view.idle === null ? '' : view.idle.text,
      view.error === null ? '' : view.error.text,
      view.cancelNote === null ? '' : view.cancelNote.text,
    ].join('\u0001')
  }

  function computeView(record) {
    const opts = settings()
    const view = buildView(record.state, Date.now(), { emptyState: opts.emptyState })
    record.view = view
    record.signature = signatureOf(view)
    return view
  }

  /** Recompute and push to every listener of this session. */
  function publish(sessionId, { force = false } = {}) {
    const record = buckets.get(sessionId)
    if (record === undefined) return
    const view = computeView(record)
    const now = Date.now()
    const changed = force || signatureOf(view) !== record.signature
    record.signature = signatureOf(view)
    if (!changed) return
    if (!force && now - record.lastPush < STREAM_THROTTLE_MS) return
    record.lastPush = now
    const frame = sse({ type: 'view', view })
    for (const res of record.connections) {
      try {
        res.write(frame)
      } catch {
        record.connections.delete(res)
      }
    }
  }

  const dispose = ctx.effect(() => {
    const disposers = []

    const on = (event, listener) => {
      disposers.push(ctx.on(event, listener, { global: true }))
    }

    /** Only live, top-level sessions matter here; subagents have their own ids and their own tab. */
    const sessionIdOf = (agent) => (typeof agent?.id === 'string' ? agent.id : '')

    // ---- Watch: fold events into the three-line view ----------------------

    on('agent/status', (payload) => {
      const sessionId = sessionIdOf(payload?.agent)
      if (sessionId === '') return
      const record = bucketFor(sessionId)
      applyAgentStatus(record.state, payload.status, Date.now())
      publish(sessionId, { force: true })
    })

    on('agent/error', (payload) => {
      const sessionId = sessionIdOf(payload?.agent)
      if (sessionId === '') return
      const record = bucketFor(sessionId)
      applyAgentError(record.state, payload.error, Date.now())
      publish(sessionId, { force: true })
    })

    on('agent/assistant-stream', (payload) => {
      const sessionId = sessionIdOf(payload?.agent)
      if (sessionId === '') return
      const record = bucketFor(sessionId)
      applyStream(record.state, payload.frame, Date.now())
      publish(sessionId)
    })

    on('session/event', (session, event) => {
      const sessionId = typeof session?.id === 'string' ? session.id : ''
      if (sessionId === '') return
      const record = bucketFor(sessionId)
      try {
        applySessionEvent(record.state, event, Date.now())
      } catch {
        /* an unexpected event shape must not break the feed */
      }
      const force = event?.type === 'turn/start' || event?.type === 'turn/end' || event?.type === 'tool/result'
      publish(sessionId, { force })
    })

    // ---- Route: the SSE feed ---------------------------------------------

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: STREAM_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        if (isCrossSite(req.headers)) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('cross-site request refused')
          return
        }
        const params = queryOf(req, STREAM_PATH)
        const sessionId = params.get('session') ?? ''
        if (sessionId === '') {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('missing session')
          return
        }

        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.write(': connected\n\n')

        const record = bucketFor(sessionId)
        record.connections.add(res)
        const opts = settings()

        // Wait for the durable-log reseed (a warm bucket resolves immediately) so
        // the very first paint already shows real history instead of 「还没干过活」.
        if (record.seeding !== undefined) {
          try {
            await record.seeding
          } catch {
            /* the snapshot below still renders whatever we have */
          }
        }

        // First frame is a full snapshot: the panel renders in one paint.
        try {
          res.write(sse({
            type: 'snapshot',
            view: computeView(record),
            settings: opts,
          }))
        } catch {
          record.connections.delete(res)
          return
        }

        const ping = setInterval(() => {
          try {
            res.write(': ping\n\n')
          } catch {
            /* gone */
          }
        }, PING_MS)
        if (typeof ping.unref === 'function') ping.unref()

        res.on('close', () => {
          clearInterval(ping)
          record.connections.delete(res)
          record.touchedAt = Date.now()
        })
      },
    }))

    // ---- Route: one-shot view (used when EventSource is unavailable) ------

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: VIEW_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        if (isCrossSite(req.headers)) {
          reply(res, 200, { ok: false, message: human('这个请求不是从侧边栏发来的，没有执行。') })
          return
        }
        const sessionId = queryOf(req, VIEW_PATH).get('session') ?? ''
        if (sessionId === '') {
          reply(res, 200, { ok: false, message: '没带上会话编号。' })
          return
        }
        try {
          const record = bucketFor(sessionId)
          // A cold bucket may still be reading the durable log; answering before
          // that lands would tell the user 「还没干过活」 about visible history.
          if (record.seeding !== undefined) await record.seeding
          reply(res, 200, { ok: true, view: computeView(record), settings: settings() })
        } catch {
          reply(res, 200, { ok: false, message: human('这会儿读不到进展，刷新一下侧边栏试试。') })
        }
      },
    }))

    // ---- Door 1: 问解释助手 (read-only, detached model call) --------------

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ASK_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (isCrossSite(req.headers)) {
          refuseCrossSite(res)
          return
        }
        const body = await readBody(req)
        if (body === null) {
          reply(res, 200, { ok: false, message: human('这条问题太长或格式不对，换个短点的说法。') })
          return
        }
        const sessionId = typeof body.session === 'string' ? body.session : ''
        const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
        if (question === '') {
          reply(res, 200, { ok: false, message: human('先写一句想问的。') })
          return
        }

        const record = sessionId === '' ? null : buckets.get(sessionId) ?? bucketFor(sessionId)
        const digest = record === null
          ? '还没有可观察的进展。'
          : buildDigest(record.state, {
            now: Date.now(),
            extra: typeof body.context === 'string' ? cut(body.context, 400) : '',
          })

        const route = explanationRoute(ctx, settings())
        if (route === null) {
          reply(res, 200, { ok: false, message: '现在没有可用的模型来回答，先去设置里挑一个。' })
          return
        }

        const system = explainPrompt(digest, {
          running: record === null ? false : record.state.running === true,
        })

        let answer = ''
        try {
          const llm = ctx.get('llm')
          if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
            reply(res, 200, { ok: false, message: '模型这会儿连不上，稍等一下再问。' })
            return
          }
          for await (const chunk of llm.stream({
            provider: route.provider,
            model: route.model,
            system,
            messages: [{ role: 'user', content: [{ type: 'text', text: question }] }],
            maxTokens: 320,
          })) {
            if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') answer += chunk.text
            if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
              answer = ''
              break
            }
          }
        } catch {
          answer = ''
        }

        if (answer.trim() === '') {
          reply(res, 200, { ok: false, message: '模型这次没给回话，再问一次试试。' })
          return
        }
        reply(res, 200, { ok: true, answer: cut(answer.trim(), 1200), question })
      },
    }))

    // ---- Door 2: 告诉 Agent (steer — read at the next step boundary) ------

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: STEER_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (isCrossSite(req.headers)) {
          refuseCrossSite(res)
          return
        }
        const body = await readBody(req)
        if (body === null) {
          reply(res, 200, { ok: false, message: human('这条提醒太长或格式不对，说短一点。') })
          return
        }
        const sessionId = typeof body.session === 'string' ? body.session : ''
        const note = typeof body.text === 'string' ? body.text.trim().slice(0, 400) : ''
        if (note === '') {
          reply(res, 200, { ok: false, message: human('先写一句要提醒的。') })
          return
        }

        const agent = sessionId === '' ? undefined : ctx.get('agents')?.get?.(sessionId)
        if (agent === undefined || agent === null) {
          reply(res, 200, { ok: false, message: '这个会话现在没在跑，提醒发不出去。回到对话里说一句更稳。' })
          return
        }

        const template = settings().steerTemplate
        const payload = template.includes('{text}') ? template.replace(/\{text\}/g, note) : `${template}${note}`
        const wasRunning = agent.status === 'running'

        try {
          agent.steer(steerMessage(payload))
        } catch (error) {
          reply(res, 200, { ok: false, message: human(`提醒没送进去：${errorText(error)}`) })
          return
        }

        const record = bucketFor(sessionId)
        record.state.steers = [...record.state.steers, cut(note, 80)].slice(-4)
        publish(sessionId, { force: true })

        reply(res, 200, {
          ok: true,
          running: wasRunning,
          message: wasRunning
            ? '提醒放进去了。它手上这一步不会被打断，做完这一步就会看到。'
            : '它现在闲着，这条提醒会直接开一步来读。',
        })
      },
    }))

    // ---- Door 3: 先停一下 (cancel + honest kept/aborted report) ----------

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: STOP_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (isCrossSite(req.headers)) {
          refuseCrossSite(res)
          return
        }
        const body = await readBody(req)
        if (body === null) {
          reply(res, 200, { ok: false, message: human('请求格式不对，再点一次。') })
          return
        }
        const sessionId = typeof body.session === 'string' ? body.session : ''
        const agent = sessionId === '' ? undefined : ctx.get('agents')?.get?.(sessionId)
        if (agent === undefined || agent === null) {
          reply(res, 200, { ok: false, message: '这个会话现在没在跑，没有可停的步骤。' })
          return
        }
        if (agent.status !== 'running') {
          reply(res, 200, { ok: false, message: '它现在本来就不在跑，没有东西要停。' })
          return
        }

        const record = bucketFor(sessionId)
        const before = buildView(record.state, Date.now(), { emptyState: settings().emptyState })

        // What is being cut, described before we cut it.
        const abortedLine = before.rows.find((row) => row.key === 'doing')?.text ?? '手上这一步'

        try {
          agent.cancel({ kind: 'user' }, { keepInbox: true })
        } catch (error) {
          reply(res, 200, { ok: false, message: human(`没停下来：${errorText(error)}`) })
          return
        }

        // Wait briefly for quiescence so the report is about the real end state.
        try {
          const idle = agent.whenIdle?.()
          if (idle !== undefined && idle !== null && typeof idle.then === 'function') {
            await Promise.race([
              idle.catch(() => undefined),
              new Promise((resolve) => {
                const timer = setTimeout(resolve, IDLE_SETTLE_MS)
                if (typeof timer.unref === 'function') timer.unref()
              }),
            ])
          }
        } catch {
          /* quiescence timing out is fine; the report below still stands */
        }

        const after = buildView(record.state, Date.now(), { emptyState: settings().emptyState })
        publish(sessionId, { force: true })

        const keptParts = []
        if (after.stepsDone > 0) keptParts.push(`已经做完的 ${after.stepsDone} 步`)
        if (after.files.length > 0) keptParts.push(`动过的 ${after.files.length} 个文件（${after.files.slice(-3).join('、')}）`)
        const elapsed = after.lastTurn?.durationMs ?? 0
        if (elapsed > 0) keptParts.push(`这一轮已经跑的 ${clockText(elapsed)}`)

        reply(res, 200, {
          ok: true,
          kept: keptParts.length === 0 ? '这一步之前还没有落地的改动，所以没什么要保的。' : `${keptParts.join('、')}都留着。`,
          aborted: `停掉的是：${cut(abortedLine, 80)}`,
          next: '想换个方向，直接在下边说一句；什么也不说也行，它不会自己接着跑。',
          view: after,
        })
      },
    }))

    return () => {
      for (const disposeRoute of disposers) {
        try {
          disposeRoute?.()
        } catch {
          /* already disposed */
        }
      }
      for (const record of buckets.values()) {
        for (const res of record.connections) {
          try {
            res.end()
          } catch {
            /* gone */
          }
        }
        record.connections.clear()
      }
      buckets.clear()
    }
  }, 'sidekick-lens: host feed and doors')

  return dispose
}
