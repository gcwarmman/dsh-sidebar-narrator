/**
 * 提醒的回执。
 *
 * `agent.steer` 只保证消息落进信箱，不保证它被读过。「发出去了」和「它看到了」
 * 是两件事，面板以前只说了前一件，然后就没有下文 —— 指挥官分不清「它采纳了」
 * 和「它根本没看」。这些测试钉住这个区分，以及认错人的代价。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  buildReceipts,
  buildView,
  createLensState,
  matchSteer,
} from '../lib/narrative.js'

const T0 = 1_700_000_000_000

function ask(text, at) {
  return {
    type: 'user/message',
    time: at,
    data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text }] } },
  }
}

/** 面板发出去的那条提醒，与 index.js 里的 steerMessage 同构。 */
function withReceipt(state, text, sentAt, template = '【侧边栏提醒】') {
  state.pendingSteers = [
    ...(state.pendingSteers ?? []),
    { text, full: `${template}${text}`, sentAt, state: 'pending', readAt: 0 },
  ]
  return state
}

test('receipt: a sent nudge starts out pending, not read', () => {
  const state = withReceipt(createLensState('s'), '那个文件先别改', T0)
  const receipts = buildReceipts(state, T0 + 5_000)
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0].state, 'pending')
  assert.equal(receipts[0].waitedMs, 5_000)
})

test('receipt: it flips to read when the agent log carries that message', () => {
  const state = withReceipt(createLensState('s'), '那个文件先别改', T0)
  const changed = matchSteer(state, '【侧边栏提醒】那个文件先别改', T0 + 30_000)
  assert.equal(changed, true)
  const receipts = buildReceipts(state, T0 + 40_000)
  assert.equal(receipts[0].state, 'read')
  assert.equal(receipts[0].readAt, T0 + 30_000)
  assert.equal(receipts[0].waitedMs, 30_000)
})

test('receipt: the user saying the same words is not the agent reading the nudge', () => {
  // 用户自己又说了一遍同样的话，不等于它读了提醒。只有带模板前缀的那条算数。
  const state = withReceipt(createLensState('s'), '那个文件先别改', T0)
  const changed = matchSteer(state, '那个文件先别改', T0 + 30_000)
  assert.equal(changed, false)
  assert.equal(buildReceipts(state, T0 + 31_000)[0].state, 'pending')
})

test('receipt: a nudge nobody read eventually admits it does not know', () => {
  // 十分钟还没读到，面板不能再暗示「已送达等于已采纳」。
  const state = withReceipt(createLensState('s'), '先跑测试', T0)
  const receipts = buildReceipts(state, T0 + 11 * 60_000)
  assert.equal(receipts[0].state, 'stale')
})

test('receipt: two nudges are tracked separately', () => {
  const state = createLensState('s')
  withReceipt(state, '先做 A', T0)
  withReceipt(state, '再做 B', T0 + 1_000)
  matchSteer(state, '【侧边栏提醒】再做 B', T0 + 5_000)
  const receipts = buildReceipts(state, T0 + 6_000)
  assert.deepEqual(receipts.map((item) => item.state), ['pending', 'read'])
})

test('receipt: reading a nudge is not a new user request', () => {
  // 提醒被读到，以前会走进 recordRequest，把「第几件」凭空抬高一件 ——
  // 用户提的事没有变多，是同一件事里的一个指令。
  const state = withReceipt(createLensState('s'), '那个文件先别改', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0 - 100, data: { turn: 1 } }, T0 - 100)
  applySessionEvent(state, ask('把插件做完', T0 - 50), T0 - 50)
  const before = state.requestCount
  applySessionEvent(state, ask('【侧边栏提醒】那个文件先别改', T0 + 30_000), T0 + 30_000)
  assert.equal(state.requestCount, before)
})

test('receipt: reading a nudge shows up in the battle log as observed', () => {
  const state = withReceipt(createLensState('s'), '那个文件先别改', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0 - 100, data: { turn: 1 } }, T0 - 100)
  applySessionEvent(state, ask('把插件做完', T0 - 50), T0 - 50)
  applySessionEvent(state, ask('【侧边栏提醒】那个文件先别改', T0 + 30_000), T0 + 30_000)
  const view = buildView(state, T0 + 31_000)
  const line = view.timeline.find((item) => item.kind === 'steer')
  assert.ok(line, 'the log must carry the moment the nudge was read')
  // 它确实读到了，所以这条是观察到的事实，不是推测。
  assert.equal(line.source, 'observed')
  assert.match(line.text, /读到了你的提醒/)
})

test('receipt: the panel hands the receipts to the client', () => {
  const state = withReceipt(createLensState('s'), '先跑测试', T0)
  const view = buildView(state, T0 + 1_000)
  assert.equal(Array.isArray(view.receipts), true)
  assert.equal(view.receipts.length, 1)
  assert.equal(view.receipts[0].state, 'pending')
})

test('receipt: no nudges means an empty list, not a placeholder', () => {
  const view = buildView(createLensState('s'), T0)
  assert.deepEqual(view.receipts, [])
})
