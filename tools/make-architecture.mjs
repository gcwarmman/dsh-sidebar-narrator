#!/usr/bin/env node
/**
 * Render the plugin architecture as an SVG.
 *
 * Generated rather than hand-drawn: the boxes are the actual modules and the
 * routes are the actual paths, so the picture cannot quietly drift from the
 * code the way a hand-maintained diagram does.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const W = 1180
const H = 940
const BG = '#0f1216'
const PANEL = '#171b21'
const LINE = '#2a303a'
const TEXT = '#e6e9ee'
const DIM = '#9aa3af'
const FAINT = '#6b7480'
const ACCENT = '#5b8fd0'
const GREEN = '#4fa87a'
const RED = '#cf6b6b'
const AMBER = '#c9a26a'
const TEAL = '#3f9c94'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const out = []
const a = (s) => out.push(s)

a(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif">`)
a(`<rect width="${W}" height="${H}" fill="${BG}"/>`)

const box = (x, y, w, h, fill = PANEL, stroke = LINE, rx = 10) =>
  a(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`)
const txt = (x, y, s, size = 13, fill = TEXT, weight = '400', anchor = 'start') =>
  a(`<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`)
const arrow = (x1, y1, x2, y2, color = LINE, dash = null, width = 1.6, marker = 'ah') =>
  a(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#${marker})"/>`)

a('<defs>')
for (const [id, col] of [['ah', LINE], ['ahb', ACCENT], ['ahg', GREEN], ['ahr', RED], ['aha', AMBER]]) {
  a(`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${col}"/></marker>`)
}
a('</defs>')

// ---- title ----
txt(40, 52, 'dsh-sidekick-lens · 架构', 22, TEXT, '600')
txt(40, 76, '纯规则折叠：实时监测零模型调用；只有按「问」才调一次模型', 13, DIM)

// ============ 1. DSH Host ============
box(40, 104, 1100, 210)
txt(60, 132, '① DeepSeek Harness 宿主', 15, TEXT, '600')
txt(300, 132, '插件订阅这些事件（{ global: true }，含子会话）', 12, FAINT)

const events = [
  ['session/event', 'turn / step / tool / 用户消息 / todo'],
  ['agent/status', 'running / idle'],
  ['agent/error', '错误'],
  ['agent/assistant-stream', '流式 token（正文 + 思维链）'],
]
let ey = 152
for (const [name, note] of events) {
  box(60, ey, 470, 34, '#12161b')
  txt(74, ey + 22, name, 12.5, ACCENT)
  txt(240, ey + 22, note, 11.5, FAINT)
  ey += 40
}

box(560, 152, 250, 140, '#12161b')
txt(576, 174, '子会话（子 agent）', 12.5, TEAL)
txt(576, 196, '自己也是一个完整会话', 11, FAINT)
txt(576, 214, '父 id 来自', 11, FAINT)
txt(576, 231, 'session.header', 11, AMBER)
txt(576, 248, '  .parentSession', 11, AMBER)
txt(576, 274, '→ buildTree() 聚合成小队', 11, DIM)

box(840, 152, 280, 140, '#12161b')
txt(856, 174, 'llm · 只读通道', 12.5, AMBER)
txt(856, 196, '带 sessionId？', 11, DIM)
txt(1000, 196, '否 — 完全隔离', 11, GREEN)
txt(856, 214, '带 tools？', 11, DIM)
txt(1000, 214, '否 — 不碰主 agent', 11, GREEN)
txt(856, 240, 'maxTokens: 320', 11, FAINT)
txt(856, 262, '只在 /ask 里出现', 11, FAINT)

// host -> host half
a(`<path d="M 295 314 L 295 352" stroke="${ACCENT}" stroke-width="2" marker-end="url(#ahb)"/>`)
txt(305, 340, '事件流', 11, ACCENT)

// ============ 2. Host half ============
box(40, 352, 520, 254, PANEL, ACCENT)
txt(60, 380, '② lib/index.js — 宿主半', 15, TEXT, '600')
txt(60, 402, '唯一有 I/O 的一层：订阅事件、维护状态、开 HTTP 路由', 11.5, FAINT)

const hostSteps = [
  ['applySessionEvent()   事件 → state', TEXT],
  ['bucketFor(id)   sessionId → { state, children }', TEXT],
  ['buildView(state)  →  一帧 view', ACCENT],
  ['publish() · shouldPush() 节流 350ms + SSE', DIM],
]
let hy = 416
for (const [label, col] of hostSteps) {
  box(60, hy, 480, 40, '#12161b')
  txt(76, hy + 25, label, 12, col, col === ACCENT ? '500' : '400')
  hy += 46
}

// ============ 3. narrative (pure) ============
box(600, 352, 540, 254, '#12161b', TEAL)
txt(620, 380, '③ lib/narrative.js — 纯语言层', 15, TEXT, '600')
txt(620, 402, '无 I/O、无 ctx、无定时器 —— 所以 127 项测试能直接跑它', 11.5, FAINT)

const builders = [
  ['buildView', '三行 + 灯 + 位置', ACCENT],
  ['  anchorRows()', '给三行挂回所属请求', AMBER],
  ['buildChronicle', '总览：一件事一章', TEAL],
  ['buildTimeline', '战况：有序日志 ×N', DIM],
  ['buildTree', '派出去的队', TEAL],
  ['buildReceipts', '提醒：发了 ≠ 读了', AMBER],
  ['buildChecklist', '清单状态对位', DIM],
  ['buildDigest', '喂给「问」的摘要', AMBER],
]
let by = 420
for (const [name, note, col] of builders) {
  txt(632, by + 12, name, 11.5, col, '500')
  txt(800, by + 12, note, 11, FAINT)
  by += 22
}

// ============ 4. routes ============
box(40, 640, 520, 150, PANEL)
txt(60, 668, '④ 五条 HTTP 路由', 15, TEXT, '600')
txt(60, 690, '同源守卫 isCrossSite()：外站 Origin / cross-site 一律拒', 11.5, FAINT)
const routes = [
  ['/stream', 'SSE 推帧', GREEN],
  ['/view', '一次性快照', GREEN],
  ['/ask', '调模型（唯一花钱）', AMBER],
  ['/steer', 'steer 不打断', ACCENT],
  ['/stop', 'cancel 说清保留', RED],
]
let rx = 60
for (const [path, note, col] of routes) {
  box(rx, 704, 96, 64, '#12161b')
  txt(rx + 48, 726, path, 11.5, col, '500', 'middle')
  txt(rx + 48, 746, note, 9, FAINT, '400', 'middle')
  rx += 100
}

// ============ 5. client ============
box(600, 640, 540, 150, PANEL)
txt(620, 668, '⑤ lib/client.js — 客户端半', 15, TEXT, '600')
txt(620, 690, '原生右侧栏 tab（sidebarRightTabs + sidebar.right.pane.tab）', 11.5, FAINT)
const panels = [['三行', ACCENT], ['战况', DIM], ['部队', TEAL], ['清单', DIM], ['回执', AMBER], ['三张门', ACCENT]]
let px = 620
for (const [name, col] of panels) {
  box(px, 704, 80, 34, '#12161b')
  txt(px + 40, 726, name, 12, col, '500', 'middle')
  px += 86
}
txt(620, 764, 'EventSource 读 /stream；按钮 fetch 四条门；从不碰会话控制器', 11, FAINT)

// ============ links ============
arrow(560, 470, 600, 470, ACCENT, null, 2, 'ahb')
txt(580, 462, '调', 10, ACCENT, '500', 'middle')

arrow(300, 606, 300, 640, GREEN, null, 1.6, 'ahg')
txt(310, 630, 'view', 10, GREEN)

arrow(400, 640, 400, 606, ACCENT, '4 3', 1.6, 'ahb')
txt(410, 630, '请求', 10, ACCENT)

arrow(600, 712, 560, 712, ACCENT, '4 3', 1.6, 'ahb')
arrow(560, 744, 600, 744, GREEN, null, 2, 'ahg')

// ============ cost footer ============
box(40, 810, 1100, 96, '#12161b', GREEN)
txt(60, 836, 'token 账', 14, GREEN, '600')
const costs = [
  ['实时监测 / 三行 / 战况 / 部队 / 回执', '0'],
  ['按「问」一次（digest≈1.0k + 输出上限）', '≈1.4k'],
  ['不按「问」', '0'],
]
let cx = 60
for (const [label, value] of costs) {
  txt(cx, 862, label, 11.5, DIM)
  txt(cx, 886, `${value} token`, 13, value === '0' ? GREEN : AMBER, '600')
  cx += 360
}

txt(40, 932, '203 项测试 · 176–460px 零横向溢出 · v0.2.0', 11, FAINT)

a('</svg>')
mkdirSync('docs', { recursive: true })
const svg = out.join('\n')
writeFileSync('docs/architecture.svg', svg, 'utf8')
console.log('wrote docs/architecture.svg', svg.length, 'bytes')
