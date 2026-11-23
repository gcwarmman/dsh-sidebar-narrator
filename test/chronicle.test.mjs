/**
 * 总览：从头发生到当下。
 *
 * 用户的抱怨是「片段展现，读起来没头没尾」。根因不在措辞，在结构：
 * `recordRequest()` 过去把上一件事整个丢掉，43 件事只剩最后一件活着，
 * 面板只能给一串无主的孤句。这里钉住的是「一章必须读得出头、身、尾」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  buildChronicle,
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
        message: failed
          ? { isError: true, content: [{ type: 'text', text: 'boom' }] }
          : { content: [{ type: 'text', text: 'ok' }] },
        error: failed ? { code: 'E_TEST' } : null,
      },
    },
  ]
}

function says(text, at) {
  return { type: 'assistant/message', time: at, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] } } }
}

/** Replay a scripted operation and hand back the chronicle. */
function chronicleOf(events, now) {
  const state = createLensState('s')
  for (const event of events) applySessionEvent(state, event, event.time ?? T0)
  return buildChronicle(state, { now: now ?? T0 + 1_000_000 })
}

// ---------------------------------------------------------------------------
// 有头有尾
// ---------------------------------------------------------------------------

test('chronicle: each chapter opens with what was actually asked', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把侧栏加上战况时间线', T0 + 1000),
    ...step('edit', { file_path: '/app/lib/a.js' }, T0 + 2000),
    ask('再做计划对位', T0 + 5000),
    { type: 'tool/call', time: T0 + 6000, data: { turn: 1, step: 1, callId: 'r', name: 'read', arguments: '{"file_path":"/app/lib/b.js"}' } },
  ])
  assert.equal(chronicle.chapters.length, 2)
  assert.match(chronicle.chapters[0].ask, /战况时间线/)
  assert.match(chronicle.chapters[1].ask, /计划对位/)
})

test('chronicle: finished requests survive the next one', () => {
  // 这条是根因回归：以前 recordRequest 直接把上一件扔掉，历史里只剩 1 件。
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('第一件', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ask('第二件', T0 + 5000),
    ...step('edit', { file_path: '/app/b.js' }, T0 + 6000),
    ask('第三件', T0 + 9000),
    ...step('edit', { file_path: '/app/c.js' }, T0 + 10000),
  ])
  // 三件都在：两件已结束 + 一件正在做。
  assert.equal(chronicle.chapters.length, 3)
  assert.equal(chronicle.total, 3)
  assert.equal(chronicle.chapters[2].live, true)
})

test('chronicle: the live request is a chapter too, so "当下" is not missing', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('正在办的事', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
  ])
  const live = chronicle.chapters.find((chapter) => chapter.live)
  assert.ok(live, '当下必须也占一章')
  assert.match(live.ask, /正在办的事/)
  assert.match(live.outcome, /改完|验证|看/)
})

test('chronicle: a chapter says what happened, not just that something did', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改掉它', T0 + 1000),
    ...step('edit', { file_path: '/app/lib/a.js' }, T0 + 2000),
    ...step('bash', { command: 'node --test' }, T0 + 3000),
  ])
  const chapter = chronicle.chapters[0]
  assert.equal(chapter.happened.length > 0, true)
  const texts = chapter.happened.map((beat) => beat.text).join(' ')
  assert.match(texts, /改/)
  assert.match(texts, /跑/)
})

test('chronicle: a failed verification is reported as blocked, not as "not run"', () => {
  // 真实 bug：改完跑挂了，却说「做完了但改完没再跑过验证」——把失败说成遗忘。
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改完跑测试', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ...step('bash', { command: 'node --test' }, T0 + 3000, true),
    ask('换下一件', T0 + 6000),
    ...step('read', { file_path: '/app/b.js' }, T0 + 7000),
  ])
  const first = chronicle.chapters[0]
  assert.equal(first.status, 'done-blocked')
  assert.match(first.outcome, /没过/)
  assert.doesNotMatch(first.outcome, /没再跑过/)
})

test('chronicle: a run that passed is not reported as unverified', () => {
  // 真实 bug：全局 lastRun 被下一件事覆盖后，历史章节的「验过」被读成了「没验」。
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改完跑测试', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ...step('bash', { command: 'node --test' }, T0 + 3000),
    ask('换下一件', T0 + 6000),
    ...step('edit', { file_path: '/app/b.js' }, T0 + 7000),
    ...step('bash', { command: 'node --test' }, T0 + 8000, true),
  ])
  const first = chronicle.chapters[0]
  assert.equal(first.status, 'done')
  assert.match(first.outcome, /都通过/)
})

test('chronicle: a success is never narrated as abandoned', () => {
  // 「你换下一件事了，这件就先停在这」挂在一次验证全过的收尾上，
  // 是把成功写成半途而废。
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改完跑测试', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ...step('bash', { command: 'node --test' }, T0 + 3000),
    ask('换下一件', T0 + 6000),
  ])
  assert.equal(chronicle.chapters[0].ending, '')
})

test('chronicle: an unfinished request the user walked away from says so', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改完它', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ask('算了先做别的', T0 + 6000),
  ])
  // 改了但没验证 = 没走完，读者有权知道它是被打断的。
  assert.match(chronicle.chapters[0].ending, /没走完|还没/)
})

// ---------------------------------------------------------------------------
// 它自己说的话是这一章的收尾语
// ---------------------------------------------------------------------------

test('chronicle: the last thing it said closes the chapter', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('修掉那个 bug', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    says('已经修好了，测试也过了。', T0 + 3000),
    ask('下一件', T0 + 6000),
  ])
  assert.match(chronicle.chapters[0].lastSaid, /修好了/)
})

// ---------------------------------------------------------------------------
// 总账
// ---------------------------------------------------------------------------

test('chronicle: the tally answers "how is the whole operation going"', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('a', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ...step('bash', { command: 'node --test' }, T0 + 3000),
    ask('b', T0 + 6000),
    ...step('edit', { file_path: '/app/b.js' }, T0 + 7000),
    ...step('bash', { command: 'node --test' }, T0 + 8000, true),
    ask('c', T0 + 11000),
    ...step('read', { file_path: '/app/c.js' }, T0 + 12000),
  ])
  const tally = chronicle.tally
  assert.equal(tally.total, 3)
  assert.equal(tally.finished, 1)
  assert.equal(tally.blocked, 1)
  assert.equal(tally.open, 1)
})

test('chronicle: durations are per chapter, so "没头没尾" has a number', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('第一件', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ask('第二件', T0 + 60_000),
  ], T0 + 100_000)
  const first = chronicle.chapters[0]
  assert.equal(first.tookMs, 59_000)
  assert.equal(first.steps, 1)
})

test('chronicle: the panel actually receives it', () => {
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, ask('做一件事', T0 + 1000), T0 + 1000)
  const view = buildView(state, T0 + 2000)
  assert.equal(Array.isArray(view.chronicle.chapters), true)
  assert.equal(view.chronicle.chapters.length, 1)
})

test('chronicle: an empty session has no chapters and no invented ones', () => {
  const chronicle = chronicleOf([])
  assert.deepEqual(chronicle.chapters, [])
  assert.equal(chronicle.total, 0)
})

test('chronicle: a session whose history is out of the replay window says so', () => {
  // 真实踩出来的：面板标题写「43 件」，下面只列 1 行 —— 拿数字撑门面。
  // 回放窗口只覆盖很晚的一段，历史里攒不出 43 章，那就必须承认只看见一段。
  const state = createLensState('s')
  // 把「之前已经发生过 42 件」这件事直接摆在计数上，模拟 requestsBefore 的结果。
  state.requestCount = 42
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, ask('第 43 件', T0 + 1000), T0 + 1000)
  applySessionEvent(state, step('read', { file_path: '/app/a.js' }, T0 + 2000)[0], T0 + 2000)
  const chronicle = buildChronicle(state, { now: T0 + 5000 })
  // 一共 43 件是事实，能看见 1 件也是事实，两个都要留着。
  assert.equal(chronicle.total, 43)
  assert.equal(chronicle.chapters.length, 1)
  assert.equal(chronicle.unseen, 42)
})

test('chronicle: a fully replayed session has nothing unseen', () => {
  const chronicle = chronicleOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('第一件', T0 + 1000),
    ...step('edit', { file_path: '/app/a.js' }, T0 + 2000),
    ask('第二件', T0 + 5000),
  ])
  assert.equal(chronicle.unseen, 0)
  assert.equal(chronicle.total, 2)
})
