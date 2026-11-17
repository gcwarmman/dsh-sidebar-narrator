import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIGHT_MEANING,
  PULSE_SLOTS,
  TOOL_LABELS,
  applyAgentError,
  applyAgentStatus,
  applySessionEvent,
  applyStream,
  buildDigest,
  buildIdleText,
  buildProgress,
  buildPulse,
  buildSummary,
  buildView,
  classify,
  clockText,
  createLensState,
  cut,
  describeCall,
  explainPrompt,
  humanElapsed,
  humanError,
  humanTool,
  quietMs,
  reasoningOfContent,
  repeats,
  thinkingClause,
  thinkingDigest,
  intentOf,
  noteThinking,
  lightOf,
  looksForward,
  pastTense,
  scrub,
  sentence,
  textOfContent,
} from '../lib/narrative.js'

/** Replay a scripted session and return the view a person would see. */
function replay(events, options = {}) {
  const state = createLensState('session-test')
  for (const event of events) applySessionEvent(state, event, event.time ?? 1_700_000_000_000)
  return buildView(state, options.now ?? 1_700_000_000_000, options)
}

const T0 = 1_700_000_000_000

// ---------------------------------------------------------------------------
// 语言层：大白话，不暴露工具名和路径
// ---------------------------------------------------------------------------

test('scrub removes drive paths, deep paths and hex ids', () => {
  assert.equal(scrub('D:\\work\\tagclear\\src\\auth\\login.tsx'), '某个文件')
  assert.equal(/tagclear/.test(scrub('D:/work/tagclear/project/x.py')), false)
  assert.equal(/[0-9a-f]{8,}/.test(scrub('commit 3f9a2b71c0e5 done')), false)
  assert.equal(scrub(undefined), '')
})

test('scrub closes the gaps streaming leaves between Chinese characters', () => {
  // 流式文本逐块切出来，会在汉字之间留下空格，读起来一顿一顿的。
  assert.equal(scrub('加载 我 重新 生成 预览'), '加载我重新生成预览')
  assert.equal(scrub('在跑测试 ， 确认 好了'), '在跑测试，确认好了')
  // 中英混排和纯英文里的空格必须留着，不能粘成一坨。
  assert.equal(scrub('在跑 node test'), '在跑 node test')
  assert.equal(scrub('run the tests'), 'run the tests')
})

test('humanTool speaks tool names as actions', () => {
  assert.equal(humanTool('read_file'), '翻文件')
  assert.equal(humanTool('edit'), '改文件')
  assert.equal(humanTool('bash'), '敲命令')
  assert.equal(humanTool('mcp__github__create_pull_request'), '用「create pull request」办点事')
  assert.equal(humanTool(''), '做点事')
})

test('classify + lightOf map onto the five required lights', () => {
  // `read` (this harness's file tool) and `read_file` must both be blue reads:
  // getting that wrong makes the panel say 「办完了一件事」 after every file read.
  assert.equal(classify('read'), 'read')
  assert.equal(classify('read_file'), 'read')
  assert.equal(classify('edit'), 'write')
  assert.equal(classify('bash'), 'run')
  assert.equal(classify('todo_write'), 'plan')
  assert.equal(classify('weird_tool'), 'other')
  assert.equal(lightOf('read'), 'blue')
  assert.equal(lightOf('write'), 'yellow')
  assert.equal(lightOf('run'), 'cyan')
  for (const light of ['blue', 'yellow', 'cyan', 'green', 'red']) {
    assert.equal(typeof LIGHT_MEANING[light], 'string')
  }
})

test('describeCall produces verb + object + why without machine noise', () => {
  const read = describeCall('read_file', JSON.stringify({ path: 'D:\\work\\tagclear\\src\\auth\\login.tsx' }), '')
  assert.equal(read.kind, 'read')
  assert.equal(read.light, 'blue')
  assert.match(read.verb, /^在看/)
  assert.equal(/tagclear|\.tsx/.test(`${read.verb}${read.object}`), false)

  const write = describeCall('edit', JSON.stringify({ file_path: '/app/src/config/settings.ts' }), '')
  assert.equal(write.light, 'yellow')
  assert.equal(/src|settings\.ts/.test(write.object), false, 'file path must be turned into a plain name')

  const test_ = describeCall('bash', JSON.stringify({ command: 'pnpm test -- --watch=false' }), '')
  assert.equal(test_.light, 'cyan')
  assert.match(test_.verb, /在跑测试/)
})

test('sentence is one short line ending with a full stop', () => {
  const line = sentence('在看', '「登录页」的代码', '确认输错密码后跳哪里')
  assert.equal(line, '在看「登录页」的代码，确认输错密码后跳哪里。')
  assert.ok(line.length <= 60)
  assert.equal(sentence('在做', '', '').endsWith('。'), true)
})

test('pastTense covers every verb the panel can emit', () => {
  // No verb in the label table may fall through to the generic 「办完了一件事」:
  // that sentence is what made the panel look broken after every other step.
  for (const [tool, verb] of Object.entries(TOOL_LABELS)) {
    const past = pastTense(verb, classify(tool))
    assert.notEqual(past, '办完了一件事', `verb ${verb} (tool ${tool}) fell through`)
    assert.ok(past.length > 0)
  }
  // An unseen verb still says something specific, judged by its first character.
  assert.equal(pastTense('在看文档', 'read'), '看过了')
  assert.equal(pastTense('在改配置', 'write'), '改好了')
  assert.equal(pastTense('在跑脚本', 'run'), '跑完了')
  for (const verb of ['在看', '在改', '在写', '在跑测试', '在找', '在理清单']) {
    assert.notEqual(pastTense(verb).startsWith('做完了一件'), true, verb)
  }
  // An unknown verb must never be echoed back into a sentence.
  assert.equal(pastTense('某个没见过的说法'), '办完了一件事')
  // Falling back on the KIND is better than a vague 「走完了一步」: it still says
  // whether it read, changed or ran something.
  assert.equal(pastTense('某个没见过的说法', 'read'), '看完了')
  assert.equal(pastTense('某个没见过的说法', 'write'), '改好了')
  assert.equal(pastTense('某个没见过的说法', 'run'), '跑完了这一步')
})

test('humanError turns raw failures into one plain sentence', () => {
  assert.equal(humanError('EPERM: operation not permitted'), '有个文件被别的程序占着，改不动')
  assert.equal(humanError('ENOENT: no such file or directory'), '找不到那个文件了')
  assert.equal(humanError('ETIMEDOUT'), '等太久没反应，超时了')
  assert.equal(humanError(''), '碰到个没预料的错，正在想办法绕过去')
  assert.equal(/[A-Z]{2,}_/.test(humanError('ERR_PNPM something')), false)
})

test('durations read like a person wrote them', () => {
  assert.equal(clockText(0), '不到 1 秒')
  assert.equal(clockText(130_000), '2 分 10 秒')
  assert.equal(clockText(3_600_000), '1 小时 0 分')
  assert.equal(humanElapsed(30_000), '不到一分钟')
  assert.equal(humanElapsed(120_000), '2 分钟')
})

test('intentOf keeps one clause and drops code fences', () => {
  assert.equal(intentOf('我先看看登录页的跳转逻辑。然后再改。'), '我先看看登录页的跳转逻辑')
  assert.equal(intentOf('```js\nconst x = 1\n```\n'), '')
  assert.equal(intentOf(''), '')
})

test('textOfContent only reads text blocks', () => {
  assert.equal(textOfContent([
    { type: 'text', text: '甲' },
    { type: 'image', url: 'x' },
    { type: 'text', text: '乙' },
  ]), '甲乙')
  assert.equal(textOfContent(null), '')
})

// ---------------------------------------------------------------------------
// 场景 1：正在读文件 → 蓝灯
// ---------------------------------------------------------------------------

test('scenario: reading a file shows a blue light and a plain sentence', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'step/start', time: T0 + 100, data: { turn: 1, step: 1 } },
    { type: 'tool/call', time: T0 + 200, data: { turn: 1, step: 1, callId: 'c1', name: 'read_file', arguments: '{"path":"D:\\\\work\\\\tagclear\\\\src\\\\auth\\\\login.tsx"}' } },
  ])
  assert.equal(view.light, 'blue')
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.match(doing.text, /^在看/)
  assert.equal(doing.source, 'observed')
  assert.equal(/read_file|tagclear|\.tsx/.test(doing.text), false)
  // 详情四段齐全，默认由 UI 收起（数据已备好）
  for (const field of ['why', 'saw', 'result', 'adjust']) {
    assert.equal(typeof doing.details[field], 'string')
    assert.notEqual(doing.details[field], '')
  }
})

// ---------------------------------------------------------------------------
// 场景 2：正在改文件 → 黄灯
// ---------------------------------------------------------------------------

test('scenario: editing shows a yellow light and the file is remembered', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"file_path":"/app/src/config/app.ts"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: false }, error: null } },
    { type: 'tool/call', time: T0 + 300, data: { turn: 1, step: 1, callId: 'c2', name: 'edit', arguments: '{"file_path":"/app/src/config/db.ts"}' } },
  ])
  assert.equal(view.light, 'yellow')
  assert.equal(view.stepsDone, 1)
  assert.equal(view.rows.find((row) => row.key === 'done') === undefined, false)
  // 文件被换成人话名字记住，不是原路径
  assert.equal(view.files.length, 1)
  assert.equal(/[\\/]|\.ts$/.test(view.files[0]), false)
})

// ---------------------------------------------------------------------------
// 场景 3：正在跑测试 → 青灯
// ---------------------------------------------------------------------------

test('scenario: running tests shows a cyan light', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"pnpm vitest run"}' } },
  ])
  assert.equal(view.light, 'cyan')
  assert.match(view.rows.find((row) => row.key === 'doing').text, /在跑测试/)
})

// ---------------------------------------------------------------------------
// 场景 4：卡住 / 报错 → 红灯 + 一句人话
// ---------------------------------------------------------------------------

test('scenario: a tool failure turns the light red with a plain sentence', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"file_path":"/app/src/a.ts"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: true }, error: { name: 'FS_EDIT_NOT_FOUND', code: 'FS_EDIT_NOT_FOUND', reason: 'old_string was not found' } } },
  ])
  assert.equal(view.light, 'red')
  assert.match(view.lightNote, /没过去|没对上/)
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.match(doing.text, /这里可能卡住了/)
  assert.equal(/FS_EDIT_NOT_FOUND|old_string/.test(doing.text), false)
})

test('scenario: an agent-level error also shows red', () => {
  const state = createLensState('s')
  applyAgentStatus(state, 'running', T0)
  applyAgentError(state, { message: 'ECONNRESET: socket hang up' }, T0 + 1000)
  const view = buildView(state, T0 + 2000)
  assert.equal(view.light, 'red')
  assert.equal(view.error.text, '连接断了，对面没接上')
})

// ---------------------------------------------------------------------------
// 场景 5：只读提问不改变主会话（数据层证明：提问只读 digest）
// ---------------------------------------------------------------------------

test('scenario: the read-only channel only reads a digest and mutates nothing', () => {
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'read_file', arguments: '{"path":"/a/b/login.tsx"}' } }, T0 + 10)

  const before = JSON.stringify(state)
  const digest = buildDigest(state, { extra: '' })
  assert.equal(JSON.stringify(state), before, 'building a digest must not touch session state')
  assert.match(digest, /空闲|正在跑/)
  assert.match(digest, /正在跑/)
  // digest 里也不许出现工具名
  assert.equal(/read_file|\.tsx/.test(digest), false)
})

// ---------------------------------------------------------------------------
// 场景 6：steer 在下个 step 边界生效（状态层证明提醒被记录，不打断当前步骤）
// ---------------------------------------------------------------------------

test('scenario: a steer note is recorded without clearing the current step', () => {
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'bash', arguments: '{"command":"pnpm test"}' } }, T0 + 10)
  const before = buildView(state, T0 + 20)

  // The host half also records the note; the running step must survive it.
  state.steers = [...state.steers, '那个文件先别改']
  const after = buildView(state, T0 + 30)

  assert.equal(after.running, true, 'the turn is still running')
  assert.equal(after.rows.find((row) => row.key === 'doing').text, before.rows.find((row) => row.key === 'doing').text)
  assert.equal(after.light, before.light)
})

// ---------------------------------------------------------------------------
// 场景 7：cancel → 反馈保留 / 中止
// ---------------------------------------------------------------------------

test('scenario: an aborted turn reports what was kept and what was cut', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"file_path":"/app/src/login.tsx"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: false }, error: null } },
    { type: 'turn/end', time: T0 + 300, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
  ], { now: T0 + 400 })

  assert.equal(view.running, false)
  assert.notEqual(view.cancelNote, null)
  assert.match(view.cancelNote.text, /叫停/)
  assert.match(view.cancelNote.text, /都留着/)
  assert.equal(view.light, 'green')
})

// ---------------------------------------------------------------------------
// 场景 8：空闲状态非空
// ---------------------------------------------------------------------------

test('scenario: idle is never blank', () => {
  const state = createLensState('s')
  const cold = buildView(state, T0)
  assert.notEqual(cold.idle, null)
  assert.notEqual(cold.idle.text, '')

  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 185_000, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 185_000)
  const warm = buildView(state, T0 + 186_000)
  assert.match(warm.idle.text, /空闲/)
  assert.match(warm.idle.text, /3 分 5 秒|3 分|分钟/)
  assert.match(warm.idle.text, /改了 \d+ 个文件/)
})

test('idle honour the configured template', () => {
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 65_000, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 65_000)
  const text = buildIdleText(state, { emptyState: '上一轮花了 {duration}，动过 {files} 个文件。' })
  assert.equal(text, '上一轮花了 1 分 5 秒，动过 0 个文件。')
})

test('idle never quotes an English line into a Chinese panel', () => {
  // 真事：子会话收尾时说了句英文，空状态就变成「最后一句：I'll run these one at a time」。
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, {
    type: 'assistant/message', time: T0 + 20,
    data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: "I'll run these one at a time, in order." }] } },
  }, T0 + 20)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 30, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 30)
  const text = buildIdleText(state, {})
  assert.equal(/I'll|one at a time/.test(text), false, text)
  assert.equal(/[\u4e00-\u9fff]/.test(text), true, text)

  // 中文收尾仍然要引用，这是有用的信息，不能一起砍掉。
  const zh = createLensState('s')
  applySessionEvent(zh, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(zh, {
    type: 'assistant/message', time: T0 + 20,
    data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '改完了，测试也过了。' }] } },
  }, T0 + 20)
  applySessionEvent(zh, { type: 'turn/end', time: T0 + 30, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 30)
  assert.match(buildIdleText(zh, {}), /改完了/)
})

// ---------------------------------------------------------------------------
// 验收：默认主面板只有三行 + 一盏灯，位置感而非百分比
// ---------------------------------------------------------------------------

test('acceptance: at most three rows, each short, each with provenance', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 50, data: { todos: [{ status: 'pending', text: '补一个边界测试' }, { status: 'completed', text: '看登录页' }] } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'read_file', arguments: '{"path":"/a/login.tsx"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: false }, error: null } },
    { type: 'tool/call', time: T0 + 300, data: { turn: 1, step: 1, callId: 'c2', name: 'grep', arguments: '{"query":"password"}' } },
  ])

  assert.ok(view.rows.length <= 3)
  assert.deepEqual(view.rows.map((row) => row.key), ['done', 'doing', 'next'])
  for (const row of view.rows) {
    assert.ok(row.text.length <= 60, `row too long: ${row.text}`)
    assert.equal(row.source === 'observed' || row.source === 'reported', true)
    assert.equal(/[A-Za-z]:\\|\/app\/|read_file|grep/.test(row.text), false, `machine noise in: ${row.text}`)
  }
  // 位置感：第 N / M 步，没有百分比
  assert.equal(typeof view.position.index, 'number')
  assert.equal(typeof view.position.total, 'number')
  assert.ok(view.position.total >= view.position.index)
  assert.equal(typeof view.light, 'string')
})

test('regression: 正在做 and 下一步 never say the same thing', () => {
  // Seen live: 正在做「在跑测试，确认改完没有碰坏别的」and 下一步「跑一遍测试，
  // 确认没碰坏别的」 — two of the three lines were the same sentence.
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"node --test test/"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: false }, error: null } },
    { type: 'tool/call', time: T0 + 300, data: { turn: 1, step: 2, callId: 'c2', name: 'bash', arguments: '{"command":"node --test"}' } },
  ])
  const doing = view.rows.find((row) => row.key === 'doing')
  const next = view.rows.find((row) => row.key === 'next')
  assert.equal(repeats(doing.text, next.text), false, `both say: ${doing.text}`)
  assert.notEqual(doing.text, next.text)
})

test('repeats ignores punctuation but not short generic lines', () => {
  assert.equal(repeats('在跑测试，确认没碰坏别的。', '跑一遍测试，确认没碰坏别的'), true)
  assert.equal(repeats('看完了。', '改好了。'), false)
  assert.equal(repeats('在跑测试。', '在跑测试'), true)
})

test('acceptance: the next row comes from the todo list when one is pending', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 50, data: { todos: [{ status: 'pending', text: '补一个边界测试' }] } },
  ])
  const next = view.rows.find((row) => row.key === 'next')
  assert.equal(next.text, '补一个边界测试')
  assert.equal(next.source, 'observed')
})

test('acceptance: a reported-only claim is tagged as such', () => {
  const state = createLensState('s')
  applyAgentStatus(state, 'running', T0)
  // The agent said something, but no tool evidence has landed yet.
  applySessionEvent(state, {
    type: 'assistant/message',
    time: T0 + 100,
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '我在确认登录失败后跳到哪里。' }] } },
  }, T0 + 100)
  const view = buildView(state, T0 + 200)
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(doing.source, 'reported')
  assert.match(doing.text, /在琢磨/)
})

// ---------------------------------------------------------------------------
// 进度与稳态
// ---------------------------------------------------------------------------

test('streaming text feeds the intent clause but never invents tools', () => {
  const state = createLensState('s')
  applyStream(state, { chunk: { type: 'text-delta', text: '先看看登录页' } }, T0)
  assert.equal(state.intent, '先看看登录页')
  assert.equal(state.current, null)

  applyStream(state, { chunk: { type: 'tool-call-delta', name: 'read_file', arguments: '{"path":"/x/login.tsx"}' } }, T0 + 10)
  assert.equal(state.current?.kind, 'read')
  assert.equal(state.current?.light, 'blue')
})

test('agent status flips running and records the last turn', () => {
  const state = createLensState('s')
  applyAgentStatus(state, 'running', T0)
  assert.equal(state.running, true)
  applyAgentStatus(state, 'idle', T0 + 90_000)
  assert.equal(state.running, false)
  assert.equal(state.lastTurn.durationMs, 90_000)
})

test('unknown event types are ignored without throwing', () => {
  const state = createLensState('s')
  const next = applySessionEvent(state, { type: 'compaction/start', time: T0, data: {} }, T0)
  assert.equal(next, state)
  assert.equal(buildView(state, T0).rows.length >= 2, true)
})

test('cut only ellipsizes when it actually cuts', () => {
  assert.equal(cut('abc', 10), 'abc')
  assert.equal(cut('abcdef', 4), 'abc…')
  assert.equal(cut(null, 5), '')
})

// ---------------------------------------------------------------------------
// 回归：真实会话里发现的问题
// ---------------------------------------------------------------------------

test('regression: a finished-work sentence is never used as the reason for a step', () => {
  // This exact shape appeared live: "在访问接口，安装成功（applied，没有警告）。"
  const state = createLensState('s')
  applySessionEvent(state, {
    type: 'assistant/message', time: T0,
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '安装成功（ applied ，没有警告）。' }] } },
  }, T0)
  assert.equal(state.intent, '', 'a completed-work clause must not become the intent')

  applySessionEvent(state, { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'bash', arguments: '{"command":"curl http://x"}' } }, T0 + 10)
  const view = buildView(state, T0 + 20)
  const text = view.rows.find((row) => row.key === 'doing').text
  assert.equal(/安装成功|没有警告/.test(text), false, `leaked a report into the doing row: ${text}`)
})

test('regression: a forward-looking clause still becomes the reason', () => {
  const state = createLensState('s')
  applySessionEvent(state, {
    type: 'assistant/message', time: T0,
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '先看看登录页怎么跳的。' }] } },
  }, T0)
  assert.equal(state.intent, '先看看登录页怎么跳的')
})

test('regression: an unmapped verb never leaks into the 已完成 row', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'some_unknown_tool', arguments: '{}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, message: { isError: false } } },
  ])
  const done = view.rows.find((row) => row.key === 'done')
  assert.equal(/some_unknown_tool|做完了一件：/.test(done.text), false, done.text)
})

test('regression: a two-letter file stem is described, not printed bare', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'edit', arguments: '{"file_path":"/p/locale/zh.json"}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, message: { isError: false } } },
  ])
  assert.equal(view.files[0].startsWith('一个小文件'), true, view.files[0])
})

test('regression: a replayed session with history does not claim it never worked', () => {
  const state = createLensState('s')
  for (let index = 0; index < 5; index += 1) {
    applySessionEvent(state, { type: 'tool/call', time: T0 + index * 10, data: { turn: 1, step: 1, callId: `c${index}`, name: 'read_file', arguments: '{"path":"/a/x.ts"}' } }, T0 + index * 10)
    applySessionEvent(state, { type: 'tool/result', time: T0 + index * 10 + 1, data: { turn: 1, step: 1, message: { isError: false } } }, T0 + index * 10 + 1)
  }
  const text = buildView(state, T0 + 100).idle.text
  assert.equal(/还没干过活/.test(text), false, text)
  assert.match(text, /走了 5 步/)
})

test('regression: a straggler tool call does not claim activity after the turn ended', () => {
  // Seen live: green "完成" light sitting next to "在访问接口".
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"curl http://x"}' } },
    // no tool/result, but the turn still ends
    { type: 'turn/end', time: T0 + 200, data: { turn: 1, reason: { kind: 'completed' } } },
  ], { now: T0 + 300 })

  assert.equal(view.light, 'green')
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(/在访问接口/.test(doing.text), false, doing.text)
  assert.equal(doing.text, '现在没在动。')
})

test('regression: the light never uses a stale call either', () => {
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c', name: 'edit', arguments: '{"file_path":"/a/b.ts"}' } }, T0 + 10)
  applyAgentStatus(state, 'idle', T0 + 20)
  const view = buildView(state, T0 + 30)
  assert.equal(view.light, 'green', 'a yellow write light must not survive the turn')
})

test('regression: the result line matches what the step actually did', () => {
  // 写文件那一步的「结果」曾经写成「跑通了，没有报错」，那是测试的说法。
  const write = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'write', arguments: '{"file_path":"/a/note.md"}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, message: { isError: false } } },
  ], { now: T0 + 30 })
  const writeDone = write.rows.find((row) => row.key === 'done')
  assert.equal(/跑通了/.test(writeDone.details.result), false, writeDone.details.result)

  const run = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, message: { isError: false } } },
  ], { now: T0 + 30 })
  const runDone = run.rows.find((row) => row.key === 'done')
  assert.match(runDone.details.result, /跑通了/)
})

test('regression: 看到了什么 never leaves a dangling colon', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, message: { isError: false } } },
  ], { now: T0 + 30 })
  for (const row of view.rows) {
    assert.equal(/[：:]$/.test(row.details.saw), false, `dangling colon in ${row.key}: ${row.details.saw}`)
  }
})

test('regression: tool-protocol debris never reaches the panel', () => {
  // 真事：意图句子里夹着「</mcp」的残留，面板就印出「在跑测试，</mcp 现在重新…」。
  assert.equal(/<\/?mcp/.test(scrub('在跑测试，</mcp 现在重新生成预览')), false)
  assert.equal(/```/.test(scrub('看看这段 ```js\nrun()\n``` 行不行')), false)
  assert.equal(/</.test(scrub('<tool_call>edit</tool_call>')), false)
})

test('regression: a borrowed clause never ends on its own punctuation', () => {
  // 借用 agent 原话时，末尾的冒号/逗号要收掉，否则拼出来像截断 bug。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    {
      type: 'assistant/message', time: T0 + 5,
      data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '接下来要确认：' }] } },
    },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' } },
  ], { now: T0 + 20 })
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(/[：:]/.test(doing.text), false, doing.text)
  assert.equal(/[，,]$/.test(doing.text), false, doing.text)
})

// ---------------------------------------------------------------------------
// 心跳：动画读的是真事，不是计时器
// ---------------------------------------------------------------------------

test('pulse: a beat from a real event lights a slot', () => {
  const state = createLensState('session-pulse')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 2_900,
    data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' },
  })
  const pulse = buildPulse(state, T0 + 2_950)
  assert.equal(pulse.bars.length, PULSE_SLOTS)
  assert.equal(pulse.live, true)
  // The newest slot is the rightmost one.
  assert.equal(pulse.bars[PULSE_SLOTS - 1] > 0, true)
  // The opening beat is still inside the window, so the oldest slot is lit too.
  assert.equal(pulse.bars[0] > 0, true)
})

test('pulse: silence is reported as silence, not as vague activity', () => {
  const state = createLensState('session-pulse')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 100,
    data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' },
  })
  // Six seconds later every beat has aged out of the three-second window.
  const pulse = buildPulse(state, T0 + 6_000)
  assert.equal(pulse.live, false)
  assert.deepEqual(pulse.bars, new Array(PULSE_SLOTS).fill(0))
  const view = buildView(state, T0 + 6_000)
  assert.equal(view.beatAge >= 5_000, true, `beatAge=${view.beatAge}`)
  assert.deepEqual(view.beats, [])
})

test('pulse: live token frames count as work', () => {
  const state = createLensState('session-pulse')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applyStream(state, { chunk: { type: 'text-delta', text: '正在核对返回结构' } }, T0 + 2_500)
  const pulse = buildPulse(state, T0 + 2_550)
  assert.equal(pulse.live, true)
  assert.equal(buildView(state, T0 + 2_550).beats.length, 2)
})

test('pulse: thinking keeps the strip alive so quiet means stopped', () => {
  const state = createLensState('session-pulse')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applyStream(state, { chunk: { type: 'reasoning-delta', text: '先想想要动哪个文件' } }, T0 + 2_700)
  assert.equal(buildPulse(state, T0 + 2_750).live, true)
})

test('pulse: idle sessions still hand the client the last beats', () => {
  const state = createLensState('session-pulse')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, { type: 'turn/end', time: T0 + 500, data: { turn: 1, reason: { kind: 'completed' } } })
  const view = buildView(state, T0 + 900)
  assert.equal(view.running, false)
  assert.equal(view.light, 'green')
  // The strip may be empty, but the field must exist so the client never
  // has to guess between "no activity" and "old server build".
  assert.equal(Array.isArray(view.beats), true)
  assert.equal(view.beatAge >= 400, true)
})

// ---------------------------------------------------------------------------
// 提炼：用户要的是「这件事推进到哪一步」，不是「第几步做了什么」
// ---------------------------------------------------------------------------

/** 造一条活动事件：tool/call + tool/result。 */
function step(name, args, at, kindHint) {
  return [
    { type: 'tool/call', time: at, data: { turn: 1, step: 1, callId: `c-${at}`, name, arguments: JSON.stringify(args) } },
    { type: 'tool/result', time: at + 5, data: { turn: 1, step: 1, message: { isError: false }, error: null, meta: kindHint } },
  ]
}

test('progress: counts what the work produced, not how many steps passed', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'D:\\work\\tagclear\\src\\auth\\login.tsx' }, T0 + 10),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\src\\auth\\login.tsx' }, T0 + 20),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\src\\auth\\session.ts' }, T0 + 30),
    ...step('bash', { command: 'node --test' }, T0 + 40),
  ]
  const view = replay(events, { now: T0 + 50 })
  assert.equal(view.progress.steps, 4)
  assert.equal(view.progress.files, 2)
  const keys = view.progress.items.map((item) => item.key)
  assert.deepEqual(keys.includes('write'), true)
  assert.deepEqual(keys.includes('read'), true)
  assert.deepEqual(keys.includes('run'), true)
  // 摘要要把「改了几个文件」说出来，而不是只说走了几步。
  assert.match(view.summary, /\d+ 个文件/)
})

test('progress: naming the phase, so nobody has to decode a tool name', () => {
  const reading = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{}' } },
  ], { now: T0 + 20 })
  assert.equal(reading.progress.phase, '摸清现状')

  const writing = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{}' } },
  ], { now: T0 + 20 })
  assert.equal(writing.progress.phase, '动手实现')

  const done = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'turn/end', time: T0 + 10, data: { turn: 1, reason: { kind: 'completed' } } },
  ], { now: T0 + 20 })
  assert.equal(done.progress.phase, '已经收尾')
})

test('progress: a run with nothing produced says so instead of dressing it up', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
  ], { now: T0 + 10 })
  assert.equal(view.progress.steps, 0)
  assert.deepEqual(view.progress.items, [])
  assert.equal(view.summary, '还没出成品：这一轮刚开始。')
})

test('progress: failures are counted, and the summary admits them', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{}' } },
    { type: 'tool/result', time: T0 + 15, data: { turn: 1, step: 1, message: { isError: true }, error: { code: 'ENOENT' } } },
    ...step('write', { file_path: 'a.ts' }, T0 + 20),
  ], { now: T0 + 30 })
  assert.equal(view.progress.failed, 1)
  assert.match(view.summary, /碰了 1 次错/)
})

test('progress: the checklist is reported as done/total, not as a percentage', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 10, data: { todos: [
      { status: 'completed', text: '读配置' },
      { status: 'completed', text: '改样式' },
      { status: 'pending', text: '跑测试' },
    ] } },
  ], { now: T0 + 20 })
  assert.deepEqual(view.progress.todos, { done: 2, total: 3 })
  assert.match(view.summary, /清单 2 \/ 3/)
})

test('progress: kind tallies survive steps that never produced a call', () => {
  const state = createLensState('session-tally')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, { type: 'tool/call', time: T0 + 10, data: { name: 'read', arguments: '{}' } }, T0 + 10)
  assert.deepEqual(state.tally, { read: 0, write: 0, run: 0, plan: 0, ask: 0, other: 0 })
  applySessionEvent(state, { type: 'tool/result', time: T0 + 15, data: { message: { isError: false } } }, T0 + 15)
  assert.equal(state.tally.read, 1)
  const progress = buildProgress(state)
  assert.deepEqual(progress.items.map((item) => item.key), ['read'])
  // 读过的次数仍然算数，但用「还没动手，先看了几处」的说法讲，
  // 而不是报「看过 N 处代码」这种只证明它在忙的指标。
  assert.match(buildSummary(state), /还没动手，先看了 1 处代码/)
  assert.doesNotMatch(buildSummary(state), /到目前为止：看过/)
})
test('progress: the summary reads like a changelog, not a debug log', () => {
  // A long busy run: reads and commands pile up, two files change, one todo is left.
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...Array.from({ length: 9 }, (_, i) => step('read', { file_path: `D:\\w\\src\\m${i}.ts` }, T0 + 10 + i * 2)).flat(),
    ...Array.from({ length: 7 }, (_, i) => step('bash', { command: 'node --test' }, T0 + 30 + i * 2)).flat(),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\client.ts' }, T0 + 50),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\narrative.ts' }, T0 + 60),
    { type: 'todo/write', time: T0 + 70, data: { todos: [
      { status: 'completed', text: '补图标' },
      { status: 'pending', text: '优化摘要' },
    ] } },
  ], { now: T0 + 80 })
  const summary = view.summary

  // 开头说的是「做成了什么」，不是「忙了多少」。
  assert.match(summary, /^到目前为止：动了 2 个文件/)
  assert.doesNotMatch(summary, /^到目前为止：看过/)
  assert.doesNotMatch(summary, /^到目前为止：跑过/)

  // 结尾说的是「还差什么」，而且点得出那一件。
  assert.match(summary, /还差「优化摘要」/)
  assert.match(summary, /清单 1 \/ 2/)

  // 忙碌指标仍然留在展开详情里，只是不再占据摘要。
  const keys = view.progress.items.map((item) => item.key)
  assert.deepEqual(keys.includes('read'), true)
  assert.deepEqual(keys.includes('run'), true)
})

test('progress: a couple of touched files are named, not just counted', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\client.ts' }, T0 + 10),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\narrative.ts' }, T0 + 20),
  ]
  const view = replay(events, { now: T0 + 30 })
  // 两个文件时点名比报数字有用：「改了说明文档、客户端」比「改了 2 个文件」更好读。
  assert.match(view.summary, /\d+ 个文件（.+、.+）/)
  assert.equal(/src|lib|\.[a-z]{2}\b/.test(view.summary), false)
})

test('digest: hands the explain door the ledger, not just the step counter', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\client.ts' }, T0 + 10),
    ...step('bash', { command: 'node --test' }, T0 + 20),
  ]
  const state = createLensState('session-digest')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state)
  assert.match(digest, /到目前为止：/)
  assert.match(digest, /看|改|跑/)
  assert.match(digest, /状态：/)
})

// ---------------------------------------------------------------------------
// The explain door's digest and prompt.
// ---------------------------------------------------------------------------

test('digest: separates what was observed from what the agent merely claimed', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\client.ts' }, T0 + 10),
    // The agent's own words are a claim, not evidence.
    { type: 'assistant/message', time: T0 + 20, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '登录流程已经全部改好了' }] } } },
  ]
  const state = createLensState('session-provenance')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 30 })

  assert.match(digest, /【已观察到】/)
  assert.match(digest, /【仅据汇报】/)
  // Evidence before hearsay: the assistant may not read a claim before the facts.
  assert.equal(digest.indexOf('【已观察到】') < digest.indexOf('【仅据汇报】'), true)
  // The claim never lands in the observed block.
  const observedPart = digest.slice(0, digest.indexOf('【仅据汇报】'))
  assert.equal(observedPart.includes('登录流程已经全部改好了'), false)
  assert.equal(digest.includes('登录流程已经全部改好了'), true)
})

test('digest: a guess about the next step is labelled as a guess', () => {
  // In flight on purpose: a finished call has no "next step" worth guessing at.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c-next', name: 'bash', arguments: JSON.stringify({ command: 'node --test' }) } },
  ]
  const state = createLensState('session-next')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 20 })
  assert.match(digest, /它下一步大概会：/)
  assert.match(digest, /（推测）/)
})

test('digest: quiet time starts from the last real event, not from the turn opening', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('bash', { command: 'node --test' }, T0 + 1000),
  ]
  const state = createLensState('session-quiet')
  for (const event of events) applySessionEvent(state, event, event.time)
  // The action happened at T0+1005; ninety seconds later it has been quiet ever since.
  assert.equal(quietMs(state, T0 + 1000 + 5 + 90_000), 90_000)
  // An untouched session has no staleness to report — -1, not 0, not Infinity.
  assert.equal(quietMs(createLensState('session-empty'), T0), -1)
})

test('explainPrompt: it is a narrator, not an assistant with opinions', () => {
  const prompt = explainPrompt('【已观察到】\n状态：正在跑（验证结果）')
  assert.match(prompt, /侧边旁白/)
  // Length discipline is the single most load-bearing rule in the prompt.
  assert.match(prompt, /1 到 2 句话/)
  assert.match(prompt, /口语化/)
  // No markup, ever.
  assert.match(prompt, /不要用任何 Markdown/)
})

test('explainPrompt: the recipe is action + object + reason, with worked examples', () => {
  const prompt = explainPrompt('x')
  assert.match(prompt, /生活化动作 \+ 业务对象 \+ 目的/)
  // A prompt that only forbids bad output is weaker than one that shows both
  // failure modes plus a good answer.
  assert.match(prompt, /太机器/)
  assert.match(prompt, /太模糊/)
  assert.match(prompt, /正确示范/)
})

test('explainPrompt: it hides mechanics but keeps business words', () => {
  const prompt = explainPrompt('x')
  assert.match(prompt, /屏蔽底层技术细节/)
  // The distinction matters: 「登录页」 should survive, 「read_file」 should not.
  assert.match(prompt, /登录页/)
  assert.match(prompt, /函数名/)
})

test('explainPrompt: it says so when there is too little to explain', () => {
  const prompt = explainPrompt('x')
  assert.match(prompt, /只依据/)
  // The exact escape hatch, quoted so a paraphrase cannot quietly become an
  // invitation to guess.
  assert.match(prompt, /这会儿它还在默默干活，暂时看不出具体在忙啥/)
  assert.match(prompt, /绝对不要瞎猜编造/)
})

test('explainPrompt: no officialese, and it refuses to be mistaken for an errand-runner', () => {
  const prompt = explainPrompt('x')
  assert.match(prompt, /根据记录/)
  assert.match(prompt, /综上/)
  assert.match(prompt, /我会帮你转告/)
  assert.match(prompt, /你只是个旁白/)
})

test('explainPrompt: the digest goes last, inside a delimiter', () => {
  const prompt = explainPrompt('SECTION-UNDER-TEST')
  const at = prompt.indexOf('SECTION-UNDER-TEST')
  assert.equal(at > 0, true)
  // Nothing may follow the digest: it is the model's only permitted source of
  // fact, so the boundary has to be closed and end the prompt.
  assert.equal(prompt.slice(at).endsWith('</digest>'), true)
  assert.equal(prompt.includes('<digest>'), true)
})

// ---------------------------------------------------------------------------
// What a click on a row is allowed to reveal.
// ---------------------------------------------------------------------------

test('every row carries something to show when it is opened', () => {
  // Found live: the detail block lived inside a <button>, the parser hoisted it
  // out, and clicking a row expanded into nothing. The markup is fixed, but the
  // payload has to hold up its end too — a row with no detail is a dead click.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'D:\\work\\tagclear\\lib\\client.js' }, T0 + 10),
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\index.js' }, T0 + 20),
    ...step('bash', { command: 'node --test' }, T0 + 30),
  ]
  const state = createLensState('session-detail')
  for (const event of events) applySessionEvent(state, event, event.time)
  const view = buildView(state, T0 + 40)
  assert.equal(view.rows.length >= 2, true)
  for (const row of view.rows) {
    const details = row.details ?? {}
    const filled = ['why', 'saw', 'result', 'adjust'].filter(
      (key) => typeof details[key] === 'string' && details[key] !== '',
    )
    assert.equal(filled.length >= 1, true, `row ${row.key} has nothing to expand`)
  }
})

test('a stopped turn says what survived it, in a field the panel can render', () => {
  // Found live: the host computed cancelNote and the panel never showed it, so a
  // user who pressed 先停一下 got silence instead of the promised report.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('bash', { command: 'node --test' }, T0 + 10),
    { type: 'turn/end', time: T0 + 20, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
  ]
  const state = createLensState('session-abort')
  for (const event of events) applySessionEvent(state, event, event.time)
  const view = buildView(state, T0 + 30)
  assert.notEqual(view.cancelNote, null)
  assert.equal(typeof view.cancelNote.text, 'string')
  assert.match(view.cancelNote.text, /叫停|停/)
  // It must not claim work that never happened.
  assert.match(view.cancelNote.text, /0 个文件|留着/)
})
// ---------------------------------------------------------------------------
// 思维链：读得到的思路，不是猜出来的思路
// ---------------------------------------------------------------------------

/** One step whose assistant message carries a reasoning block. */
function stepWithThinking(thinking, name, args, at) {
  return [
    { type: 'step/start', time: at, data: { turn: 1, step: 1 } },
    {
      type: 'assistant/message',
      time: at + 1,
      data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: thinking }] } },
    },
    { type: 'tool/call', time: at + 2, data: { turn: 1, step: 1, callId: `c-${at}`, name, arguments: JSON.stringify(args) } },
    { type: 'tool/result', time: at + 7, data: { turn: 1, step: 1, message: { isError: false }, error: null } },
  ]
}

test('thinking: a reasoning block reaches the digest, labelled as report not evidence', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...stepWithThinking('用户要的是先确认配置对不对，我得先去读一下那个配置文件。', 'read', { file_path: 'a.ts' }, T0 + 10),
  ]
  const state = createLensState('session-test')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 20 })
  assert.match(digest, /它心里正在盘算：/)
  assert.match(digest, /配置/)
  // It must sit in the reported half: nothing in the tool record proves a thought.
  const reportedAt = digest.indexOf('【仅据汇报】')
  assert.ok(reportedAt > 0)
  assert.ok(digest.indexOf('它心里正在盘算：') > reportedAt)
})

test('thinking: the live stream is folded in too, not only the durable record', () => {
  const state = createLensState('session-test')
  applyStream(state, { chunk: { type: 'reasoning-delta', text: '先看看它是不是把顺序搞反了，' } }, T0)
  applyStream(state, { chunk: { type: 'reasoning-delta', text: '如果反了就得把两步对调。' } }, T0 + 1)
  assert.match(thinkingDigest(state), /顺序搞反/)
  assert.match(thinkingDigest(state), /对调/)
})

test('thinking: only the tail is kept, because the end is the decision', () => {
  const state = createLensState('session-test')
  noteThinking(state, 'A'.repeat(2000))
  // The buffer is capped, so 2000 characters of filler already lost their front.
  assert.equal(state.thinking.length, 1200)
  const before = state.thinking.length
  noteThinking(state, '接下来去改登录页的跳转。')
  // Still capped, and the newest text is what survived.
  assert.equal(state.thinking.length, 1200)
  assert.equal(state.thinking.length, before)
  assert.match(state.thinking, /接下来去改登录页的跳转/)
  assert.ok(!state.thinking.endsWith('A'))
})

test('thinking: a step boundary clears the previous step reasoning', () => {
  const state = createLensState('session-test')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    { type: 'assistant/message', time: T0 + 1, data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '先读配置确认默认值。' }] } } },
    T0 + 1,
  )
  assert.match(state.thinking, /先读配置/)
  applySessionEvent(state, { type: 'step/start', time: T0 + 2, data: { turn: 1, step: 2 } }, T0 + 2)
  assert.equal(state.thinking, '')
})

test('thinking: reasoning is never mistaken for what the agent said out loud', () => {
  const content = [
    { type: 'reasoning', text: '内心话：也许该换个办法。' },
    { type: 'text', text: '我把配置改好了。' },
  ]
  assert.equal(textOfContent(content), '我把配置改好了。')
  assert.equal(reasoningOfContent(content), '内心话：也许该换个办法。')
  assert.equal(reasoningOfContent([{ type: 'text', text: 'x' }]), '')
})

test('thinking: 正在做 quotes the thought instead of shrugging', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    { type: 'assistant/message', time: T0 + 1, data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '这里得先确认外面那一步通不通，不然改了也白改。' }] } } },
    T0 + 1,
  )
  const view = buildView(state, T0 + 2, {})
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.ok(doing)
  assert.doesNotMatch(doing.text, /在想下一步做什么/)
  assert.match(doing.text, /确认外面那一步/)
  // A thought is still only a claim: no tool call has confirmed it.
  assert.equal(doing.source, 'reported')
})

test('thinking: 下一步 prefers the thought over the template', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    { type: 'assistant/message', time: T0 + 1, data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '先读一下预览脚本，接下来要把预览重新生成一遍，看看窄栏下的效果。' }] } } },
    T0 + 1,
  )
  // A tool call is in flight, so 正在做 describes the tool and 下一步 is free to
  // quote the thought. Without the call both rows would quote it and the
  // de-duplicator would (correctly) replace 下一步 with a template.
  applySessionEvent(
    state,
    { type: 'tool/call', time: T0 + 2, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: JSON.stringify({ file_path: 'preview.mjs' }) } },
    T0 + 2,
  )
  const view = buildView(state, T0 + 3, {})
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(next.text, /预览重新生成|窄栏/)
  assert.equal(next.source, 'reported')
})

test('thinking: a thought never fills both rows at once', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    { type: 'assistant/message', time: T0 + 1, data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '接下来要把预览重新生成一遍，看看窄栏下的效果。' }] } } },
    T0 + 1,
  )
  const view = buildView(state, T0 + 2, {})
  const doing = view.rows.find((row) => row.key === 'doing')
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(doing.text, /预览重新生成/)
  assert.equal(repeats(doing.text, next.text), false)
})

test('thinking: with no thinking at all, the row still admits it is guessing', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  const view = buildView(state, T0 + 1, {})
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(doing.text, '在想下一步做什么。')
})

test('thinking: machine noise inside a thought never reaches the panel', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    { type: 'assistant/message', time: T0 + 1, data: { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '得调用 read_file 读 D:\\work\\x\\y.ts，然后看看 src/auth/login.tsx 里的跳转。' }] } } },
    T0 + 1,
  )
  const view = buildView(state, T0 + 2, {})
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(/read_file|\\|tagclear|login\.tsx/.test(doing.text), false)
})
test('digest: the summary prefix is never doubled', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('edit', { file_path: 'D:\\work\\tagclear\\lib\\a.js' }, T0 + 10),
  ]
  const state = createLensState('session-test')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 20 })
  // buildSummary already opens with 到目前为止：; the digest used to add another.
  assert.equal(digest.includes('到目前为止：到目前为止'), false)
  assert.match(digest, /到目前为止：动了 1 个文件/)
})
test('thinking: English-only reasoning never becomes Chinese panel copy', () => {
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(
    state,
    {
      type: 'assistant/message',
      time: T0 + 1,
      data: {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'reasoning', text: 'Let me check whether the digest actually carries the thinking line now.' }] },
      },
    },
    T0 + 1,
  )
  const view = buildView(state, T0 + 2, {})
  // The panel is Chinese-only: an English thought must not be quoted there.
  assert.equal(thinkingClause(state), '')
  assert.equal(view.rows.find((row) => row.key === 'doing').text, '在想下一步做什么。')
  // The explain door can read it, and it is still the only clue available.
  assert.match(buildDigest(state, { now: T0 + 2 }), /carries the thinking line/)
})

test('digest: a repeated step is not listed twice', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('bash', { command: 'curl' }, T0 + 10),
    ...step('bash', { command: 'curl' }, T0 + 20),
  ]
  const state = createLensState('session-test')
  for (const event of events) applySessionEvent(state, event, event.time)
  const digest = buildDigest(state, { now: T0 + 30 })
  assert.equal(digest.split('\n').filter((line) => line === '- 跑完测试了。' || line.startsWith('- 命令跑完了')).length <= 1, true)
})