/**
 * 部队编制：一棵树的读数。
 *
 * 面板以前把子 agent 当成一次工具调用（「派了个小助手去」），从来没读过那个
 * 子会话自己的日志 —— 于是指挥官看着一个兵，管这叫全局。这些测试钉住三件事：
 * 一个子队长什么样、没有子队时不能凭空长出来、以及它交的差要和对位一致。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySessionEvent,
  buildTree,
  buildView,
  createLensState,
} from '../lib/narrative.js'

const T0 = 1_700_000_000_000

function stateOf(events, id = 'child') {
  const state = createLensState(id)
  for (const event of events) applySessionEvent(state, event, event.time ?? T0)
  return state
}

function readStep(at, step) {
  return [
    {
      type: 'tool/call', time: at,
      data: { turn: 1, step, callId: `r${step}`, name: 'read', arguments: '{"file_path":"/app/lib/a.js"}' },
    },
    {
      type: 'tool/result', time: at + 1,
      data: { turn: 1, step, callId: `r${step}`, message: { content: [{ type: 'text', text: 'ok' }] } },
    },
  ]
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

/** 一个子队的完整快照：state + 它自己的 view（树要读那一行「正在做」）。 */
function child(state, id = 'child') {
  return { state, view: buildView(state, T0 + 100), children: [] }
}

test('tree: no children means no tree, not an empty box', () => {
  assert.deepEqual(buildTree([], () => null), [])
  assert.deepEqual(buildTree(undefined, () => null), [])
})

test('tree: a squad is described in the same words its own panel uses', () => {
  const worker = stateOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'user/message', time: T0 + 5, data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text: '查一下接口' }] } } },
    ...readStep(T0 + 10, 1),
  ])
  worker.running = true
  const tree = buildTree(['child'], () => child(worker), { now: T0 + 50 })
  assert.equal(tree.length, 1)
  const squad = tree[0]
  assert.equal(squad.sessionId, 'child')
  assert.equal(squad.running, true)
  assert.equal(squad.status, 'working')
  // 措辞来自它自己那一行，不是另起一套。
  const own = buildView(worker, T0 + 50).rows.find((row) => row.key === 'doing').text
  assert.equal(squad.doing, own.replace(/[。！？]$/, ''))
  assert.equal(squad.doing.endsWith('。'), false)
})

test('tree: a squad that landed work reports what it landed', () => {
  const worker = stateOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'user/message', time: T0 + 5, data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text: '改掉它' }] } } },
    ...writeStep(T0 + 10, 1),
  ])
  const tree = buildTree(['child'], () => child(worker), { now: T0 + 50 })
  assert.equal(tree[0].steps, 1)
  assert.match(tree[0].landed, /文件|处/)
  assert.deepEqual(tree[0].files.length > 0, true)
})

test('tree: a squad that has not spoken yet still shows up with an honest blank', () => {
  // 刚开张的小队没有请求、没有产出。它必须出现（它确实被派出去了），
  // 但它的「交了什么」是空的，不能编。
  const fresh = createLensState('child')
  const tree = buildTree(['child'], () => child(fresh), { now: T0 })
  assert.equal(tree.length, 1)
  assert.equal(tree[0].landed, '')
  assert.equal(tree[0].steps, 0)
})

test('tree: a squad the host already dropped is skipped, not shown as a ghost', () => {
  const tree = buildTree(['gone'], () => null, { now: T0 })
  assert.deepEqual(tree, [])
})

test('tree: a lookup that throws does not take the whole tree down', () => {
  const worker = stateOf([{ type: 'turn/start', time: T0, data: { turn: 1 } }])
  const tree = buildTree(['boom', 'child'], (id) => {
    if (id === 'boom') throw new Error('gone')
    return child(worker)
  }, { now: T0 + 10 })
  assert.equal(tree.length, 1)
  assert.equal(tree[0].sessionId, 'child')
})

test('tree: grandchildren are counted, not expanded', () => {
  const worker = stateOf([{ type: 'turn/start', time: T0, data: { turn: 1 } }])
  const withKids = { state: worker, view: buildView(worker, T0), children: ['g1', 'g2'] }
  const tree = buildTree(['child'], () => withKids, { now: T0 + 10 })
  assert.equal(tree[0].grandchildren, 2)
  // 只有一条记录，说明这一层没有往下钻。
  assert.equal(tree.length, 1)
  assert.equal('tree' in tree[0], false)
})

test('tree: a failed squad carries the failure, not a cheerful summary', () => {
  const broken = stateOf([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    {
      type: 'tool/call', time: T0 + 10,
      data: { turn: 1, step: 1, callId: 'f1', name: 'bash', arguments: '{"command":"node --test"}' },
    },
    {
      type: 'tool/result', time: T0 + 11,
      data: { turn: 1, step: 1, callId: 'f1', message: { isError: true, content: [{ type: 'text', text: 'boom' }] }, error: { code: 'E_TEST' } },
    },
  ])
  const tree = buildTree(['child'], () => child(broken), { now: T0 + 20 })
  assert.equal(tree[0].failed, true)
  assert.equal(tree[0].light, 'red')
})
