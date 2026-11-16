/**
 * 布局验证台。
 *
 * 目的：验收标准第 7 条说「右侧边栏和文件 diff/终端同时打开时不挤爆、不横向滚动、
 * 文案不溢出」。真实 GUI 需要启动时打印的 token，自动化拿不到；但面板的样式和
 * 文案是纯数据驱动的，可以单独渲染出来量。
 *
 * 做法：从 lib/client.js 里抠出真实的 CSS（不复制、不改写，保证量的是真东西），
 * 用真实的 /view 数据拼出同样的 DOM 结构，写成 preview.html；再用浏览器在
 * 窄/中/宽三档宽度下量 scrollWidth 与 clientWidth。
 *
 * 用法：node test/preview.mjs [view.json]
 *   view.json 省略时向本机 Host 的 /__sidekick_lens/view 要一份真数据。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const SESSION = process.env.DSH_SESSION_ID ?? 'session-preview'
const VIEW_URL = `http://127.0.0.1:3080/__sidekick_lens/view?session=${encodeURIComponent(SESSION)}`

/** 抠出 client.js 里那段真实的 CSS 模板字符串。 */
function extractCss() {
  const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  const start = source.indexOf('const CSS = `')
  if (start < 0) throw new Error('lib/client.js: 找不到 `const CSS = `')
  const from = start + 'const CSS = `'.length
  // The CSS body contains no backticks, so the next one closes the template —
  // don't require it to start a line, the file has been reflowed before.
  const end = source.indexOf('`', from)
  if (end < 0) throw new Error('lib/client.js: CSS 模板没有闭合')
  return source.slice(from, end)
}

async function realView() {
  const response = await fetch(VIEW_URL)
  if (!response.ok) throw new Error(`view 返回 ${response.status}`)
  const payload = await response.json()
  return payload.view
}

const escape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const WORD = {
  done: '已完成', doing: '正在做', next: '下一步',
  why: '为什么做', saw: '看到了什么', result: '结果', adjust: '可以怎么调',
  observed: '已观察到', reported: '仅据汇报',
  click: '点一下展开',
  askTitle: '问解释助手',
  askNote: '只看不碰：单独问模型，不会给主 agent 发消息，也不改它要做的事。',
  askCta: '问',
  steerTitle: '告诉 Agent',
  steerNote: '不打断当前步骤：它做完手上这步，下一步才看得到。',
  steerCta: '发提醒',
  stopTitle: '先停一下',
  stopNote: '打断后已完成的内容会保留，它会说明中止了什么。',
  stopCta: '先停一下',
  lost: '断线了，正在重连…',
  light: { blue: '在读或搜', yellow: '在写或改', cyan: '在跑或测', green: '完成', red: '出错或卡住' },
}

function detailHtml(details) {
  const fields = [
    ['why', details.why], ['saw', details.saw], ['result', details.result], ['adjust', details.adjust],
  ].filter(([, value]) => typeof value === 'string' && value !== '')
  if (fields.length === 0) return ''
  return `<div class="skl-detail">${fields.map(([key, value]) =>
    `<div class="skl-field"><b>${WORD[key]}</b><span>${escape(value)}</span></div>`).join('')}</div>`
}

function rowHtml(row, open) {
  const tone = row.key === 'next' ? 'muted' : 'normal'
  const observed = row.source !== 'reported'
  return `
<button type="button" class="skl-row" data-key="${escape(row.key)}" data-tone="${tone}" aria-expanded="${open}" title="${WORD.click}">
  <span class="skl-row-head">
    <span class="skl-row-label">${WORD[row.key]}</span>
    <span class="skl-row-line">
      <span class="skl-row-text">${escape(row.text)}</span>
      <span class="skl-src" data-src="${observed ? 'observed' : 'reported'}" title="${observed ? '来自真实的工具调用和结果' : '只有它自己的说法，没有工具证据'}">${observed ? WORD.observed : WORD.reported}</span>
    </span>
  </span>
</button>${open ? detailHtml(row.details) : ''}`
}

const PULSE_SLOTS = 24
const PULSE_WINDOW_MS = 3000

/** 与 lib/client.js 的 pulseBars 同构，替身数据也要走同一条衰减逻辑。 */
function pulseBars(beats, driftMs) {
  const bars = new Array(PULSE_SLOTS).fill(0)
  for (const age of beats) {
    const total = age + driftMs
    if (!(total >= 0) || total > PULSE_WINDOW_MS) continue
    const index = Math.min(PULSE_SLOTS - 1, Math.floor(((PULSE_WINDOW_MS - total) / PULSE_WINDOW_MS) * PULSE_SLOTS))
    bars[index] += 1
  }
  const peak = Math.max(1, ...bars)
  return bars.map((count) => (count === 0 ? 0 : 0.34 + 0.66 * Math.min(1, count / peak)))
}

function pulseHtml(view) {
  const beats = Array.isArray(view.beats) ? view.beats : []
  const running = view.running === true
  const stamp = typeof view.updatedAt === 'number' ? view.updatedAt : Date.now()
  const bars = pulseBars(beats, Math.max(0, Date.now() - stamp))
  const alive = bars.some((value) => value > 0)
  // Same geometry as Pulse() in lib/client.js: 24 samples, quadratic midpoints.
  const W = 240
  const H = 44
  const flat = 0.1
  const points = bars.map((value, index) => ({
    x: (index / Math.max(1, bars.length - 1)) * W,
    y: H - (flat + value * 0.84) * H,
  }))
  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    line += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${((current.x + next.x) / 2).toFixed(2)} ${((current.y + next.y) / 2).toFixed(2)}`
  }
  const last = points[points.length - 1]
  line += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  const peakValue = Math.max(...bars)
  const head = alive ? points[bars.lastIndexOf(peakValue)] : last
  const inner = `
<svg class="skl-wave" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false">
<defs>
<linearGradient id="pw-fill" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="currentColor" stop-opacity="0.42"/>
<stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
</linearGradient>
<linearGradient id="pw-line" x1="0" y1="0" x2="1" y2="0">
<stop offset="0%" stop-color="currentColor" stop-opacity="0.28"/>
<stop offset="70%" stop-color="currentColor" stop-opacity="0.92"/>
<stop offset="100%" stop-color="currentColor" stop-opacity="1"/>
</linearGradient>
</defs>
<path class="skl-wave-area" d="${area}" fill="url(#pw-fill)" stroke="none"/>
<path class="skl-wave-line" d="${line}" fill="none" stroke="url(#pw-line)"/>
${alive ? `<circle class="skl-wave-head" cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="1.7"/>` : ''}
</svg>`
  return `<div class="skl-pulse" data-alive="${alive}" data-running="${running}" aria-hidden="true">${inner}</div>`
}

function doorHtml(kind, title, note, placeholder, cta) {
  return `
<div class="skl-door" data-door="${kind}">
  <div class="skl-door-head"><span class="skl-door-title">${title}</span></div>
  <div class="skl-door-note">${note}</div>
  <div class="skl-input-row">
    <input class="skl-input" placeholder="${placeholder}">
    <button type="button" class="skl-btn">${cta}</button>
  </div>
</div>`
}

function ledgerHtml(view) {
  const progress = view.progress
  if (progress == null) return ''
  const items = Array.isArray(progress.items) ? progress.items : []
  const todos = progress.todos
  if (items.length === 0 && (todos === undefined || todos == null)) return ''
  const todosHtml = todos == null ? '' : `<span class="skl-ledger-todos">清单 ${todos.done} / ${todos.total}</span>`
  const summaryHtml = typeof view.summary === 'string' && view.summary !== ''
    ? `<div class="skl-ledger-summary">${escape(view.summary)}</div>`
    : ''
  const itemsHtml = summaryHtml !== '' || items.length === 0
    ? ''
    : `<div class="skl-ledger-items">${items.map((item) => `<span class="skl-ledger-item">${escape(item.text)}</span>`).join('')}</div>`
  return `
<div class="skl-ledger">
  <div class="skl-ledger-head">
    <span class="skl-ledger-phase">${escape(progress.phase)}</span>
    ${todosHtml}
  </div>
  ${summaryHtml}
  ${itemsHtml}
</div>`
}

function page(view, { openRow = '' } = {}) {
  const position = view.position ?? { index: 1, total: 2 }
  const ratio = Math.max(0, Math.min(1, Number(position.index) / Math.max(1, Number(position.total))))
  const rows = (view.rows ?? []).map((row) =>
    rowHtml(row, openRow === '*' || openRow === row.key)).join('')
  const light = view.light ?? 'green'
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>sidekick-lens preview</title>
<style>
:root {
  --dsw-alias-bg-base: #16181c;
  --dsw-alias-bg-layer-1: #1b1e23;
  --dsw-alias-bg-layer-2: #23262c;
  --dsw-alias-label-primary: #e8eaee;
  --dsw-alias-label-secondary: #b6bcc6;
  --dsw-alias-label-tertiary: #949ba6;
  --dsw-alias-label-caption: #7d848f;
  --dsw-alias-border-l1: #2c3038;
  --dsw-alias-border-l2: #383d46;
  --dsw-alias-interactive-bg-hover: #272b32;
  --dsw-alias-state-success-primary: #4fa87a;
  --dsw-alias-state-error-primary: #cf6b6b;
  --dsw-alias-brand-primary: #6f9bd1;
}
html, body { margin: 0; padding: 0; height: 100%; background: var(--dsw-alias-bg-base); }
body { display: flex; }
#panel { width: 100%; height: 100%; }
${extractCss()}
.skl { height: 100%; }
</style></head>
<body><div id="panel">
<div class="skl" data-light="${escape(light)}">
  <div class="skl-head">
    <span class="skl-light" data-light="${escape(light)}" data-pulse="${view.running === true}"></span>
    <span class="skl-head-text">
      <span class="skl-lightword">${WORD.light[light] ?? ''}</span>
      <span class="skl-pos">第 ${position.index} / ${position.total} 步</span>
    </span>
  </div>
  <div class="skl-progress"><i style="width:${Math.round(ratio * 100)}%"></i></div>
  ${pulseHtml(view)}
  <div class="skl-rows">${rows}</div>
  ${ledgerHtml(view)}
  ${view.idle == null ? '' : `<div class="skl-idle">${escape(view.idle.text)}</div>`}
  ${doorHtml('ask', WORD.askTitle, WORD.askNote, '这一步为什么这么做？它是不是卡住了？', WORD.askCta)}
  ${doorHtml('steer', WORD.steerTitle, WORD.steerNote, '那个文件先别改，先看看配置。', WORD.steerCta)}
  <div class="skl-door" data-door="stop">
    <div class="skl-door-head"><span class="skl-door-title">${WORD.stopTitle}</span></div>
    <div class="skl-door-note">${WORD.stopNote}</div>
    <div class="skl-input-row"><button type="button" class="skl-btn" data-tone="stop">${WORD.stopCta}</button></div>
  </div>
  ${view.error == null ? '' : `<div class="skl-note" data-tone="bad">${WORD.lost}</div>`}
</div>
</div></body></html>`
}

const view = process.argv[2] === undefined
  ? await realView()
  : JSON.parse(readFileSync(process.argv[2], 'utf8')).view ?? JSON.parse(readFileSync(process.argv[2], 'utf8'))

const collapsed = join(root, 'test', 'preview.html')
writeFileSync(collapsed, page(view), 'utf8')
const expanded = join(root, 'test', 'preview-expanded.html')
writeFileSync(expanded, page(view, { openRow: '*' }), 'utf8')

console.log('wrote', collapsed)
console.log('wrote', expanded)
console.log('rows:', (view.rows ?? []).map((row) => `${row.key}=${row.text}`).join(' | '))
console.log('light:', view.light, '| running:', view.running, '| position:', JSON.stringify(view.position))
