/**
 * The battle log.
 *
 * The panel answered 「此刻在干什么」 well and could not answer 「刚才为什么拐到
 * 这条路上」 at all: `recent` kept the last eight steps as one compressed line each
 * and threw everything else away. These tests pin what goes in, what must stay
 * out, and the provenance that makes the whole log trustworthy.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  applyStream,
  buildChecklist,
  buildTimeline,
  buildView,
  createLensState,
} from '../lib/narrative.js'

const T0 = 1_700_000_000_000

function replay(events, options = {}) {
  const state = createLensState('session-timeline')
  for (const event of events) applySessionEvent(state, event, event.time ?? T0)
  return buildView(state, options.now ?? T0, options)
}

function stateOf(events) {
  const state = createLensState('session-timeline')
  for (const event of events) applySessionEvent(state, event, event.time ?? T0)
  return state
}

function ask(text, at) {
  return {
    type: 'user/message',
    time: at,
    data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text }] } },
  }
}

function says(text, at, step = 1) {
  return {
    type: 'assistant/message',
    time: at,
    data: { turn: 1, step, message: { content: [{ type: 'text', text }] } },
  }
}

function readStep(at, step) {
  return [
    {
      type: 'tool/call', time: at,
      data: { turn: 1, step, callId: `r${step}`, name: 'read', arguments: '{"file_path":"/app/src/a.ts"}' },
    },
    {
      type: 'tool/result', time: at + 1,
      data: { turn: 1, step, callId: `r${step}`, message: { content: [{ type: 'text', text: 'ok' }] } },
    },
  ]
}

function writeStep(at, step, file = '/app/src/a.ts') {
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

function failStep(at, step) {
  return [
    {
      type: 'tool/call', time: at,
      data: { turn: 1, step, callId: `f${step}`, name: 'bash', arguments: '{"command":"node --test"}' },
    },
    {
      type: 'tool/result', time: at + 1,
      data: { turn: 1, step, callId: `f${step}`, message: { isError: true, content: [{ type: 'text', text: 'test failed' }] }, error: { code: 'E_TEST' } },
    },
  ]
}

// ---------------------------------------------------------------------------
// 记什么
// ---------------------------------------------------------------------------

test('timeline: the user speaking opens the log, quoted', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把 README 改一下，别动代码', T0 + 5),
  ], { now: T0 + 10 })
  const lines = view.timeline.filter((line) => line.kind === 'you')
  assert.equal(lines.length, 1)
  assert.match(lines[0].text, /README 改一下/)
  // 时间戳是真的，不是第几步：用户要说「二十分钟前那次」，得有个钟点。
  assert.equal(lines[0].at, T0 + 5)
})

test('timeline: a finished step lands with its stamp and its age', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改一下', T0 + 5),
    ...writeStep(T0 + 20, 1),
  ], { now: T0 + 50 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 1)
  assert.equal(steps[0].at, T0 + 21)
  assert.equal(steps[0].ageMs, 29)
  assert.match(steps[0].text, /改/)
})

test('timeline: a failure is its own line, not mixed into the step stream', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('跑测试', T0 + 5),
    ...failStep(T0 + 20, 1),
  ], { now: T0 + 30 })
  const fails = view.timeline.filter((line) => line.kind === 'fail')
  assert.equal(fails.length, 1)
  assert.equal(fails[0].kind, 'fail')
})

test('timeline: a failed step never reads as a success', () => {
  // 真实踩出来的：失败那行走的是过去式动词，拼成「跑完测试了。」——
  // 把一次失败写成了一句庆祝。失败必须有它自己的说法。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('跑测试', T0 + 5),
    ...failStep(T0 + 20, 1),
  ], { now: T0 + 30 })
  const line = view.timeline.find((item) => item.kind === 'fail')
  assert.doesNotMatch(line.text, /跑完了|跑完测试了|做完了|改完了/)
  assert.match(line.text, /没做成|没过去|失败|错/)
})

test('timeline: what the agent announced is tagged reported, never observed', () => {
  // 战报里最容易骗人的位置就是这一行：它说的是它自己宣称做完了什么。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('做完它', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('已经改好了接口，剩一个边界情况没处理。', T0 + 25),
  ], { now: T0 + 30 })
  const said = view.timeline.filter((line) => line.kind === 'say')
  assert.equal(said.length, 1)
  assert.equal(said[0].source, 'reported')
})

test('timeline: a plan it wrote is a plan line, also reported', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('接着做', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('接下来补边界测试。', T0 + 25),
  ], { now: T0 + 30 })
  const plans = view.timeline.filter((line) => line.kind === 'plan')
  assert.equal(plans.length, 1)
  assert.equal(plans[0].source, 'reported')
  assert.match(plans[0].text, /补边界测试/)
})

test('timeline: token-by-token streaming never becomes log lines', () => {
  // 心跳波形回答「还在动吗」，战报回答「发生了什么」。混在一起就是调试日志。
  const state = stateOf([{ type: 'turn/start', time: T0, data: { turn: 1 } }])
  const before = buildTimeline(state, { now: T0 }).length
  for (let index = 0; index < 200; index += 1) {
    applyStream(state, { type: 'chunk', chunk: { type: 'text-delta', text: '字' } }, T0 + index)
  }
  assert.equal(buildTimeline(state, { now: T0 + 200 }).length, before)
})

// ---------------------------------------------------------------------------
// 不重复
// ---------------------------------------------------------------------------

test('timeline: five identical reads are one line, moved to the latest time', () => {
  const events = [{ type: 'turn/start', time: T0, data: { turn: 1 } }]
  for (let step = 1; step <= 5; step += 1) events.push(...readStep(T0 + step * 10, step))
  const view = replay(events, { now: T0 + 100 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 1)
  // 保留的是最后一次的时间：这件事实还在继续，不是五分钟前的旧闻。
  assert.equal(steps[0].at, T0 + 51)
})

test('timeline: a different action is a different line even on the same file', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改它', T0 + 5),
    ...readStep(T0 + 10, 1),
    ...writeStep(T0 + 20, 2),
  ], { now: T0 + 30 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 2)
})

// ---------------------------------------------------------------------------
// 有界
// ---------------------------------------------------------------------------

test('timeline: the log keeps its tail and admits what it dropped', () => {
  const events = [{ type: 'turn/start', time: T0, data: { turn: 1 } }]
  // 用用户发言来撑满：它们句句不同，不会被去重合并掉。
  for (let index = 1; index <= 260; index += 1) {
    events.push(ask(`第 ${index} 件事：把这个位置的边界情况处理一下`, T0 + index * 10))
  }
  const view = replay(events, { now: T0 + 4000 })
  assert.equal(view.timeline.length, 200)
  assert.equal(view.timelineDropped > 0, true)
  // 尾巴是新的那几条，不是开头的。
  assert.match(view.timeline[view.timeline.length - 1].text, /第 260 件事/)
})

test('timeline: renames that the language layer normalises still collapse', () => {
  // 二十次改文件落在同一个类别词上时，战报只该留下一条声音：
  // 「一直在改核心代码」是一件事，不是二十件。上限与去重并不冲突。
  const events = [{ type: 'turn/start', time: T0, data: { turn: 1 } }]
  for (let step = 1; step <= 20; step += 1) {
    events.push(...writeStep(T0 + step * 10, step, `/app/lib/mod${step}.js`))
  }
  const view = replay(events, { now: T0 + 400 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 1)
})

test('timeline: the same action on different objects still collapses, and counts', () => {
  // 真实踩出来的：一场会话里连着打了六个包，战报上就是六条一模一样的
  // 「版本整理好了「x」」——十二格里有九格是重复。同一个动作换个对象，
  // 事实还是一件，但次数是有用的信息，要留着。
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('打包发版', T0 + 5),
    ...writeStep(T0 + 10, 1, '/app/pkg-a.js'),
    ...writeStep(T0 + 20, 2, '/app/pkg-b.js'),
    ...writeStep(T0 + 30, 3, '/app/pkg-c.js'),
  ]
  const view = replay(events, { now: T0 + 50 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 1)
  assert.equal(steps[0].count, 3)
})

test('timeline: a different verb on the same object is a different beat', () => {
  // 「读完了 a」和「改完了 a」是两件事，不能因为对象被剥掉就并成一件。
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('看再改', T0 + 5),
    ...readStep(T0 + 10, 1),
    ...writeStep(T0 + 20, 2),
  ]
  const view = replay(events, { now: T0 + 30 })
  const steps = view.timeline.filter((line) => line.kind === 'step')
  assert.equal(steps.length, 2)
  assert.equal(steps[0].count, 1)
})

test('timeline: one occurrence carries no count noise', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('改一下', T0 + 5),
    ...writeStep(T0 + 20, 1),
  ], { now: T0 + 30 })
  const step = view.timeline.find((line) => line.kind === 'step')
  assert.equal(step.count, 1)
})

test('timeline: the log survives a replay, so a reloaded panel is not blind', () => {
  // 冷启动回放走的是同一条 applySessionEvent，所以战报要能重新长出来。
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('做这件事', T0 + 5),
    ...writeStep(T0 + 20, 1),
  ]
  const first = replay(events, { now: T0 + 30 })
  const second = replay(events, { now: T0 + 30 })
  assert.deepEqual(first.timeline, second.timeline)
  assert.equal(first.timeline.length >= 3, true)
})

// ---------------------------------------------------------------------------
// 计划对位
// ---------------------------------------------------------------------------

test('checklist state: what is done, what is live, what is still queued', () => {
  const state = stateOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('做完这些', T0 + 5),
    {
      type: 'todo/write', time: T0 + 10,
      data: {
        todos: [
          { status: 'completed', text: '读一遍现有代码' },
          { status: 'in_progress', text: '改旁白逻辑' },
          { status: 'pending', text: '补回归测试' },
        ],
      },
    },
    ...writeStep(T0 + 20, 1),
  ])
  state.running = true
  const checklist = buildChecklist(state)
  assert.equal(checklist.done, 1)
  assert.equal(checklist.total, 3)
  assert.deepEqual(checklist.items.map((item) => item.status), ['done', 'active', 'open'])
})

test('checklist state: a cancelled item is dropped, not left looking pending', () => {
  const state = stateOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    {
      type: 'todo/write', time: T0 + 10,
      data: {
        todos: [
          { status: 'cancelled', text: '这个不做了' },
          { status: 'pending', text: '改做这个' },
        ],
      },
    },
  ])
  // 它此刻没在跑，所以不能有哪一条被标成「正在做」。
  state.running = false
  const checklist = buildChecklist(state)
  assert.deepEqual(checklist.items.map((item) => item.status), ['dropped', 'open'])
})

test('checklist state: an idle agent has no item marked active', () => {
  // 「正在做」是个关于此刻的断言，它没在跑的时候不能占着这一格。
  const state = stateOf([
    { type: 'todo/write', time: T0 + 10, data: { todos: [{ status: 'pending', text: '补回归测试' }] } },
  ])
  state.running = false
  const checklist = buildChecklist(state)
  assert.deepEqual(checklist.items.map((item) => item.status), ['open'])
})

test('checklist state: a stale list never claims an item is in progress', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 5, data: { todos: [{ status: 'pending', text: '补回归测试' }] } },
  ]
  for (let step = 1; step <= 200; step += 1) events.push(...readStep(T0 + 5 + step, step))
  const state = stateOf(events)
  state.running = true
  const checklist = buildChecklist(state)
  assert.equal(checklist.fresh, false)
  assert.deepEqual(checklist.items.map((item) => item.status), ['open'])
})
