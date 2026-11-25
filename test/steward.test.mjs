/**
 * AI 小管家：模型写总结的那一层。
 *
 * 这一层替换掉了「按规则拼接文案」。它的承诺只有三条，全部在这里钉住：
 *   1. 只记做完的事 —— 计划、待办、进行中一律不许进记录；
 *   2. 只增不改 —— 已写下的永远留着，可以往回翻；
 *   3. 该不该问由节奏决定 —— 不是每个事件都调一次模型。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendSteward,
  parseSteward,
  shouldSummarise,
  stewardInput,
  stewardPrompt,
} from '../lib/steward.js'

const T0 = 1_700_000_000_000

// ---------------------------------------------------------------------------
// 提示词
// ---------------------------------------------------------------------------

test('prompt: the steward is told to record only finished work', () => {
  const prompt = stewardPrompt()
  assert.match(prompt, /已经做完/)
  assert.match(prompt, /不要写正在进行、计划、下一步、待办/)
  // 它必须知道「没有新进展」时怎么回答，否则会硬凑。
  assert.match(prompt, /NONE/)
})

test('prompt: one line per fact, no markdown ceiling', () => {
  const prompt = stewardPrompt()
  // 面板是纯文本列表，模型不能回 Markdown。
  assert.match(prompt, /不要输出编号、不要 Markdown/)
  // 长度约束在提示词里也要有，否则模型会写长句。
  assert.match(prompt, /不超过 24 个字/)
})

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

test('parse: plain lines become entries', () => {
  const lines = parseSteward('改好了登录页的校验逻辑\n测试全部通过')
  assert.deepEqual(lines, ['改好了登录页的校验逻辑', '测试全部通过'])
})

test('parse: NONE means nothing was finished', () => {
  assert.deepEqual(parseSteward('NONE'), [])
  assert.deepEqual(parseSteward('none.'), [])
})

test('parse: list markers and code fences are stripped', () => {
  const lines = parseSteward('```\n1. 修好了接口报错\n- 补上了回归测试\n```')
  assert.deepEqual(lines, ['修好了接口报错', '补上了回归测试'])
})

test('parse: a plan never becomes a recorded fact', () => {
  // 这是这一层最重要的过滤：便宜的模型确实会把计划混进事实列表。
  const lines = parseSteward([
    '正在做接口对接',
    '下一步要写文档',
    '待办：补测试',
    '接下来要重启',
    '修好了接口报错',
  ].join('\n'))
  assert.deepEqual(lines, ['修好了接口报错'])
})

test('parse: English leakage and empty-ish lines are dropped', () => {
  const lines = parseSteward('Done with login\nab\n修好了登录页')
  // 英文行不是中文面板能显示的东西；两个字的「ab」没有信息量。
  assert.deepEqual(lines, ['修好了登录页'])
})

test('parse: at most three facts per round', () => {
  const lines = parseSteward(Array.from({ length: 9 }, (_, i) => `第${i}件小事已经办完了`).join('\n'))
  assert.equal(lines.length, 3)
})

test('parse: trailing punctuation is removed so entries read as entries', () => {
  const lines = parseSteward('改好了按钮样式。\n跑通了全部测试；')
  assert.deepEqual(lines, ['改好了按钮样式', '跑通了全部测试'])
})

test('parse: an empty answer is an empty list, not a blank entry', () => {
  assert.deepEqual(parseSteward(''), [])
  assert.deepEqual(parseSteward('   \n\n  '), [])
})

// ---------------------------------------------------------------------------
// 只增不改
// ---------------------------------------------------------------------------

test('record: entries accumulate in order', () => {
  const first = appendSteward([], ['改好了接口', '测试通过'], T0)
  const second = appendSteward(first.record, ['更新了说明文档'], T0 + 1000)
  assert.deepEqual(second.record.map((e) => e.text), ['改好了接口', '测试通过', '更新了说明文档'])
  // 时间戳递增，读者能看出先后。
  assert.equal(second.record[0].at, T0)
  assert.equal(second.record[2].at, T0 + 1000)
})

test('record: earlier entries are never rewritten or reordered', () => {
  const seeded = appendSteward([], ['第一件', '第二件'], T0).record
  const next = appendSteward(seeded, ['第三件'], T0 + 5000).record
  assert.deepEqual(next.slice(0, 2), seeded)
})

test('record: the same fact is not recorded twice', () => {
  const seeded = appendSteward([], ['改好了接口'], T0).record
  // 同一句话再来一次（哪怕句末多了标点）不再追加。
  const again = appendSteward(seeded, ['改好了接口。'], T0 + 1000)
  assert.equal(again.record.length, 1)
})

test('record: punctuation and spacing do not create a fake duplicate', () => {
  const seeded = appendSteward([], ['跑通了全部测试'], T0).record
  const again = appendSteward(seeded, ['跑通了全部测试。'], T0 + 1)
  assert.equal(again.record.length, 1)
  assert.equal(again.added.length, 0)
})

test('record: a genuinely new fact still lands next to a near-duplicate', () => {
  const seeded = appendSteward([], ['改好了登录页'], T0).record
  const next = appendSteward(seeded, ['改好了注册页'], T0 + 1)
  assert.equal(next.record.length, 2)
})

// ---------------------------------------------------------------------------
// 输入构造
// ---------------------------------------------------------------------------

test('input: already-recorded facts are handed over so they are not repeated', () => {
  const input = stewardInput('改了登录页', ['改好了接口', '测试通过'])
  assert.match(input, /不要重复它们/)
  assert.match(input, /- 改好了接口/)
  // 新进展必须在里面。
  assert.match(input, /改了登录页/)
})

test('input: the known list is capped so cost stays bounded', () => {
  const many = Array.from({ length: 40 }, (_, i) => `第${i}件`)
  const input = stewardInput('新进展', many, { limit: 5 })
  const lines = input.split('\n').filter((l) => l.startsWith('- '))
  assert.equal(lines.length, 5)
})

test('input: an empty record still produces a usable prompt body', () => {
  const input = stewardInput('刚开工', [])
  assert.doesNotMatch(input, /不要重复它们/)
  assert.match(input, /刚开工/)
})

// ---------------------------------------------------------------------------
// 节奏
// ---------------------------------------------------------------------------

test('cadence: the first summary waits for real work', () => {
  assert.equal(shouldSummarise({ stepsDone: 0, lastSummaryStep: 0, lastSummaryAt: 0 }, { now: T0 }), false)
  assert.equal(shouldSummarise({ stepsDone: 2, lastSummaryStep: 0, lastSummaryAt: 0 }, { now: T0 }), false)
})

test('cadence: enough steps earns a summary', () => {
  assert.equal(shouldSummarise({ stepsDone: 4, lastSummaryStep: 0, lastSummaryAt: 0 }, { now: T0 }), true)
})

test('cadence: the minimum gap stops a burst from calling the model repeatedly', () => {
  const state = { stepsDone: 12, lastSummaryStep: 4, lastSummaryAt: T0 }
  // 刚问过，步数够了也不该再问。
  assert.equal(shouldSummarise(state, { now: T0 + 1000, minGapMs: 45_000 }), false)
  assert.equal(shouldSummarise(state, { now: T0 + 46_000, minGapMs: 45_000 }), true)
})

test('cadence: no new steps means no call, however long it has been', () => {
  const state = { stepsDone: 8, lastSummaryStep: 8, lastSummaryAt: T0 }
  assert.equal(shouldSummarise(state, { now: T0 + 10 * 60_000 }), false)
})

test('cadence: the interval is configurable', () => {
  const state = { stepsDone: 5, lastSummaryStep: 4, lastSummaryAt: 0 }
  assert.equal(shouldSummarise(state, { now: T0, everySteps: 4 }), false)
  assert.equal(shouldSummarise(state, { now: T0, everySteps: 1 }), true)
})
