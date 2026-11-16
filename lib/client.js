/**
 * dsh-sidekick-lens — client half.
 *
 * A native right-sidebar tab (ctx.sidebarRightTabs + the sidebar.right.pane.tab
 * seat), so it docks, drags, merges and splits exactly like files and terminal.
 *
 * Shape of the panel, and the reason for the shape:
 *   - three lines and one light by default. A person opens this at a glance, so
 *     the default state answers "what is it doing" before any click.
 *   - clicking a line opens the reasoning behind it (why / what it saw / result /
 *     what you could change). Collapsed by default: the sidebar shares width with
 *     a diff or a terminal, and long prose there would squeeze the neighbours.
 *   - three visually separate doors, because "type something in the box" hides
 *     whether you are asking, steering, or stopping. Each door states its price
 *     in one short line above the control.
 *
 * All data arrives over the plugin's own Host routes; the panel never talks to
 * the session controller itself, so a broken panel cannot disturb a turn.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidekick-lens',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const NS = 'sidekick-lens'
    const TAB_ID = 'sidekick-lens:panel'
    const TAB_KIND = 'sidekick-lens'
    const STREAM_PATH = '/__sidekick_lens/stream'
    const VIEW_PATH = '/__sidekick_lens/view'
    const ASK_PATH = '/__sidekick_lens/ask'
    const STEER_PATH = '/__sidekick_lens/steer'
    const STOP_PATH = '/__sidekick_lens/stop'
    const zh = {
      'meta.title': '侧写',
      'meta.description': '三行话告诉你它干完什么、在干什么、下一步干什么，还能问、能提醒、能喊停。',
      'type.label': '侧写',
      'guide.title': '侧写',
      'guide.description': '它现在在干嘛，一句话一行',
      'row.done': '已完成',
      'row.doing': '正在做',
      'row.next': '下一步',
      'src.observed': '已观察到',
      'src.reported': '仅据汇报',
      'detail.why': '为什么做',
      'detail.saw': '看到了什么',
      'detail.result': '结果',
      'detail.adjust': '可以怎么调',
      'hint.clickHint': '点一下展开',
      'light.blue': '在读或搜',
      'light.yellow': '在写或改',
      'light.cyan': '在跑或测',
      'light.green': '完成',
      'light.red': '出错或卡住',
      'position': '第 {index} / {total} 步',
      'ask.title': '问解释助手',
      'ask.note': '只看不碰：单独问模型，不会给主 agent 发消息，也不改它要做的事。',
      'ask.placeholder': '这一步为什么这么做？它是不是卡住了？',
      'ask.cta': '问',
      'ask.asking': '想想…',
      'ask.error': '模型这次没给回话，再问一次试试。',
      'steer.title': '告诉 Agent',
      'steer.note': '不打断当前步骤：它做完手上这步，下一步才看得到。',
      'steer.placeholder': '那个文件先别改，先看看配置。',
      'steer.cta': '发提醒',
      'steer.sending': '送…',
      'stop.title': '先停一下',
      'stop.note': '打断后已完成的内容会保留，它会说明中止了什么。',
      'stop.cta': '先停一下',
      'stop.confirm': '确认停 · 已完成内容会保留',
      'stop.cancel': '算了，不停',
      'stop.stopping': '正在停…',
      'stop.kept': '保留了什么',
      'stop.aborted': '中止了什么',
      'stop.next': '接下来',
      'conn.lost': '断线了，正在重连…',
      'conn.waiting': '等它动起来…',
      'empty.noSession': '这里没有绑定会话。从对话那边打开右侧栏就能看到这一轮的进展。',
      'idle.fallback': '空闲。还没干过活，说一句它就开工。',
      'ledger.todos': '清单 {done} / {total}',
      'error.title': '这边出了点问题',
    }
    const en = {
      'meta.title': 'Sidekick',
      'meta.description': 'Three plain lines: what is done, what is running, what is next. Ask, nudge, or stop.',
      'type.label': 'Sidekick',
      'guide.title': 'Sidekick',
      'guide.description': 'What it is doing right now, one line at a time',
      'row.done': 'Done',
      'row.doing': 'Doing',
      'row.next': 'Next',
      'src.observed': 'observed',
      'src.reported': 'reported',
      'detail.why': 'Why',
      'detail.saw': 'What it saw',
      'detail.result': 'Result',
      'detail.adjust': 'Could change',
      'hint.clickHint': 'click to expand',
      'light.blue': 'reading',
      'light.yellow': 'writing',
      'light.cyan': 'running',
      'light.green': 'done',
      'light.red': 'stuck',
      'position': 'step {index} of {total}',
      'ask.title': 'Ask the explainer',
      'ask.note': 'Read-only: a separate model. Sends nothing to the agent and changes nothing it does.',
      'ask.placeholder': 'Why this step? Is it stuck?',
      'ask.cta': 'Ask',
      'ask.asking': 'thinking…',
      'ask.error': 'The model did not answer. Try once more.',
      'steer.title': 'Tell the agent',
      'steer.note': 'Does not interrupt: it reads this at the next step boundary.',
      'steer.placeholder': 'Leave that file alone for now, check the config first.',
      'steer.cta': 'Send',
      'steer.sending': 'sending…',
      'stop.title': 'Stop for now',
      'stop.note': 'Finished work is kept. It will say what it aborted.',
      'stop.cta': 'Stop',
      'stop.confirm': 'Confirm stop · finished work is kept',
      'stop.cancel': 'never mind',
      'stop.stopping': 'stopping…',
      'stop.kept': 'Kept',
      'stop.aborted': 'Aborted',
      'stop.next': 'Next',
      'conn.lost': 'Disconnected, retrying…',
      'conn.waiting': 'waiting for it to start…',
      'empty.noSession': 'No session bound to this tab. Open the right sidebar from a conversation to see its progress.',
      'idle.fallback': 'Idle. Nothing has run yet.',
    'ledger.todos': 'checklist {done} / {total}',
      'error.title': 'Something went wrong here',
    }
    const CSS = `/* ===========================================================================
侧写 · 常规主题
安静的一张卡片：一盏状态灯、一条位置线、三行大白话、一块总账、三张门。
只用 --dsw-alias-* 主题 token，跟随明暗主题；没有星野、极光、反应堆。
动画只保留两处携带信息的：灯的呼吸（在跑时）与心跳波形（真实事件打点）。
=========================================================================== */.skl {
  --skl-accent: var(--dsw-alias-brand-primary);
  --skl-hair: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
  --skl-hair-2: color-mix(in srgb, var(--dsw-alias-label-primary) 15%, transparent);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: 15px 15px 22px;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: 12.5px;
  line-height: 1.62;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  container-type: inline-size;
  -webkit-font-smoothing: antialiased;
}

.skl[data-light="blue"] { --skl-accent: #5b8fd0; }
.skl[data-light="yellow"] { --skl-accent: #c08b3e; }
.skl[data-light="cyan"] { --skl-accent: #3f9c94; }
.skl[data-light="green"] { --skl-accent: var(--dsw-alias-state-success-primary); }
.skl[data-light="red"] { --skl-accent: var(--dsw-alias-state-error-primary); }

/* ---- 头：一盏灯 + 状态词 + 位置 ---- */
.skl-head {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: none;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--skl-hair);
}

.skl-light {
  position: relative;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--skl-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--skl-accent) 18%, transparent);
}

.skl-light[data-pulse="true"] {
  animation: skl-breathe 2.6s ease-in-out infinite;
}

.skl-head-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.skl-lightword {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skl-pos {
  font-size: 11px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 保留节点但不画：位置感由「第 N / M 步」承担，不要第二条进度条 */
.skl-progress { display: none; }

/* ---- 心跳波形：真实事件打点，安静时压平 ---- */
.skl-pulse {
  position: relative;
  height: 30px;
  margin: 12px 0 2px;
  flex: none;
  overflow: hidden;
}

.skl-pulse .skl-wave {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.skl-wave-line {
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .85;
}

.skl-wave-area { opacity: .5; }

.skl-wave-ghost {
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .18;
}

.skl-wave-head {
  fill: var(--skl-accent);
}

.skl-pulse[data-running="false"] .skl-wave-line { opacity: .34; }
.skl-pulse[data-running="false"] .skl-wave-area { opacity: .2; }

/* ---- 三行 ---- */
.skl-rows {
  display: flex;
  flex-direction: column;
  margin: 10px -6px 0;
  flex: none;
}

.skl-row {
  display: block;
  width: 100%;
  padding: 9px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: background .18s ease;
}

.skl-row:hover { background: var(--dsw-alias-interactive-bg-hover); }

.skl-row:focus-visible {
  outline: 2px solid var(--skl-accent);
  outline-offset: -2px;
}

.skl-row-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.skl-row-label {
  font-size: 11px;
  line-height: 1.3;
  color: var(--dsw-alias-label-tertiary);
}

.skl-row-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  flex-wrap: wrap;
}

.skl-row-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-row[data-key="doing"] .skl-row-label { color: var(--dsw-alias-label-secondary); }

.skl-row[data-key="doing"] .skl-row-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.skl-row[data-key="done"] .skl-row-text { color: var(--dsw-alias-label-tertiary); }
.skl-row[data-tone="muted"] .skl-row-text { color: var(--dsw-alias-label-tertiary); }

.skl-reveal { display: inline; }
.skl-ch { display: inline; white-space: pre-wrap; }

/* ---- 来源徽标 ---- */
.skl-src {
  flex: none;
  font-size: 10px;
  line-height: 1.5;
  padding: 0 5px;
  border-radius: 4px;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}

.skl-src[data-src="reported"] {
  color: color-mix(in srgb, var(--skl-accent) 70%, var(--dsw-alias-label-secondary));
  background: color-mix(in srgb, var(--skl-accent) 10%, transparent);
}

/* ---- 详情 ---- */
.skl-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 2px;
  padding: 0 0 0 10px;
  border-left: 2px solid var(--skl-hair-2);
}

.skl-field {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.skl-field > b {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-caption);
}

.skl-field > span {
  font-size: 12px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ---- 总账 ---- */
.skl-ledger {
  margin: 16px 0 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-ledger-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  flex-wrap: wrap;
}

.skl-ledger-phase {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--skl-accent) 72%, var(--dsw-alias-label-secondary));
}

.skl-ledger-todos {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-ledger-summary {
  font-size: 12.5px;
  line-height: 1.62;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-ledger-items {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 12px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}

.skl-ledger-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.skl-ledger-item::before {
  content: '';
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--skl-hair-2);
}

/* ---- 空状态 ---- */
.skl-idle {
  margin: 14px 0 0;
  padding: 10px 11px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  overflow-wrap: anywhere;
  flex: none;
}

/* ---- 三张门 ---- */
.skl-door {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-door-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.skl-door-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.skl-door[data-door="ask"] .skl-door-title { color: var(--dsw-alias-label-secondary); }
.skl-door[data-door="steer"] .skl-door-title { color: color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, var(--dsw-alias-label-secondary)); }
.skl-door[data-door="stop"] .skl-door-title { color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 84%, var(--dsw-alias-label-secondary)); }

.skl-door-note {
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-caption);
  overflow-wrap: anywhere;
}

.skl-input-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex-wrap: wrap;
}

.skl-input {
  flex: 1 1 120px;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid var(--skl-hair-2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  outline: none;
  transition: border-color .18s ease;
}

.skl-input::placeholder { color: var(--dsw-alias-label-caption); }
.skl-input:focus { border-color: var(--skl-accent); }

.skl-btn {
  flex: none;
  padding: 5px 11px;
  border: 1px solid var(--skl-hair-2);
  border-radius: 7px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: color .18s ease, background .18s ease, border-color .18s ease;
}

.skl-btn:hover:not([disabled]) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.skl-btn[disabled] { opacity: .4; cursor: default; }

.skl-btn[data-tone="stop"] { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); }
.skl-btn[data-tone="stop"]:hover:not([disabled]) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }

.skl-btn[data-tone="stop"][data-armed="true"] {
  color: var(--dsw-alias-bg-base);
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}

/* ---- 回答 / 报告 / 提示 ---- */
.skl-answer {
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-2);
}

.skl-report > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }

.skl-report b {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-caption);
}

.skl-report span {
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-note {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-caption);
  overflow-wrap: anywhere;
}

.skl-note[data-tone="bad"] { color: var(--dsw-alias-state-error-primary); }
.skl-note[data-tone="good"] { color: var(--dsw-alias-state-success-primary); }

/* ---- 窄栏 ---- */
@container (max-width: 215px) {
  .skl { padding: 13px 13px 20px; }
  .skl-head { gap: 8px; }
  .skl-head-text { gap: 4px; }
  .skl-lightword { font-size: 12px; }
  .skl-row-text { font-size: 12px; }
  .skl-row[data-key="doing"] .skl-row-text { font-size: 13px; }
  .skl-door-title { font-size: 12px; }
}

@keyframes skl-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: .45; }
}

/* ---- 减少动效 ---- */
@media (prefers-reduced-motion: reduce) {
  .skl-light[data-pulse="true"],
  .skl-ch {
    animation: none !important;
  }
  .skl-row, .skl-btn, .skl-input { transition: none; }
}`
    // ---------------------------------------------------------------------
    // Per-session store: one SSE connection, many subscribers, no polling.
    // ---------------------------------------------------------------------
    const stores = new Map()
    function createStore(sessionId) {
      let source = null
      let retry = null
      let closed = false
      let view = null
      let settings = { showLight: true, expandDetails: false }
      let connected = false
      const listeners = new Set()
      const emit = () => {
        for (const listener of listeners) {
          try {
            listener()
          } catch {
            /* a broken listener must not kill the fan-out */
          }
        }
      }
      const applyView = (next) => {
        if (next === null || typeof next !== 'object') return
        view = next
        emit()
      }
      const open = () => {
        if (closed || sessionId === '') return
        try {
          source = new EventSource(`${STREAM_PATH}?session=${encodeURIComponent(sessionId)}`)
        } catch {
          source = null
          return
        }
        source.onopen = () => {
          connected = true
          emit()
        }
        source.onerror = () => {
          connected = false
          emit()
          try {
            source.close()
          } catch {
            /* ignore */
          }
          source = null
          if (!closed) retry = setTimeout(open, 3000)
        }
        source.onmessage = (event) => {
          let frame = null
          try {
            frame = JSON.parse(event.data)
          } catch {
            return
          }
          if (frame === null || typeof frame !== 'object') return
          if (frame.type === 'snapshot') {
            if (frame.settings !== undefined && frame.settings !== null) settings = frame.settings
            applyView(frame.view)
            return
          }
          if (frame.type === 'view') {
            applyView(frame.view)
          }
        }
      }
      open()
      return {
        getView: () => view,
        getSettings: () => settings,
        isConnected: () => connected,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        /** Ask once over HTTP; also covers a browser where EventSource is blocked. */
        async refresh() {
          try {
            const response = await fetch(`${VIEW_PATH}?session=${encodeURIComponent(sessionId)}`)
            const payload = await response.json()
            if (payload?.ok === true) {
              if (payload.settings !== undefined) settings = payload.settings
              applyView(payload.view)
            }
          } catch {
            /* the stream will catch up */
          }
        },
        dispose() {
          closed = true
          if (retry !== null) clearTimeout(retry)
          try {
            source?.close()
          } catch {
            /* ignore */
          }
          source = null
          listeners.clear()
        },
      }
    }
    function storeFor(sessionId) {
      const existing = stores.get(sessionId)
      if (existing !== undefined) return existing
      const created = createStore(sessionId)
      stores.set(sessionId, created)
      return created
    }
    /** Subscribe to one session's view without re-creating it on every render. */
    function useLens(sessionId) {
      const [store] = React.useState(() => (sessionId === '' ? null : storeFor(sessionId)))
      const [snapshot, setSnapshot] = React.useState(() => ({
        view: store === null ? null : store.getView(),
        settings: store === null ? { showLight: true, expandDetails: false } : store.getSettings(),
        connected: store === null ? false : store.isConnected(),
      }))
      React.useEffect(() => {
        if (store === null) return undefined
        const sync = () => setSnapshot({
          view: store.getView(),
          settings: store.getSettings(),
          connected: store.isConnected(),
        })
        sync()
        const unsubscribe = store.subscribe(sync)
        // One HTTP read as a safety net; the stream supersedes it immediately.
        store.refresh()
        return unsubscribe
      }, [store])
      return snapshot
    }
    // ---------------------------------------------------------------------
    // Small pieces
    // ---------------------------------------------------------------------
    function language(ctx) {
      // Prefer the profile's bound locale; fall back to the built-in Chinese table
      // so a missing dictionary can never blank out the panel.
      let bound = null
      try {
        bound = ctx?.locale?.bind?.(NS) ?? null
      } catch {
        bound = null
      }
      return (key, params) => {
        let text = zh[key] ?? key
        if (bound !== null) {
          try {
            const resolved = bound(key)
            if (typeof resolved === 'string' && resolved !== '' && resolved !== key) text = resolved
          } catch {
            /* keep the built-in text */
          }
        }
        if (params !== undefined) {
          for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
        }
        return text
      }
    }
    function Light({ light, pulse, show }) {
      if (show !== true) return null
      return h('span', { className: 'skl-light', 'data-light': light, 'data-pulse': pulse ? 'true' : 'false' })
    }
    function Provenance({ source, t }) {
      const observed = source !== 'reported'
      return h('span', {
        className: 'skl-src',
        'data-src': observed ? 'observed' : 'reported',
        title: observed ? '来自真实的工具调用和结果' : '只有它自己的说法，没有工具证据',
      }, t(observed ? 'src.observed' : 'src.reported'))
    }
    function Detail({ details, t }) {
      const fields = [
      ['detail.why', details?.why],
      ['detail.saw', details?.saw],
      ['detail.result', details?.result],
      ['detail.adjust', details?.adjust],
    ].filter(([, value]) => typeof value === 'string' && value !== '')
      if (fields.length === 0) return null
      return h('div', { className: 'skl-detail' },
      ...fields.map(([key, value]) => h('div', { className: 'skl-field', key },
      h('b', null, t(key)),
      h('span', null, value))))
    }
    // The line being worked on lights up character by character, like a screen
    // writing it out. Re-keyed on the text so a new step types itself again.
    function Reveal({ text }) {
      const chars = Array.from(String(text ?? ''))
      return h('span', { className: 'skl-reveal' },
      ...chars.map((ch, index) => h('span', {
        className: 'skl-ch',
        key: `${index}-${ch}`,
        style: { animationDelay: `${Math.min(900, index * 34)}ms` },
      }, ch)))
    }
    function Row({ row, open, onToggle, t }) {
      const muted = row.key === 'next'
      const alive = row.key === 'doing'
      return h(React.Fragment, null,
      h('button', {
        type: 'button',
        className: 'skl-row',
        'data-key': row.key,
        'data-tone': muted ? 'muted' : 'normal',
        'aria-expanded': open ? 'true' : 'false',
        title: t('hint.clickHint'),
        onClick: onToggle,
      },
      h('span', { className: 'skl-row-head' },
      h('span', { className: 'skl-row-label' }, t(`row.${row.key}`)),
      h('span', { className: 'skl-row-line' },
      h('span', { className: 'skl-row-text' }, alive ? h(Reveal, { key: row.text, text: row.text }) : row.text),
      h(Provenance, { source: row.source, t })))),
      open ? h(Detail, { details: row.details, t }) : null)
    }
    // ---------------------------------------------------------------------
    // The heartbeat: real event beats, decaying in the browser between frames
    // ---------------------------------------------------------------------
    const PULSE_SLOTS = 24
    const PULSE_WINDOW_MS = 3000
    /**     * Re-render on a short timer while the agent is running, so the strip keeps     * decaying between server frames. Nothing polls the Host; this only recomputes     * the fade of beats we already have.     */
    function useTick(active) {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        if (!active) return undefined
        const timer = setInterval(() => force((value) => value + 1), 130)
        return () => clearInterval(timer)
      }, [active])
    }
    function pulseBars(beats, driftMs, running) {
      const bars = new Array(PULSE_SLOTS).fill(0)
      for (const age of beats) {
        const total = age + driftMs
        if (!(total >= 0) || total > PULSE_WINDOW_MS) continue
        const index = Math.min(PULSE_SLOTS - 1, Math.floor(((PULSE_WINDOW_MS - total) / PULSE_WINDOW_MS) * PULSE_SLOTS))
        bars[index] += 1
      }
      const peak = Math.max(1, ...bars)
      return bars.map((count) => {
        if (count === 0) return 0
        return 0.34 + 0.66 * Math.min(1, count / peak)
      })
    }
    let pulseUid = 0
    /**     * A waveform, not a bar chart. The curve is drawn from the same real beats:     * flat and low means "nothing landing", spikes mean tokens or tools landing.     * A quiet-but-running agent shows a flat line, which is exactly the reading.     */
    function Pulse({ view }) {
      const running = view?.running === true
      useTick(running)
      const uid = React.useMemo(() => `sklw${++pulseUid}`, [])
      const beats = Array.isArray(view?.beats) ? view.beats : []
      const stamp = typeof view?.updatedAt === 'number' ? view.updatedAt : Date.now()
      const drift = Math.max(0, Date.now() - stamp)
      const bars = pulseBars(beats, drift, running)
      const live = bars.some((value) => value > 0)
      // Silence while running still gets a slow travelling ripple: "on, but
      // nothing landing". It is clearly lower than a real beat, so a flat line
      // and a working line never look the same by accident.
      const tick = Date.now() / 1000
      const ripple = (phase) => (index) => {
        const sway = Math.sin(index * 0.62 + phase * 2.1) * 0.62
          + Math.sin(index * 0.27 - phase * 1.3) * 0.38
        return 0.20 + 0.20 * sway
      }
      const shaped = live
        ? bars
        : running
          ? bars.map((value, index) => ripple(tick)(index))
          : bars
      const ghost = live || !running ? null : bars.map((value, index) => ripple(tick - 0.42)(index))
      const W = 240
      const H = 56
      const flat = 0.1
      const project = (values) => values.map((value, index) => ({
        x: (index / Math.max(1, values.length - 1)) * W,
        y: H - (flat + value * 0.84) * H,
      }))
      const points = project(shaped)
      // Quadratic midpoints give a continuous curve out of 24 samples.
      const curve = (list) => {
        let path = `M ${list[0].x.toFixed(2)} ${list[0].y.toFixed(2)}`
        for (let index = 0; index < list.length - 1; index += 1) {
          const current = list[index]
          const next = list[index + 1]
          const midX = (current.x + next.x) / 2
          const midY = (current.y + next.y) / 2
          path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`
        }
        const tail = list[list.length - 1]
        return `${path} L ${tail.x.toFixed(2)} ${tail.y.toFixed(2)}`
      }
      const line = curve(points)
      const ghostLine = ghost === null ? null : curve(project(ghost))
      const area = `${line} L ${W} ${H} L 0 ${H} Z`
      // Where the pen sits: the loudest recent beat, or the breathing edge when
      // nothing has landed yet, so there is always something alive on screen.
      const peakValue = Math.max(...shaped)
      const head = live
        ? points[shaped.lastIndexOf(peakValue)]
        : { x: W * (0.5 + 0.42 * Math.sin(tick * 0.7)), y: points[0].y }
      return h('div', {
        className: 'skl-pulse',
        'data-alive': live ? 'true' : 'false',
        'data-running': running ? 'true' : 'false',
        'aria-hidden': 'true',
      },
      h('svg', {
        className: 'skl-wave',
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'none',
        focusable: 'false',
      },
      h('defs', null,
      h('linearGradient', { id: `${uid}-fill`, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', stopColor: 'currentColor', stopOpacity: '0.42' }),
      h('stop', { offset: '100%', stopColor: 'currentColor', stopOpacity: '0' })),
      h('linearGradient', { id: `${uid}-line`, x1: '0', y1: '0', x2: '1', y2: '0' },
      h('stop', { offset: '0%', stopColor: 'currentColor', stopOpacity: '0.28' }),
      h('stop', { offset: '70%', stopColor: 'currentColor', stopOpacity: '0.92' }),
      h('stop', { offset: '100%', stopColor: 'currentColor', stopOpacity: '1' }))),
      h('path', { className: 'skl-wave-area', d: area, fill: `url(#${uid}-fill)`, stroke: 'none' }),
      ghostLine === null
        ? null
        : h('path', { className: 'skl-wave-ghost', d: ghostLine, fill: 'none', stroke: 'currentColor' }),
      h('path', { className: 'skl-wave-line', d: line, fill: 'none', stroke: `url(#${uid}-line)` }),
      h('circle', { className: 'skl-wave-head', cx: head.x.toFixed(2), cy: head.y.toFixed(2), r: '1.9' })))
    }
    // ---------------------------------------------------------------------
    // The panel
    // ---------------------------------------------------------------------
    // The ledger. The three rows answer "what was the last step"; this answers
    // the question a customer actually asks — "how far along is the thing I
    // asked for, and what has it produced so far". The sentence carries the
    // meaning; the counters are the footnote.
    function Ledger({ progress, summary, t }) {
      if (progress == null) return null
      const items = Array.isArray(progress.items) ? progress.items : []
      const todos = progress.todos
      const text = typeof summary === 'string' ? summary : ''
      if (text === '' && items.length === 0 && todos == null) return null
      return h('div', { className: 'skl-ledger' },
      h('div', { className: 'skl-ledger-head' },
      h('span', { className: 'skl-ledger-phase' }, String(progress.phase ?? '')),
      todos == null
      ? null
      : h('span', { className: 'skl-ledger-todos' },
        t('ledger.todos').replace('{done}', String(todos.done)).replace('{total}', String(todos.total)))),
      text === '' ? null : h('div', { className: 'skl-ledger-summary' }, text),
      // 有总结句就不再把计数摆一遍 —— 同一件事说两遍是最吵的噪音。
      text !== '' || items.length === 0
      ? null
      : h('div', { className: 'skl-ledger-items' },
        ...items.map((item) => h('span', { className: 'skl-ledger-item', key: item.key }, item.text))))
    }
    function Body(props) {
      const sessionId = typeof props?.sessionId === 'string'
      ? props.sessionId
      : typeof props?.scope?.sessionId === 'string' ? props.scope.sessionId : ''
      const t = React.useMemo(() => language(props?.ctx), [props?.ctx])
      const { view, settings, connected } = useLens(sessionId)
      const [openRow, setOpenRow] = React.useState(() => (settings.expandDetails === true ? '*' : ''))
      // Configuration can arrive with the first frame; honour it once.
      const appliedDefault = React.useRef(false)
      React.useEffect(() => {
        if (appliedDefault.current) return
        if (view === null) return
        appliedDefault.current = true
        if (settings.expandDetails === true) setOpenRow('*')
      }, [view, settings.expandDetails])
      const [askText, setAskText] = React.useState('')
      const [askBusy, setAskBusy] = React.useState(false)
      const [askAnswer, setAskAnswer] = React.useState('')
      const [askNote, setAskNote] = React.useState('')
      const [steerText, setSteerText] = React.useState('')
      const [steerBusy, setSteerBusy] = React.useState(false)
      const [steerNote, setSteerNote] = React.useState('')
      const [steerTone, setSteerTone] = React.useState('')
      const [armed, setArmed] = React.useState(false)
      const [stopBusy, setStopBusy] = React.useState(false)
      const [stopReport, setStopReport] = React.useState(null)
      const [stopNote, setStopNote] = React.useState('')
      const rows = Array.isArray(view?.rows) ? view.rows : []
      const light = typeof view?.light === 'string' ? view.light : 'green'
      const running = view?.running === true
      const position = view?.position ?? { index: 1, total: 2 }
      const ratio = Math.max(0, Math.min(1, Number(position.index) / Math.max(1, Number(position.total))))
      const isOpen = (key) => openRow === '*' || openRow === key
      const toggle = (key) => setOpenRow((current) => {
        if (current === '*') return ''
        return current === key ? '' : key
      })
      const ask = async () => {
        const question = askText.trim()
        if (question === '' || askBusy) return
        setAskBusy(true)
        setAskNote('')
        setAskAnswer('')
        try {
          const response = await fetch(ASK_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, question }),
          })
          const payload = await response.json()
          if (payload?.ok === true) {
            setAskAnswer(String(payload.answer ?? ''))
            setAskText('')
          } else {
            setAskNote(typeof payload?.message === 'string' ? payload.message : t('ask.error'))
          }
        } catch {
          setAskNote(t('ask.error'))
        }
        setAskBusy(false)
      }
      const steer = async () => {
        const note = steerText.trim()
        if (note === '' || steerBusy) return
        setSteerBusy(true)
        setSteerNote('')
        setSteerTone('')
        try {
          const response = await fetch(STEER_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, text: note }),
          })
          const payload = await response.json()
          if (payload?.ok === true) {
            setSteerText('')
            setSteerNote(String(payload.message ?? ''))
            setSteerTone('good')
          } else {
            setSteerNote(typeof payload?.message === 'string' ? payload.message : t('error.title'))
            setSteerTone('bad')
          }
        } catch {
          setSteerNote(t('error.title'))
          setSteerTone('bad')
        }
        setSteerBusy(false)
      }
      const stop = async () => {
        if (!armed) {
          setArmed(true)
          setStopNote('')
          return
        }
        if (stopBusy) return
        setStopBusy(true)
        setStopNote('')
        try {
          const response = await fetch(STOP_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId }),
          })
          const payload = await response.json()
          if (payload?.ok === true) {
            setStopReport({
              kept: String(payload.kept ?? ''),
              aborted: String(payload.aborted ?? ''),
              next: String(payload.next ?? ''),
            })
          } else {
            setStopNote(typeof payload?.message === 'string' ? payload.message : t('error.title'))
          }
        } catch {
          setStopNote(t('error.title'))
        }
        setStopBusy(false)
        setArmed(false)
      }
      if (sessionId === '') {
        return h('div', { className: 'skl' }, h('div', { className: 'skl-idle' }, t('empty.noSession')))
      }
      return h('div', { className: 'skl', 'data-light': light },
      // ---- light + position ----
      h('div', { className: 'skl-head' },
      h(Light, { light, pulse: running, show: settings.showLight !== false }),
      h('span', { className: 'skl-head-text' },
      h('span', { className: 'skl-lightword' }, t(`light.${light}`)),
      h('span', { className: 'skl-pos' }, t('position', { index: position.index, total: position.total })))),
      h('div', { className: 'skl-progress' }, h('i', { style: { width: `${Math.round(ratio * 100)}%` } })),
      // ---- the heartbeat: last three seconds of real activity ----
      h(Pulse, { view }),
      // ---- the three lines ----
      rows.length === 0
      ? h('div', { className: 'skl-idle' }, t('conn.waiting'))
      : h('div', { className: 'skl-rows' },
      ...rows.map((row) => h(Row, {
        key: row.key,
        row,
        open: isOpen(row.key),
        onToggle: () => toggle(row.key),
        t,
      }))),
      // ---- the ledger: how far along, and what came out of it ----
      h(Ledger, { progress: view?.progress ?? null, summary: view?.summary ?? '', t }),
      // ---- idle note (never blank) ----
      view?.idle != null
      ? h('div', { className: 'skl-idle' }, String(view.idle.text ?? '') || t('idle.fallback'))
      : null,
      // ---- door 1: read-only explainer ----
      h('div', { className: 'skl-door', 'data-door': 'ask' },
      h('div', { className: 'skl-door-head' }, h('span', { className: 'skl-door-title' }, t('ask.title'))),
      h('div', { className: 'skl-door-note' }, t('ask.note')),
      h('div', { className: 'skl-input-row' },
      h('input', {
        className: 'skl-input',
        value: askText,
        placeholder: t('ask.placeholder'),
        onChange: (event) => setAskText(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void ask()
          }
        },
      }),
      h('button', {
        type: 'button',
        className: 'skl-btn',
        disabled: askBusy || askText.trim() === '',
        onClick: () => void ask(),
      }, askBusy ? t('ask.asking') : t('ask.cta'))),
      askAnswer === '' ? null : h('div', { className: 'skl-answer' }, askAnswer),
      askNote === '' ? null : h('div', { className: 'skl-note', 'data-tone': 'bad' }, askNote)),
      // ---- door 2: steer ----
      h('div', { className: 'skl-door', 'data-door': 'steer' },
      h('div', { className: 'skl-door-head' }, h('span', { className: 'skl-door-title' }, t('steer.title'))),
      h('div', { className: 'skl-door-note' }, t('steer.note')),
      h('div', { className: 'skl-input-row' },
      h('input', {
        className: 'skl-input',
        value: steerText,
        placeholder: t('steer.placeholder'),
        onChange: (event) => setSteerText(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void steer()
          }
        },
      }),
      h('button', {
        type: 'button',
        className: 'skl-btn',
        disabled: steerBusy || steerText.trim() === '',
        onClick: () => void steer(),
      }, steerBusy ? t('steer.sending') : t('steer.cta'))),
      steerNote === '' ? null : h('div', { className: 'skl-note', 'data-tone': steerTone === 'bad' ? 'bad' : 'good' }, steerNote)),
      // ---- door 3: stop ----
      h('div', { className: 'skl-door', 'data-door': 'stop' },
      h('div', { className: 'skl-door-head' }, h('span', { className: 'skl-door-title' }, t('stop.title'))),
      h('div', { className: 'skl-door-note' }, t('stop.note')),
      h('div', { className: 'skl-input-row' },
      h('button', {
        type: 'button',
        className: 'skl-btn',
        'data-tone': 'stop',
        'data-armed': armed ? 'true' : 'false',
        disabled: stopBusy,
        onClick: () => void stop(),
      }, stopBusy
      ? t('stop.stopping')
      : running
      ? (armed ? t('stop.confirm') : t('stop.cta'))
      : t('stop.cta')),
      armed
      ? h('button', {
        type: 'button',
        className: 'skl-btn',
        onClick: () => setArmed(false),
      }, t('stop.cancel'))
      : null),
      stopReport === null ? null : h('div', { className: 'skl-report' },
      h('div', null, h('b', null, t('stop.kept')), h('span', null, stopReport.kept)),
      h('div', null, h('b', null, t('stop.aborted')), h('span', null, stopReport.aborted)),
      h('div', null, h('b', null, t('stop.next')), h('span', null, stopReport.next))),
      stopNote === '' ? null : h('div', { className: 'skl-note', 'data-tone': 'bad' }, stopNote)),
      connected ? null : h('div', { className: 'skl-note' }, t('conn.lost')))
    }
    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------
    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        const t = language(ctx)
        ctx.effect(() => {
          const element = document.createElement('style')
          element.setAttribute('data-sidekick-lens', '')
          element.textContent = CSS
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'sidekick-lens: styles')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sidekick-lens: dictionaries')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => t('type.label'),
          guide: [{
            id: 'sidekick',
            order: 40,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
          }],
        }), 'sidekick-lens: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
        }, Body)), 'sidekick-lens: tab body')
        // Dropping the plugin should not leave live EventSources behind.
        ctx.effect(() => () => {
          for (const store of stores.values()) {
            try {
              store.dispose()
            } catch {
              /* ignore */
            }
          }
          stores.clear()
        }, 'sidekick-lens: connections')
      },
    }
  },})
