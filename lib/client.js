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
      'src.inferred': '推出来的',
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
      'position': '第 {index} / {total} 件',
      'elapsed': '已用 {time}',
      'status.waiting': '等你回话',
      'stage.look': '看清',
      'stage.change': '动手改',
      'stage.run': '跑验证',
      'stage.done': '过了',
      'stage.blocked': '没过',
      'request.progress': '{n} 件里的第 {n} 件',
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
      'ledger.plan': '接下来这些',
      'error.title': '这边出了点问题',
      'tl.title': '战况',
      'tl.collapse': '收起',
      'tl.expand': '展开全部',
      'tl.empty': '还没有可回看的动静。',
      'tl.dropped': '更早的 {n} 条已经滚出窗口。',
      'tl.more': '还有 {n} 条更早的。',
      'tl.you': '你',
      'tl.step': '做了',
      'tl.fail': '出岔子',
      'tl.say': '它说',
      'tl.plan': '它打算',
      'tl.turn': '分界',
      'tl.now': '刚刚',
      'tl.minutesAgo': '{n} 分钟前',
      'tl.hoursAgo': '{n} 小时前',
      'todo.active': '正在做',
      'todo.done': '做完了',
      'todo.open': '还没动',
      'todo.dropped': '不做了',
      'tree.title': '派出去的队',
      'tree.count': '{n} 支',
      'tree.idle': '派出去的队现在都没在动。',
      'tree.steps': '走了 {n} 步',
      'tree.sub': '它还带着 {n} 支小队',
      'tree.failed': '这一支出过错',
      'tree.open': '看它的战况',
      'rc.read': '它读到了',
      'rc.pending': '等它读',
      'rc.stale': '还没读到',
      'rc.title': '你发过的提醒',
      'rc.pendingNote': '发出去了，还没在它的日志里看到。',
      'rc.staleNote': '发了很久还没读到，可能卡在手上那一步里。',
      'chr.title': '从开头到现在',
      'chr.summary': '{done} 件办完 · {blocked} 件没过验证 · {open} 件还开着',
      'chr.more': '还有 {n} 件更早的',
      'chr.live': '正在办',
      'chr.beats': '发生过什么',
      'chr.said': '它最后说',
      'chr.steps': '{n} 步',
      'chr.expand': '展开',
      'chr.collapse': '收起',
      'chr.unseen': '这一场一共 {total} 件，从这里能看到第 {from} 件之后的。',
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
      'src.inferred': 'inferred',
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
      'position': 'request {index} of {total}',
      'elapsed': '{time} in',
      'status.waiting': 'needs your input',
      'stage.look': 'looking',
      'stage.change': 'changing',
      'stage.run': 'verifying',
      'stage.done': 'passed',
      'stage.blocked': 'failed',
      'request.progress': 'request {index} of {total}',
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
    'ledger.plan': 'up next',
      'error.title': 'Something went wrong here',
      'tl.title': 'Log',
      'tl.collapse': 'collapse',
      'tl.expand': 'show all',
      'tl.empty': 'Nothing has happened yet.',
      'tl.dropped': '{n} older entries rolled out of the window.',
      'tl.more': '{n} older entries not shown.',
      'tl.you': 'you',
      'tl.step': 'did',
      'tl.fail': 'failed',
      'tl.say': 'it said',
      'tl.plan': 'it plans',
      'tl.turn': 'turn',
      'tl.now': 'just now',
      'tl.minutesAgo': '{n}m ago',
      'tl.hoursAgo': '{n}h ago',
      'todo.active': 'doing',
      'todo.done': 'done',
      'todo.open': 'not started',
      'todo.dropped': 'dropped',
      'tree.title': 'Squads',
      'tree.count': '{n}',
      'tree.idle': 'No squad is moving right now.',
      'tree.steps': '{n} steps in',
      'tree.sub': 'carries {n} more',
      'tree.failed': 'this one hit an error',
      'tree.open': 'open its log',
      'rc.read': 'read',
      'rc.pending': 'waiting to be read',
      'rc.stale': 'not read yet',
      'rc.title': 'Your nudges',
      'rc.pendingNote': 'Sent, not seen in its log yet.',
      'rc.staleNote': 'Sent long ago and still unseen — it may be stuck in a long step.',
      'chr.title': 'From the start',
      'chr.summary': '{done} done · {blocked} failed verification · {open} open',
      'chr.more': '{n} older requests',
      'chr.live': 'in flight',
      'chr.beats': 'what happened',
      'chr.said': 'it last said',
      'chr.steps': '{n} steps',
      'chr.expand': 'expand',
      'chr.collapse': 'collapse',
      'chr.unseen': 'This session has {total} requests; only those after #{from} are visible here.',
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

.skl-elapsed {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
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
  /* The negative gutter lets a row's hover tint bleed past the panel padding so
     the tint edge lines up with the text. It must stay inside the 15px padding:
     -6px on each side plus a 6px inner padding used to leave the rows 3px wider
     than the panel, which produced a horizontal scrollbar at 176px. */
  margin: 10px 0 0;
  flex: none;
}

.skl-row-group {
  display: block;
  border-radius: 8px;
  transition: background .18s ease;
}

.skl-row {
  display: block;
  width: 100%;
  /* width:100% + horizontal padding overflowed the panel by 12px before this,
     which showed up as a horizontal scrollbar at the 176px split width. */
  box-sizing: border-box;
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

/* 推断：虚线底，看起来比「已观察到」虚、比「仅据汇报」冷 —— 不引入第三种颜色。 */
.skl-src[data-src="inferred"] {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
}

/* ---- 详情 ---- */
.skl-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 6px 8px;
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

/* ---- 进度条：这一件事走到哪一格 ----
   用户要的是「我提的这件事做到哪了」。五段是这件事真实要经过的五步：
   看清 → 动手改 → 跑验证 → 过了。段数固定，灯在哪段是事实，不是估计。 */
.skl-stages {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
}

.skl-stage {
  flex: 1 1 0;
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-label-caption) 20%, transparent);
}

.skl-stage[data-on="1"] {
  background: color-mix(in srgb, var(--skl-accent) 78%, var(--dsw-alias-label-secondary));
}

.skl-stage[data-on="1"][data-bad="1"] {
  background: #c96a6a;
}

.skl-stage-name {
  flex: none;
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-verdict {
  font-size: 12px;
  line-height: 1.58;
  color: var(--dsw-alias-label-secondary);
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}

/* 它自己列的计划：编号原样保留，因为顺序就是它打算做的顺序。 */
.skl-plan {
  margin-bottom: 6px;
}

.skl-plan-head {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--skl-hair-2);
  text-transform: none;
  margin-bottom: 3px;
}

.skl-plan-item {
  font-size: 11.5px;
  line-height: 1.62;
  color: var(--dsw-alias-label-secondary);
  padding-left: 11px;
  text-indent: -11px;
  overflow-wrap: anywhere;
}

.skl-plan-item::before {
  content: '·';
  margin-right: 5px;
  color: var(--skl-hair-2);
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

/* ---- 战况：往回看的那一块 ----
   三行是「此刻」，账本是「这件事」，战况是「刚才发生了什么」。
   没有盒子、没有底色：它是一条记录，不是第二张卡片。 */
.skl-log {
  margin: 16px 0 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-log-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.skl-log-title {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--skl-accent) 72%, var(--dsw-alias-label-secondary));
}

.skl-log-toggle {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  cursor: pointer;
}

.skl-log-toggle:hover { color: var(--dsw-alias-label-secondary); }

.skl-log-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* 高度不给死值，由条数决定：一条战报可能折成两行，用固定 max-height
     必然把最后一条切成半截，看起来像渲染坏了。条数在 Log 组件里截。 */
  max-height: none;
  overflow-x: hidden;
}

.skl-log-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.5;
}

.skl-log-kind {
  flex: none;
  width: 30px;
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 颜色只用来区分「谁说的」这件事本身，不新增一套配色：
   你和它的动作是正文色，它的口头承诺是唯一的第二种颜色。 */
.skl-log-item[data-kind="you"] .skl-log-kind { color: color-mix(in srgb, var(--skl-accent) 70%, var(--dsw-alias-label-secondary)); }
.skl-log-item[data-kind="fail"] .skl-log-kind { color: var(--dsw-alias-state-error-primary); }
.skl-log-item[data-src="reported"] .skl-log-text { color: color-mix(in srgb, var(--skl-accent) 62%, var(--dsw-alias-label-secondary)); }
.skl-log-item[data-kind="turn"] { opacity: .72; }

.skl-log-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* 重复次数：紧跟在原句后面，不单独占一行，也不加颜色 */
.skl-log-count {
  margin-left: 4px;
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-log-time {
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.skl-log-note {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  margin-top: 4px;
}

/* ---- 清单对位：哪条做完了、哪条正在做 ----
   它自己写的计划要和实际推进对上，否则那就是一张愿望清单。 */
.skl-plan-item[data-todo="done"] { opacity: .55; text-decoration: line-through; }
.skl-plan-item[data-todo="dropped"] { opacity: .45; }
.skl-plan-item[data-todo="active"] { color: var(--dsw-alias-label-primary); }
.skl-plan-item[data-todo="active"]::before { color: var(--skl-accent); content: '▸'; }

.skl-todo-tag {
  font-size: 9.5px;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 3px;
  color: var(--dsw-alias-label-caption);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  white-space: nowrap;
}

/* ---- 派出去的队：指挥官看的不该只有自己那一格 ----
   一个子 agent 是一整支队伍，不是一次工具调用。这里用和主面板同一套灯色与
   措辞，让它读起来是同一张图的延伸，而不是第二套术语。 */
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

/* 灯和主面板那盏一样：只有一盏颜色系统，不另起一套。 */
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

/* ---- 提醒回执：发出去了 ≠ 它看到了 ----
   三档，颜色只用主题的成/败色加中性色，不另起一套。 */
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

/* 读到了才是好消息；还没读到用中性色，不吓人也不邀功。 */
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

/* ---- 从开头到现在：编年史 ----
   这是「总览」。战况是一条条孤立的动作，编年史把每件事写成一章：问了什么 →
   做了什么 → 怎么收尾。没有这条主轴，再多条目也只是碎片。 */
.skl-chr {
  margin: 16px 0 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--skl-hair);
  flex: none;
}

.skl-chr-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.skl-chr-title {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--skl-accent) 72%, var(--dsw-alias-label-secondary));
}

.skl-chr-total {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 一句话战况：几件办完、几件没过、几件还开着。指挥官第一眼要的就是这个。 */
.skl-chr-summary {
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}

.skl-chr-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一章。左边一条竖线贯穿，表明这些都是同一条时间轴上的事。 */
.skl-chapter {
  position: relative;
  padding: 7px 0 7px 11px;
  border-left: 1px solid var(--skl-hair-2);
  min-width: 0;
}

.skl-chapter[data-live="true"] { border-left-color: var(--skl-accent); }

.skl-chapter:last-child { padding-bottom: 2px; }

.skl-chapter-head {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  cursor: pointer;
}

.skl-chapter-n {
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
}

/* 「它要的东西」永远是这一章的第一句 —— 没有它，下面发生什么都读不懂。 */
.skl-chapter-ask {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.skl-chapter[data-live="true"] .skl-chapter-ask { color: var(--dsw-alias-label-primary); font-weight: 500; }
.skl-chapter[data-live="false"] .skl-chapter-ask { color: var(--dsw-alias-label-secondary); }

.skl-chapter-flag {
  flex: none;
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 3px;
  white-space: nowrap;
  color: color-mix(in srgb, var(--skl-accent) 75%, var(--dsw-alias-label-secondary));
  background: color-mix(in srgb, var(--skl-accent) 12%, transparent);
}

/* 结局：一句话说这件事成没成。这是「有尾」。 */
.skl-chapter-outcome {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary);
  margin-top: 1px;
  overflow-wrap: anywhere;
}

.skl-chapter[data-status="done"] .skl-chapter-outcome,
.skl-chapter[data-status="verified"] .skl-chapter-outcome,
.skl-chapter[data-status="done-nothing"] .skl-chapter-outcome {
  color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 78%, var(--dsw-alias-label-secondary));
}

.skl-chapter[data-status="blocked"] .skl-chapter-outcome,
.skl-chapter[data-status="done-blocked"] .skl-chapter-outcome {
  color: var(--dsw-alias-state-error-primary);
}

/* 「没走完」这一行只在真的没走完时出现，所以它不必再加重语气。 */
.skl-chapter-ending {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-caption);
  margin-top: 1px;
  overflow-wrap: anywhere;
}

.skl-chapter-meta {
  font-size: 10px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skl-chapter-beats {
  margin: 3px 0 0;
  padding: 0 0 0 2px;
  list-style: none;
}

.skl-chapter-beat {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-caption);
  padding-left: 9px;
  text-indent: -9px;
  overflow-wrap: anywhere;
}

.skl-chapter-beat::before { content: '·'; margin-right: 4px; }

.skl-chapter-beat[data-kind="run"] { color: var(--dsw-alias-label-secondary); }
.skl-chapter-beat[data-kind="fail"] { color: var(--dsw-alias-state-error-primary); }

.skl-chapter[data-said] .skl-chapter-said {
  font-size: 10.5px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--skl-accent) 62%, var(--dsw-alias-label-secondary));
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.skl-chr-more {
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  margin-top: 6px;
}

/* ---- 被叫停 ---- */
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
    const SOURCE_TEXT = {
      observed: ['src.observed', '来自真实的工具调用和结果'],
      inferred: ['src.inferred', '根据上一步推出来的，不是工具结果'],
      reported: ['src.reported', '只有它自己的说法，没有工具证据'],
    }
    function Provenance({ source, t }) {
      const known = SOURCE_TEXT[source] ?? SOURCE_TEXT.inferred
      return h('span', {
        className: 'skl-src',
        'data-src': source === 'observed' ? 'observed' : source === 'reported' ? 'reported' : 'inferred',
        title: known[1],
      }, t(known[0]))
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
      // A div with role=button, not a real <button>: the detail block has to live
      // inside the clickable area, and a <div> inside a <button> gets hoisted out
      // by the parser, which silently threw the whole detail panel away.
      return h('div', {
        className: 'skl-row-group',
        'data-key': row.key,
      },
      h('div', {
        role: 'button',
        tabIndex: 0,
        className: 'skl-row',
        'data-key': row.key,
        'data-tone': muted ? 'muted' : 'normal',
        'data-open': open ? 'true' : 'false',
        'aria-expanded': open ? 'true' : 'false',
        title: t('hint.clickHint'),
        onClick: onToggle,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        },
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
    function Stages({ request, t }) {
      if (request == null) return null
      const status = String(request.status ?? '')
      // 段数固定四段，亮到第几段由状态直接决定：看着 → 1，改过 → 2，跑过 → 3，
      // 这轮结束 → 3。没有「改完了但没验证」单独一档 —— 那就是第 2 段，标签会说
      // 「跑验证」还差这一步。
      const reached = status === 'done' || status === 'done-unverified' || status === 'done-nothing' || status === 'verified'
        ? 3
        : status === 'changed' || status === 'changed-unverified' || status === 'blocked' ? 2 : 1
      const bad = status === 'blocked'
      const names = ['stage.look', 'stage.change', 'stage.run', 'stage.done']
      const label = bad ? t('stage.blocked') : t(names[reached])
      return h('div', { className: 'skl-stages' },
      ...[0, 1, 2, 3].map((i) => h('i', {
        key: `s${i}`,
        className: 'skl-stage',
        'data-on': i <= reached ? '1' : '0',
        'data-bad': bad && i >= reached - 1 ? '1' : '0',
      })),
      h('span', { className: 'skl-stage-name' }, label))
    }
    function Ledger({ progress, summary, request, checklist, checklistState, t }) {
      if (progress == null) return null
      const items = Array.isArray(progress.items) ? progress.items : []
      const todos = progress.todos
      const plan = Array.isArray(checklist) ? checklist : []
      // 计划条目 → 它的真实状态。只在条数对得上时按位置对位：清单是它一次
      // 写下来的，长度一致就说明是同一份；对不上就宁可不标，也不乱标。
      const states = Array.isArray(checklistState?.items) ? checklistState.items : []
      const aligned = checklistState != null && states.length === plan.length && checklistState.fresh !== false
      const text = typeof summary === 'string' ? summary : ''
      if (text === '' && items.length === 0 && todos == null && request == null && plan.length === 0) return null
      return h('div', { className: 'skl-ledger' },
      h('div', { className: 'skl-ledger-head' },
      h('span', { className: 'skl-ledger-phase' }, String(progress.phase ?? '')),
      todos == null
      ? null
      : h('span', { className: 'skl-ledger-todos' },
        t('ledger.todos').replace('{done}', String(todos.done)).replace('{total}', String(todos.total)))),
      h(Stages, { request, t }),
      // 这一件事的一句话结论：改了什么、验证过没有、还差什么。
      request != null && typeof request.verdict === 'string' && request.verdict !== ''
      ? h('div', { className: 'skl-verdict' }, request.verdict)
      : null,
      // 「有什么计划」——它自己在正文里列出来的那几条，原样给出来，不概括。
      // 每条带上它现在到哪一步了，否则这就是一张写完就没人管的愿望清单。
      plan.length === 0
      ? null
      : h('div', { className: 'skl-plan' },
        h('div', { className: 'skl-plan-head' }, t('ledger.plan')),
        ...plan.map((item, i) => {
          const status = aligned ? states[i].status : ''
          return h('div', {
            className: 'skl-plan-item',
            key: `${i}:${item}`,
            'data-todo': status,
          }, item, status === '' || status === 'open'
            ? null
            : h('span', { className: 'skl-todo-tag' }, t(`todo.${status}`)))
        })),
      text === '' ? null : h('div', { className: 'skl-ledger-summary' }, text),
      // 有总结句就不再把计数摆一遍 —— 同一件事说两遍是最吵的噪音。
      text !== '' || items.length === 0
      ? null
      : h('div', { className: 'skl-ledger-items' },
        ...items.map((item) => h('span', { className: 'skl-ledger-item', key: item.key }, item.text))))
    }
    // ---------------------------------------------------------------------
    // 战况：往回看的那一块
    // ---------------------------------------------------------------------
    /** 相对时间由客户端自己算：两帧之间它也在走，且不依赖服务端的钟准不准。 */
    function agoText(view, line, t) {
      const stamp = typeof view?.updatedAt === 'number' ? view.updatedAt : Date.now()
      const age = Math.max(0, (line.ageMs ?? 0) + Math.max(0, Date.now() - stamp))
      if (age < 60_000) return t('tl.now')
      const minutes = Math.floor(age / 60_000)
      if (minutes < 60) return t('tl.minutesAgo', { n: minutes })
      return t('tl.hoursAgo', { n: Math.floor(minutes / 60) })
    }
    const LOG_KIND = {
      you: 'tl.you',
      step: 'tl.step',
      fail: 'tl.fail',
      say: 'tl.say',
      plan: 'tl.plan',
      turn: 'tl.turn',
    }
    /**
     * The battle log.
     *
     * Collapsed by default to the last few lines — the sidebar shares its width
     * with a diff or a terminal, and a full-height history there would squeeze
     * the neighbours. Expanding is one click, and the expanded state is capped
     * and scrolls rather than pushing the doors off the bottom.
     */
    /** 收起看 4 条，展开看 12 条 —— 再多就不是「回看刚才」，而是翻档案。 */
    const LOG_PEEK = 4
    const LOG_FULL = 12
    function Log({ view, t }) {
      const lines = Array.isArray(view?.timeline) ? view.timeline : []
      const [open, setOpen] = React.useState(false)
      useTick(view?.running === true || open)
      if (lines.length === 0) return null
      const limit = open ? LOG_FULL : LOG_PEEK
      const shown = lines.slice(-limit)
      const dropped = typeof view?.timelineDropped === 'number' ? view.timelineDropped : 0
      const hidden = lines.length - shown.length + dropped
      // 倒序显示：最新的在最上面，读者不用先滚到底。服务端给的是正序，
      // 这里是纯展示反转，数据本身没变。
      const ordered = shown.slice().reverse()
      return h('div', { className: 'skl-log' },
      h('div', { className: 'skl-log-head' },
      h('span', { className: 'skl-log-title' }, t('tl.title')),
      lines.length <= LOG_PEEK && dropped === 0
      ? null
      : h('button', {
        type: 'button',
        className: 'skl-log-toggle',
        onClick: () => setOpen((value) => !value),
      }, open ? t('tl.collapse') : t('tl.expand'))),
      h('ul', { className: 'skl-log-list' },
      ...ordered.map((line, index) => h('li', {
        className: 'skl-log-item',
        key: `${line.at}-${index}`,
        'data-kind': line.kind,
        'data-src': line.source,
      },
      h('span', { className: 'skl-log-kind' }, t(LOG_KIND[line.kind] ?? 'tl.step')),
      h('span', { className: 'skl-log-text' }, line.text,
        line.count > 1
          ? h('span', { className: 'skl-log-count' }, `×${line.count}`)
          : null),
      h('span', { className: 'skl-log-time' }, agoText(view, line, t))))),
      // 还有多少条没显示，如实写出来：一段「从这里开始」的记录不能假装是全部。
      hidden > 0
      ? h('div', { className: 'skl-log-note' },
        open ? t('tl.dropped', { n: hidden }) : t('tl.more', { n: hidden }))
      : null)
    }
    // ---------------------------------------------------------------------
    // 派出去的队
    // ---------------------------------------------------------------------
    /**
     * The squads under this one.
     *
     * One line per child: what it is doing (in its own words), plus one detail
     * line. No expand/collapse chrome — a squad's own log belongs to its own
     * tab, and a commander reading this column wants the roll-up, not a second
     * scroll area nested inside the first.
     */
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
    function Chronicle({ view, t }) {
      const data = view?.chronicle ?? null
      const chapters = Array.isArray(data?.chapters) ? data.chapters : []
      const [openN, setOpenN] = React.useState(null)
      if (chapters.length === 0) return null
      const tally = data?.tally ?? { finished: 0, blocked: 0, open: 0, total: 0 }
      return h('div', { className: 'skl-chr' },
      h('div', { className: 'skl-chr-head' },
      h('span', { className: 'skl-chr-title' }, t('chr.title')),
      h('span', { className: 'skl-chr-total' }, `${data.total} 件`)),
      // 一句话战况在前：指挥官最先要知道的不是哪一章，而是整体怎么样。
      h('div', { className: 'skl-chr-summary' },
        t('chr.summary', {
          done: String(tally.finished),
          blocked: String(tally.blocked),
          open: String(tally.open),
        })),
      // 只看到一段的时候必须自己说出来。标题写「43 件」而下面只列一行，
      // 是拿数字撑门面 —— 读者会以为总览是全的。
      data.unseen > 0
        ? h('div', { className: 'skl-chr-more' },
          t('chr.unseen', { total: data.total, from: chapters[0].n }))
        : null,
      h('ul', { className: 'skl-chr-list' },
      ...chapters.map((chapter) => {
        const open = openN === chapter.n
        return h('li', {
          className: 'skl-chapter',
          key: `c${chapter.n}`,
          'data-live': chapter.live ? 'true' : 'false',
          'data-status': chapter.status,
          'data-beats': chapter.happened.length > 0 ? '1' : '0',
        },
        h('div', {
          className: 'skl-chapter-head',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': open ? 'true' : 'false',
          title: t(open ? 'chr.collapse' : 'chr.expand'),
          onClick: () => setOpenN(open ? null : chapter.n),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpenN(open ? null : chapter.n)
            }
          },
        },
        h('span', { className: 'skl-chapter-n' }, String(chapter.n)),
        // 这一句永远在最前面：它是这一章的标题，也是它存在的原因。
        h('span', { className: 'skl-chapter-ask' }, chapter.ask),
        chapter.live
          ? h('span', { className: 'skl-chapter-flag' }, t('chr.live'))
          : null),
        // 结局：成没成，一句话。
        h('div', { className: 'skl-chapter-outcome' }, chapter.outcome),
        // 没走完才说没走完；成功了这一行不出现，免得画蛇添足。
        chapter.ending === '' ? null
          : h('div', { className: 'skl-chapter-ending' }, chapter.ending),
        // 它自己的收尾语。这是它的话，已由 outcome 与 ending 区分开，
        // 不再单标来源——它就在「它最后说」这个标题下。
        chapter.lastSaid === '' ? null
          : h('div', { className: 'skl-chapter-said' }, `${t('chr.said')}：${chapter.lastSaid}`),
        h('div', { className: 'skl-chapter-meta' },
          [
            tookText(chapter.tookMs),
            t('chr.steps', { n: chapter.steps }),
            chapter.files.length > 0 ? chapter.files.join('、') : '',
          ].filter((part) => part !== '').join(' · ')),
        open && chapter.happened.length > 0
          ? h('ul', { className: 'skl-chapter-beats' },
            ...chapter.happened.map((beat, index) => h('li', {
              className: 'skl-chapter-beat',
              key: `${index}-${beat.at}`,
              'data-kind': beat.kind,
            }, beat.text)))
          : null)
      })),
      // 窗口里被掀掉的那些另说一句；「一共 43 件只看到 1 件」已经在上头说过了，
      // 同一个事实说两遍是最吵的噪音。
      data.unseen > 0 || data.dropped === 0
        ? null
        : h('div', { className: 'skl-chr-more' }, t('chr.more', { n: data.dropped }))
      )
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
      h('span', { className: 'skl-lightword' }, waiting ? t('status.waiting') : t(`light.${light}`)),
      h(Elapsed, { view, t }),
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
      // ---- the squads: who else is working on this ----
      h(Tree, { view, t }),
      // ---- the ledger: how far along, and what came out of it ----
      h(Ledger, { progress: view?.progress ?? null, summary: view?.summary ?? '', request: view?.request ?? null,
        checklist: view?.checklist ?? [], checklistState: view?.checklistState ?? null, t }),
      // ---- the battle log: what happened, in order, going back ----
      h(Log, { view, t }),
      // ---- a stopped turn says what survived it ----
      typeof view?.cancelNote?.text === 'string' && view.cancelNote.text !== ''
      ? h('div', { className: 'skl-cancelled' }, view.cancelNote.text)
      : null,
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
