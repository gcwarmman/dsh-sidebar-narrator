/**
 * 三行的「头」和「尾」。
 *
 * 用户的判词是「已完成、正在做、下一步里的内容没头没尾」。三句都对，但都读不懂：
 * 不说是哪件事、那件事到了哪一步、走完这一步意味着什么。这里钉住的是——
 * 每一行都必须挂回同一件事，让三行连起来读成一段话。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  buildView,
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

function step(name, args, at, failed = false) {
  return [
    { type: 'tool/call', time: at, data: { turn: 1, step: 1, callId: `c${at}`, name, arguments: JSON.stringify(args) } },
    {
      type: 'tool/result', time: at + 500,
      data: {
        turn: 1, step: 1, callId: `c${at}`,
        message: failed ? { isError: true, content: [{ type: 'text', text: 'boom' }] } : { content: [{ type: 'text', text: 'ok' }] },
        error: failed ? { code: 'E_TEST' } : null,
      },
    },
  ]
}

function rowsOf(events, now = T0 + 100_000) {
  const state = createLensState('s')
  for (const event of events) applySessionEvent(state, event, event.time ?? T0)
  const view = buildView(state, now)
  return Object.fromEntries(view.rows.map((row) => [row.key, row]))
}

test('anchor: 已完成 names the request it belongs to', () => {
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把计划对位做出来', T0 + 1000),
    ...step('edit', { file_path: '/app/lib/client.js' }, T0 + 2000),
  ])
  // 「改完了「客户端」」单独看是准的，但读者不知道它属于哪件事。
  assert.match(rows.done.text, /第 1 件「把计划对位做出来」/)
  assert.match(rows.done.text, /改/)
})

test('anchor: 正在做 is pinned back to the same request', () => {
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把计划对位做出来', T0 + 1000),
    ...step('read', { file_path: '/app/lib/client.js' }, T0 + 2000),
  ])
  // 没有这句，读者会以为它又开了个新的坑。
  assert.match(rows.doing.text, /^还是这件，/)
})

test('anchor: 下一步 says what is still missing before it says what is next', () => {
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把计划对位做出来', T0 + 1000),
    ...step('edit', { file_path: '/app/lib/client.js' }, T0 + 2000),
  ])
  // 改了没验 —— 尾巴必须说「还差验证」，否则「下一步」是一句没有落点的话。
  assert.match(rows.next.text, /^这件还差/)
  assert.match(rows.next.text, /验证/)
})

test('anchor: a step from the previous request is never credited to the new one', () => {
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('第一件', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ask('第二件', T0 + 5000),
  ])
  // 新请求刚开口，手上这一步还是上一件的。说成第二件就是撒谎。
  assert.match(rows.done.text, /^上一件收尾时，/)
  assert.doesNotMatch(rows.done.text, /第 2 件/)
})

test('anchor: without a request the rows are left alone', () => {
  // 会话里还没有人提过事（冷启动、纯系统事件），没有可挂的锚点，就不该硬编一个。
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
  ])
  assert.doesNotMatch(rows.done.text, /第 \d+ 件/)
  assert.doesNotMatch(rows.doing.text, /还是这件/)
})

test('anchor: the three rows read as one paragraph, in order', () => {
  const rows = rowsOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把界面弄安静点', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
  ])
  // 头 → 身 → 尾：哪件事、现在在哪、还差什么。
  assert.match(rows.done.text, /第 1 件「把界面弄安静点」/)
  assert.match(rows.doing.text, /还是这件/)
  assert.match(rows.next.text, /这件还差/)
})
