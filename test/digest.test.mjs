/**
 * 问战况：解释助手能看到的，必须是「全局」。
 *
 * 以前它只拿到当下这一步的摘要，所以问「我的三支小队各自走到哪了」它答不出来 ——
 * 不是它笨，是它没被给到那部分事实。这些测试钉住摘要里该有什么。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  buildDigest,
  createLensState,
} from '../lib/narrative.js'

const T0 = 1_700_000_000_000

function ask(text, at) {
  return {
    type: 'user/message',
    time: at,
    data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text }] } },
  }
}

function writeStep(at, step, file = '/app/lib/a.js') {
  return [
    {
      type: 'tool/call', time: at,
      data: { turn: 1, step, callId: `w${step}`, name: 'edit', arguments: JSON.stringify({ file_path: file }) },
    },
    {
      type: 'tool/result', time: at + 1,
      data: { turn: 1, step, callId: `w${step}`, message: { content: [{ type: 'text', text: 'ok' }] } },
    },
  ]
}

test('digest: the explainer can see the operation as chapters, not loose beats', () => {
  // 「刚才为什么拐到这条路上」只能从「一件事一章」里回答，一串孤立的动作回答不了。
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, ask('把接口改一下', T0 + 5), T0 + 5)
  for (const event of writeStep(T0 + 20, 1)) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 30 })
  assert.match(digest, /整场：一共 \d+ 件/)
  assert.match(digest, /每一件事/)
  // 每一章必须带「它要的是什么」，否则下面发生什么都读不懂。
  assert.match(digest, /第 1 件「把接口改一下」/)
})

test('digest: the explainer knows whether a nudge was actually read', () => {
  const state = createLensState('s')
  state.pendingSteers = [
    { text: '那个文件先别改', full: '【侧边栏提醒】那个文件先别改', sentAt: T0, state: 'pending', readAt: 0 },
  ]
  const digest = buildDigest(state, { now: T0 + 10_000 })
  // 送达 ≠ 读到，摘要里必须分开说。
  assert.match(digest, /已送达，还没确认它读到/)
})

test('digest: a read nudge is reported as read', () => {
  const state = createLensState('s')
  state.pendingSteers = [
    { text: '先跑测试', full: '【侧边栏提醒】先跑测试', sentAt: T0, state: 'read', readAt: T0 + 5000 },
  ]
  const digest = buildDigest(state, { now: T0 + 10_000 })
  assert.match(digest, /它已经读到了/)
})

test('digest: the squads are handed over when the host supplies them', () => {
  // 子会话在纯函数层拿不到，由宿主折成文本递进来；递进来之后必须原样出现在摘要里。
  const state = createLensState('s')
  const digest = buildDigest(state, {
    now: T0,
    squads: '派出去的小队（2 支）：\n- 一支小队：查接口；现在在跑，改了 1 个文件',
  })
  assert.match(digest, /派出去的队/)
  assert.match(digest, /查接口/)
})

test('digest: no squads means no empty section', () => {
  const state = createLensState('s')
  const digest = buildDigest(state, { now: T0 })
  assert.doesNotMatch(digest, /派出去的队/)
})

test('digest: an empty squad string adds nothing', () => {
  const state = createLensState('s')
  const digest = buildDigest(state, { now: T0, squads: '' })
  assert.doesNotMatch(digest, /派出去的队/)
})
