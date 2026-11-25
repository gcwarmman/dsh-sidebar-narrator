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
      'type.label': '侧写',
      'guide.title': '侧写',
      'guide.description': '它现在在干嘛，一句话一行',
      'light.blue': '在读或搜',
      'light.yellow': '在写或改',
      'light.cyan': '在跑或测',
      'light.green': '完成',
      'light.red': '出错或卡住',
      'elapsed': '已用 {time}',
      'status.waiting': '等你回话',
      'ask.title': '问解释助手',
      'ask.note': '只看不碰：单独问模型，不会给主 agent 发消息，也不改它要做的事。',
      'ask.prefill': '当前正在做什么',
      'ask.placeholder': '敲一句想问的，会替换掉上面那句',
      'ask.cta': '问',
      'ask.asking': '想想…',
      'ask.error': '模型这次没给回话，再问一次试试。',
      'rec.title': 'AI 小管家记下的',
      'rec.count': '{n} 件',
      'rec.writing': '正在写…',
      'rec.empty': '还在等第一条。它做完点东西，模型会回来记一笔。',
      'rec.note': '只记做完的；模型随对话进程持续追加，不覆盖。',
      'steer.title': '告诉 Agent',
      'steer.note': '不打断当前步骤：它做完手上这步才会读到这条。',
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
      'error.title': '这边出了点问题',
      'tree.title': '派出去的队',
      'tree.count': '{n} 支',
      'tree.idle': '派出去的队现在都没在动。',
      'tree.steps': '走了 {n} 步',
      'tree.sub': '它还带着 {n} 支小队',
      'tree.failed': '这一支出过错',
    }
    const en = {
      'type.label': 'Sidekick',
      'guide.title': 'Sidekick',
      'guide.description': 'What it is doing right now, one line at a time',
      'light.blue': 'reading',
      'light.yellow': 'writing',
      'light.cyan': 'running',
      'light.green': 'done',
      'light.red': 'stuck',
      'elapsed': '{time} in',
      'status.waiting': 'needs your input',
      'ask.title': 'Ask the explainer',
      'ask.note': 'Read-only: a separate model. Sends nothing to the agent and changes nothing it does.',
      'ask.prefill': 'What is it doing right now?',
      'ask.placeholder': 'Type a question — it replaces the line above',
      'ask.cta': 'Ask',
      'ask.asking': 'thinking…',
      'ask.error': 'The model did not answer. Try once more.',
      'rec.title': 'What it has finished',
      'rec.count': '{n}',
      'rec.writing': 'writing…',
      'rec.empty': 'Waiting for the first entry. Once it finishes something, the model will add a line.',
      'rec.note': 'Finished work only. Appended as the conversation goes; nothing is overwritten.',
      'steer.title': 'Tell the agent',
      'steer.note': 'Does not interrupt: it reads this after the current step finishes.',
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
    'ledger.todos': 'checklist {done} / {total}',
    'ledger.plan': 'up next',
      'error.title': 'Something went wrong here',
      'tree.title': 'Squads',
      'tree.count': '{n}',
      'tree.idle': 'No squad is moving right now.',
      'tree.steps': '{n} steps in',
      'tree.sub': 'carries {n} more',
      'tree.failed': 'this one hit an error',
    }
    const CSS = `侧写 · 常规主题
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

.skl-elapsed {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

}

.skl-progress { display: none; }

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

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

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

}

}

}

}

}

}

}

}

}

}

}

}

.skl-tree {
  margin: 14px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-tree-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.skl-tree-title {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--skl-accent) 72%, var(--dsw-alias-label-secondary));
}

.skl-tree-count {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-squad {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid var(--skl-hair);
}

.skl-squad:last-child { border-bottom: none; }

.skl-squad-dot {
  flex: none;
  width: 5px;
  height: 5px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-label-caption);
}

.skl-squad[data-light="blue"] .skl-squad-dot { background: #5b8fd0; }
.skl-squad[data-light="yellow"] .skl-squad-dot { background: #c08b3e; }
.skl-squad[data-light="cyan"] .skl-squad-dot { background: #3f9c94; }
.skl-squad[data-light="green"] .skl-squad-dot { background: var(--dsw-alias-state-success-primary); }
.skl-squad[data-light="red"] .skl-squad-dot { background: var(--dsw-alias-state-error-primary); }

.skl-squad[data-running="true"] .skl-squad-dot {
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 14%, transparent);
}

.skl-squad-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.skl-squad-mission {
  font-size: 11px;
  line-height: 1.45;
  color: var(--dsw-alias-label-caption);
  overflow-wrap: anywhere;
  word-break: break-word;
  /* 一行就够：它是「这是哪一队」的标签，不是第二段正文。 */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skl-squad-doing {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-squad[data-running="false"] .skl-squad-doing { color: var(--dsw-alias-label-secondary); }

.skl-squad-meta {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-caption);
  overflow-wrap: anywhere;
}

.skl-squad[data-failed="true"] .skl-squad-meta { color: var(--dsw-alias-state-error-primary); }

.skl-receipts {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}

.skl-receipt {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  font-size: 11px;
  line-height: 1.5;
}

.skl-receipt-tag {
  flex: none;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 4px;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}

.skl-receipt[data-state="read"] .skl-receipt-tag {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
}

.skl-receipt[data-state="stale"] .skl-receipt-tag {
  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 82%, var(--dsw-alias-label-secondary));
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
}

.skl-receipt-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

}

.skl-rec {
  margin: 14px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-rec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.skl-rec-title {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--skl-accent) 72%, var(--dsw-alias-label-secondary));
}

.skl-rec-count {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-rec-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.skl-rec-item {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 0;
  border-bottom: 1px solid var(--skl-hair);
  min-width: 0;
}

.skl-rec-item:last-child { border-bottom: none; }

.skl-rec-n {
  flex: none;
  width: 14px;
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.skl-rec-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-rec-empty {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--dsw-alias-label-caption);
  padding: 6px 0;
  overflow-wrap: anywhere;
}

.skl-rec-note {
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  margin-top: 6px;
}

.skl-cancelled {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 8px;
  border-left: 2px solid var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
  overflow-wrap: anywhere;
  flex: none;
}

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

@container (max-width: 215px) {
  .skl { padding: 13px 13px 20px; }
  .skl-head { gap: 8px; }
  .skl-head-text { gap: 4px; }
  .skl-lightword { font-size: 12px; }
  .skl-row-text { font-size: 12px; }
  .skl-row[data-key="doing"] .skl-row-text { font-size: 13px; }
  .skl-door-title { font-size: 12px; }
}

}

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
    // The guide page draws a type's own glyph before its title; without one it
    // falls back to the built-in cube, which made 侧写 look like a placeholder
    // next to the shipped tabs. Three plain bars stacked in a frame, the middle
    // one lit — that is the product: a panel of three lines, one of them live.
    function SidekickGlyph({ size = 16, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        className,
      },
      h('rect', {
        x: 1.5,
        y: 2.2,
        width: 13,
        height: 11.6,
        rx: 2.8,
        stroke: 'currentColor',
        strokeWidth: 1.15,
        opacity: 0.6,
      }),
      h('rect', {
        x: 4.2,
        y: 4.7,
        width: 7.6,
        height: 1.4,
        rx: 0.7,
        fill: 'currentColor',
        opacity: 0.5,
      }),
      h('rect', {
        x: 4.2,
        y: 7.3,
        width: 7.6,
        height: 1.4,
        rx: 0.7,
        fill: 'var(--dsw-alias-brand-primary, currentColor)',
      }),
      h('rect', {
        x: 4.2,
        y: 9.9,
        width: 5.4,
        height: 1.4,
        rx: 0.7,
        fill: 'currentColor',
        opacity: 0.5,
      }))
    }
    function Light({ light, pulse, show }) {
      if (show !== true) return null
      return h('span', { className: 'skl-light', 'data-light': light, 'data-pulse': pulse ? 'true' : 'false' })
    }
    // Three sources, two colours. `inferred` is a reading of what just happened
    // (「读完了文件，接下来大概是动手改」) — it is not a tool result, but it is not the
    // agent's own claim either, so it stays in the neutral colour and says what it
    // is in words. Adding a third colour here would break the rule that the panel
    // has exactly one second colour, reserved for 仅据汇报.
    // ---------------------------------------------------------------------
    // The heartbeat: real event beats, decaying in the browser between frames
    // ---------------------------------------------------------------------
    const PULSE_SLOTS = 24
    const PULSE_WINDOW_MS = 3000
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
    /**     * 已用时长。挂在 updatedAt 上往前推，所以两帧之间它也在走 —— 参考 assistant-ui     * 的 AgentStatus：耗时只在 working / waiting 时显示，完成之后数字就没有意义了。     */
    function elapsedText(ms) {
      const total = Math.max(0, Math.round(Number(ms) / 1000))
      if (!Number.isFinite(total)) return ''
      if (total < 60) return `${total} 秒`
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return `${minutes} 分`
      const hours = Math.floor(minutes / 60)
      return `${hours} 小时`
    }
    function Elapsed({ view, t }) {
      const running = view?.running === true
      useTick(running)
      if (!running) return null
      const base = typeof view?.elapsedMs === 'number' ? view.elapsedMs : 0
      const stamp = typeof view?.updatedAt === 'number' ? view.updatedAt : Date.now()
      const live = base + Math.max(0, Date.now() - stamp)
      const text = elapsedText(live)
      return text === '' ? null : h('span', { className: 'skl-elapsed' }, t('elapsed', { time: text }))
    }
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
    // 「我提的这件事做到哪了」—— 用户要的进度就是这一块。
    //
    // 四段是这件事真实要经过的四步：看清 → 动手改 → 跑验证 → 过了。段数固定，
    // 亮到第几段完全由已观察到的事件决定（改过文件没有、改完跑过没有、跑的
    // 那次过没过），不是估计，也不是按工具调用数折算。
    //
    // 为什么不用百分比：43 件事、2244 次工具调用，算出来的百分比既没有定义，
    // 也不回答「我要的东西好了没有」。


    // ---------------------------------------------------------------------
    // 派出去的队
    // ---------------------------------------------------------------------

    function Tree({ view, t }) {
      const squads = Array.isArray(view?.tree) ? view.tree : []
      if (squads.length === 0) return null
      const anyRunning = squads.some((squad) => squad.running === true)
      return h('div', { className: 'skl-tree' },
      h('div', { className: 'skl-tree-head' },
      h('span', { className: 'skl-tree-title' }, t('tree.title')),
      h('span', { className: 'skl-tree-count' }, t('tree.count', { n: squads.length }))),
      anyRunning
        ? null
        : h('div', { className: 'skl-squad-meta' }, t('tree.idle')),
      ...squads.map((squad) => {
        // 详情行只留最有信息的一条：出错 > 走了几步 > 它带着几支小队。
        const bits = []
        if (squad.failed) bits.push(t('tree.failed'))
        if (squad.steps > 0) bits.push(t('tree.steps', { n: squad.steps }))
        if (squad.grandchildren > 0) bits.push(t('tree.sub', { n: squad.grandchildren }))
        return h('div', {
          className: 'skl-squad',
          key: squad.sessionId,
          'data-light': squad.light,
          'data-running': squad.running ? 'true' : 'false',
          'data-failed': squad.failed ? 'true' : 'false',
        },
        h('span', { className: 'skl-squad-dot' }),
        h('span', { className: 'skl-squad-body' },
        // 任务在上、动作在下：先认出这是哪一队（它被派去干什么），再看它此刻到哪了。
        squad.mission === ''
          ? null
          : h('span', { className: 'skl-squad-mission' }, squad.mission),
        h('span', { className: 'skl-squad-doing' }, squad.doing === '' ? t('conn.waiting') : squad.doing),
        bits.length === 0
          ? null
          : h('span', { className: 'skl-squad-meta' }, bits.join(' · '))))
      }))
    }
    // ---------------------------------------------------------------------
    // 提醒的回执
    // ---------------------------------------------------------------------
    const RECEIPT_TAG = {
      read: 'rc.read',
      pending: 'rc.pending',
      stale: 'rc.stale',
    }
    /**
     * What happened to each nudge.
     *
     * This exists because 「发出去了」 and 「它看到了」 are different facts and the
     * panel used to state only the first one. A commander who cannot tell
     * adopted from unread will re-send the same order, which is how a nudge
     * turns into noise.
     */
    function Receipts({ view, t }) {
      const list = Array.isArray(view?.receipts) ? view.receipts : []
      useTick(list.some((item) => item.state === 'pending'))
      if (list.length === 0) return null
      return h('div', { className: 'skl-receipts' },
      ...list.map((item, index) => h('div', {
        className: 'skl-receipt',
        key: `${item.sentAt}-${index}`,
        'data-state': item.state,
      },
      h('span', { className: 'skl-receipt-tag' }, t(RECEIPT_TAG[item.state] ?? 'rc.pending')),
      h('span', { className: 'skl-receipt-text' }, item.text))))
    }
    // ---------------------------------------------------------------------
    // 从开头到现在：编年史
    // ---------------------------------------------------------------------
    /** 一章的时长，粗粒度就够 —— 读者判断「大不大」，不需要毫秒。 */
    function tookText(ms) {
      const total = Math.max(0, Math.round(Number(ms) / 1000))
      if (!Number.isFinite(total) || total < 60) return '不到 1 分钟'
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return `${minutes} 分钟`
      return `${Math.floor(minutes / 60)} 小时`
    }
    /**
     * The operation as chapters, not as a feed.
     *
     * This block exists because a flat list of beats made the panel unreadable:
     * every line was an orphan, and the reader had to reconstruct which request
     * it belonged to and whether that request ever ended. Here each request is
     * one chapter — ask, outcome, and (on demand) the beats that produced it.
     *
     * Collapsed by default keeps the panel a glance; expanding a chapter is the
     * only way to see the individual beats, which is the right trade in a
     * 176px column.
     */

    function Records({ view, t }) {
      const entries = Array.isArray(view?.entries) ? view.entries : []
      const busy = view?.summarising === true
      useTick(busy)
      return h('div', { className: 'skl-rec' },
      h('div', { className: 'skl-rec-head' },
      h('span', { className: 'skl-rec-title' }, t('rec.title')),
      h('span', { className: 'skl-rec-count' }, busy ? t('rec.writing') : t('rec.count', { n: entries.length }))),
      entries.length === 0
        ? h('div', { className: 'skl-rec-empty' }, t('rec.empty'))
        : h('ol', { className: 'skl-rec-list' },
          ...entries.map((entry, index) => h('li', {
            className: 'skl-rec-item',
            key: `${entry.at}-${index}`,
          },
          h('span', { className: 'skl-rec-n' }, String(index + 1)),
          h('span', { className: 'skl-rec-text' }, entry.text)))),
      entries.length === 0
        ? null
        : h('div', { className: 'skl-rec-note' }, t('rec.note')))
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
      // 提问框的预填：一开始就填好「当前正在做什么」，用户点发送即可。
      // 用户一动手输入，预填内容就整段让位 —— 不保留、不拼接。
      const prefill = t('ask.prefill')
      const [askText, setAskText] = React.useState(() => prefill)
      const askPrefilled = React.useRef(true)
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
      // 等你回话：灯仍是青色，但词要换成「等你回话」—— 不看它它就永远停在那儿。
      const waiting = view?.status === 'waiting'
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
            // 问完把预填句式放回去：下次想说同一句话，仍然是一键。
            setAskText(prefill)
            askPrefilled.current = true
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
      // ---- light + how long ----
      h('div', { className: 'skl-head' },
      h(Light, { light, pulse: running, show: settings.showLight !== false }),
      h('span', { className: 'skl-head-text' },
      h('span', { className: 'skl-lightword' }, waiting ? t('status.waiting') : t(`light.${light}`)),
      h(Elapsed, { view, t }))),
      h('div', { className: 'skl-progress' }, h('i', { style: { width: `${Math.round(ratio * 100)}%` } })),
      // ---- the heartbeat: last three seconds of real activity ----
      h(Pulse, { view }),
      // ---- the record: what the model says has been finished, in order ----
      h(Records, { view, t }),
      // ---- the squads: who else is working on this ----
      h(Tree, { view, t }),
      // ---- a stopped turn says what survived it ----
      typeof view?.cancelNote?.text === 'string' && view.cancelNote.text !== ''
      ? h('div', { className: 'skl-cancelled' }, view.cancelNote.text)
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
        onChange: (event) => {
          const next = event.target.value
          // 预填期结束：用户改动了内容，就不再是那句话了。整段让位，
          // 不保留、也不把预填内容和新输入拼起来。
          if (askPrefilled.current) {
            askPrefilled.current = false
            // 若输入只是预填内容本身（例如点进去没敲字），保持原样。
            if (next === prefill) return
            setAskText(next === '' ? '' : next)
            return
          }
          setAskText(next)
        },
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
      h(Receipts, { view, t }),
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
            icon: SidekickGlyph,
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
