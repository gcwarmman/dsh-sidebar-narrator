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
  englishAction,
  explainPrompt,
  failureReason,
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
  clause,
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
  assert.equal(pastTense('在跑流水线', 'run'), '跑完了')
  // The shell verbs added so a command row names its own work instead of saying
  // 「命令跑完了」: they need their own past tense, not the first-char guess.
  assert.equal(pastTense('在跑脚本', 'run'), '脚本跑完了')
  assert.equal(pastTense('在读文件', 'run'), '读完了')
  assert.equal(pastTense('在看目录', 'run'), '目录看过了')
  assert.equal(pastTense('在文件里找', 'run'), '翻过了')
  assert.equal(pastTense('在看进程', 'run'), '进程看过了')
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
  assert.equal(/[A-Z]{2,}_/.test(humanError('ERR_PNPM something')), false)
  // An empty reason still has to say something true and actionable. The old
  // catch-all 「碰到个没预料的错，正在想办法绕过去」 was shown for most real
  // failures and told the reader nothing they could act on.
  assert.match(humanError(''), /没做成/)
  assert.doesNotMatch(humanError(''), /没预料的错/)
})

test('humanError names the failures this harness actually produces', () => {
  // These five are the real shapes found in a live session log: `error` carries
  // only `{ name, code }` and the sentence a person needs is in message text.
  assert.match(humanError('FS_NOT_OBSERVED cannot modify a file: file has not been read'), /还没看过这个文件/)
  assert.match(humanError('FS_AMBIGUOUS_EDIT old_string matched 2 times'), /不止一次/)
  assert.match(humanError('TOOL_OUTCOME_UNKNOWN no result was durably recorded'), /结果没记下来/)
  assert.match(humanError('Error: unknown job pwsh-ee22e90fab9f4c72'), /找不到了/)
  assert.match(humanError('the user rejected escalating this command to "danger-full-access"'), /没被批准/)
  // Every branch stays in plain Chinese: no codes, no tool names, no paths.
  for (const raw of [
    'FS_NOT_OBSERVED D:\\work\\proj\\a.js',
    'FS_AMBIGUOUS_EDIT old_string matched 2 times in "D:\\w\\lib\\index.js"',
    'TOOL_OUTCOME_UNKNOWN',
    'unknown job pwsh-1a2b3c4d5e6f',
    'Error: EACCES: permission denied, open "C:\\Windows\\x"',
  ]) {
    const line = humanError(raw)
    assert.equal(/[A-Z]{2,}_|[A-Za-z]:\\|[\\/]|pwsh/.test(line), false, `${raw} → ${line}`)
  }
})

test('humanError quotes the Chinese part of an error it has never seen', () => {
  // A code nobody mapped still must not become a shrug. If the message already
  // contains a readable run of Chinese, that is the most specific thing the
  // panel can honestly say.
  assert.match(humanError('SomeError: 目标文件正在被别的进程写入，请稍后重试'), /目标文件正在被别的进程写入/)
  assert.doesNotMatch(humanError('SomeError: 目标文件正在被别的进程写入，请稍后重试'), /SomeError/)
})

test('failureReason reads the message text, not only the code', () => {
  // The durable event is `{ error: { name, code }, message: { content: [{ text }] } }`.
  // Reading `error.code` alone is exactly why every failure came out generic.
  assert.match(
    failureReason({
      error: { name: 'FsError', code: 'FS_NOT_OBSERVED' },
      message: { isError: true, content: [{ type: 'text', text: 'file has not been read' }] },
    }),
    /file has not been read/,
  )
  // A failure with no `error` object at all still has its text.
  assert.match(failureReason({ error: null, message: { isError: true, content: [{ type: 'text', text: 'unknown job pwsh-1' }] } }), /unknown job/)
  assert.equal(failureReason({}), '')
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
  // 「这里」没有指代对象；卡住的那一步有名字就必须点名。
  assert.match(doing.text, /卡住了/)
  assert.match(doing.text, /改|文件/)
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

test('idle never quotes markdown scaffolding or a dangling lead-in', () => {
  // 真事：上一轮收尾是一段带小标题的汇报，空状态原样印出
  // 「最后一句：## 这次修掉的真问题 **1. 英文调试文本漏进面板**」。
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, {
    type: 'assistant/message', time: T0 + 20,
    data: {
      turn: 1,
      step: 1,
      message: {
        content: [{
          type: 'text',
          text: '## 这次修掉的真问题\n\n**1. 英文调试文本漏进面板**\n\n```\n├── lib/\n```\n\n三行话现在都说人话了。\n\n下面列出还差什么：',
        }],
      },
    },
  }, T0 + 20)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 30, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 30)
  const text = buildIdleText(state, {})
  assert.match(text, /三行话现在都说人话了/)
  assert.equal(/##|\*\*|```|├──/.test(text), false, text)
  // 悬空的引子不能当结尾；上一句完整的才是结论。
  assert.equal(/下面列出还差什么[:：]/.test(text), false, text)
  assert.equal(/[:：，、]$/.test(text.trim()), false, text)
})

test('idle never prints a sentence it had to cut in half', () => {
  // 真事：截断落在句中，空状态以「…可以在没有会」收尾，读者永远不知道结论。
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, {
    type: 'assistant/message', time: T0 + 20,
    data: {
      turn: 1,
      step: 1,
      message: {
        content: [{
          type: 'text',
          text: '理由：语言层零依赖、纯函数，所以「三行话对不对」可以在没有会话、没有模型、没有浏览器的情况下逐条断言，这是这一版最重要的取舍。搞定。',
        }],
      },
    },
  }, T0 + 20)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 30, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 30)
  const text = buildIdleText(state, {})
  assert.match(text, /搞定/)
  assert.equal(/…/.test(text), false, text)
})

test('idle never fuses two lines into one sentence, nor quotes a number it cannot explain', () => {
  // 真事：一行是验收清单（「5 latest/download 链接可用 ✅ 200 / 97798 字节 …」），
  // 下一行才是结论（「全部验完。」）。`scrub` 折叠换行后两句被焊成一句，
  // 结论跟着那一行数字一起被当成长句丢掉，空状态只剩下时长和文件数。
  const state = createLensState('s')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } }, T0)
  applySessionEvent(state, {
    type: 'assistant/message', time: T0 + 20,
    data: {
      turn: 1,
      step: 1,
      message: {
        content: [{
          type: 'text',
          text: '5 latest/download 链接可用 ✅ 200 / 97798 字节 6 条目里加了 tarball: ✅\n\n全部验完。',
        }],
      },
    },
  }, T0 + 20)
  applySessionEvent(state, { type: 'turn/end', time: T0 + 30, data: { turn: 1, reason: { kind: 'completed' } } }, T0 + 30)
  assert.match(buildIdleText(state, {}), /全部验完/)
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
    assert.equal(row.source === 'observed' || row.source === 'inferred' || row.source === 'reported', true)
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
  // The queue item is still the answer — it just no longer prints as a bare
  // fragment. A row made of nothing but the item reads like a label; saying what
  // it means keeps the row a sentence while still naming the same todo.
  assert.match(next.text, /补一个边界测试/)
  assert.match(next.text, /下一件是/)
  assert.equal(next.source, 'observed')
  // And it has to agree with the ledger rather than telling its own story.
  assert.match(view.summary, /补一个边界测试/)
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

test('regression: a borrowed clause never leaves a bracket hanging open', () => {
  // 真事：截断点正好落在「（」后面，面板印出
  // 「在读文件「客户端」，功能侧已确认完好（ 返回 200，三行、灯、位置、…」
  // —— 括号引进来的东西没进来，读者只看见半个括号和一片空白。
  const line = clause('功能侧已确认完好（ 返回 200，三行、灯、位置、命名空间都对', 26)
  assert.equal(/[（(「《]$/.test(line), false, line)
  assert.equal(/[（(]/.test(line), false, line)
  // 配对完整的括号照旧保留：它们本来就是一个整体。
  assert.equal(clause('确认（只读）够用', 40), '确认（只读）够用')
  // 末尾的省略号也是截断的痕迹，一起收掉。
  assert.equal(/…$/.test(clause('把这一长串说法先截一下看看效果如何', 8)), false)
})

test('regression: a finished-work sentence never becomes the reason, whatever its wording', () => {
  // 「已完成」「已生效」之外，「已确认」「看过了」同样是汇报干完的事。
  for (const done of ['功能侧已确认完好', '刚才看过了，没问题', '已经读完了这一段', '语法查过了']) {
    assert.equal(looksForward(done), false, done)
  }
  // 真正的打算仍然要留下，别把判据收得连打算都拦掉。
  for (const plan of ['接下来要确认窄栏下的效果', '先看看预览生成的顺序']) {
    assert.equal(looksForward(plan), true, plan)
  }
})

test('thinking: a category word becomes the file the thought actually named', () => {
  // 真事：思考里写着「grep for sidebarRight in ui-plugin.md」，面板却说「在看界面」。
  const state = createLensState('session-test')
  noteThinking(state, ' Let me grep the sidebar panel CSS in ui-plugin.md before touching anything.')
  assert.match(englishAction(state), /ui-plugin|插件|说明文档/)
  assert.notEqual(englishAction(state), '看界面')
})

test('thinking: with no file named, the finished step lends its object instead of a category', () => {
  // 思考只点到类别词，而上一步刚刚点过具体文件：借那个，不退回「界面」。
  const state = createLensState('session-test')
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 2,
    data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: JSON.stringify({ file_path: 'D:\\work\\x\\lib\\client.js' }) },
  })
  applySessionEvent(state, {
    type: 'tool/result', time: T0 + 3,
    data: { turn: 1, step: 1, callId: 'c1', name: 'read', result: { ok: true }, message: { role: 'tool', content: [{ type: 'text', text: 'ok' }] } },
  })
  noteThinking(state, ' Let me look at the ui layout panel next.')
  // 借来的宾语带上一步的说法（「客户端」的代码），仍然远胜「看界面」。
  assert.match(englishAction(state), /客户端/)
  assert.equal(/界面/.test(englishAction(state)), false, englishAction(state))
})

test('rows: a category-level guess yields to the step that named something', () => {
  // 「接着看界面」在一场里出现 501 次；而「正在做」那行早就点着具体文件。
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  noteThinking(state, ' Now look at the ui panel layout for the sidebar.')
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 2,
    data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: JSON.stringify({ file_path: 'D:\\work\\x\\lib\\narrative.js', old_string: 'a', new_string: 'b' }) },
  })
  const view = buildView(state, T0 + 3, {})
  const next = view.rows.find((row) => row.key === 'next')
  assert.equal(/界面/.test(next.text), false, next.text)
})

test('rows: 下一步 is never just 正在做 re-tensed', () => {
  // 真会话里「在看「客户端」。」头上顶着「接着看「客户端」。」211 帧；整场 63.9% 的帧
  // 里两行都点着同一个对象。`repeats` 认不出这个 —— 它要六个连续相同字符，而
  // 「在看」「接着看」只有两三个。这类行不是下一步，是把上面那行又念了一遍。
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 2,
    data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: JSON.stringify({ file_path: 'D:\\work\\x\\lib\\client.js' }) },
  })
  const view = buildView(state, T0 + 3, {})
  const doing = view.rows.find((row) => row.key === 'doing')
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(doing.text, /客户端/, doing.text)
  // 同一个对象 + 同一个动作：不能换个时态再印一遍。
  assert.doesNotMatch(next.text, /^接着[看读翻]/, `${next.text}  ←  ${doing.text}`)
})

test('rows: two different moves on one file still both show', () => {
  // 同一份文件、两个不同动作（改完 → 跑测试确认）是读者最需要的一对，不能被去重吃掉。
  const state = createLensState('session-test')
  applyAgentStatus(state, 'running', T0)
  applySessionEvent(state, { type: 'turn/start', time: T0, data: { turn: 1 } })
  applySessionEvent(state, {
    type: 'tool/call', time: T0 + 2,
    data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: JSON.stringify({ file_path: 'D:\\work\\x\\lib\\client.js', old_string: 'a', new_string: 'b' }) },
  })
  applySessionEvent(state, {
    type: 'tool/result', time: T0 + 3,
    data: { turn: 1, step: 1, callId: 'c1', message: { isError: false }, error: null },
  })
  applySessionEvent(state, { type: 'step/start', time: T0 + 4, data: { turn: 1, step: 2 } })
  const view = buildView(state, T0 + 5, {})
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(next.text, /跑一遍测试/, next.text)
})


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
  // It must not claim work that never happened, and it must not report the step
  // count: 「已经做完 49 步」 counts tool calls, which is not progress.
  assert.match(view.cancelNote.text, /0 个文件|留着|还没改到文件/)
  assert.doesNotMatch(view.cancelNote.text, /\d+ 步/)
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
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.equal(/[A-Za-z]{3,}/.test(doing.text), false, `English leaked: ${doing.text}`)
  // But it is not allowed to shrug either: the action is readable even in English,
  // so the row says what it is about instead of falling to the template.
  assert.match(doing.text, /在(看|找|改|跑|发|掂量|盯)/)
  assert.notEqual(doing.text, '在想下一步做什么。')
  // The explain door can read it, and it is still the only clue available.
  assert.match(buildDigest(state, { now: T0 + 2 }), /carries the thinking line/)
})

test('thinking: an English thought is read for its action, not ignored', () => {
  const read = createLensState('s1')
  noteThinking(read, ' Let me read the narrative file to confirm the merge logic.')
  assert.equal(englishAction(read), '看文件')

  const write = createLensState('s2')
  noteThinking(write, ' I will update the test for the new panel behaviour.')
  assert.equal(englishAction(write), '改测试')

  const run = createLensState('s3')
  noteThinking(run, ' Now run the test suite to check nothing broke.')
  assert.equal(englishAction(run), '跑测试')

  // A thought that names only an object still beats a shrug.
  const onlyObject = createLensState('s4')
  noteThinking(onlyObject, ' The README needs to mention this.')
  assert.equal(englishAction(onlyObject), '盯文档')

  // Nothing recognisable: better to say nothing and let the template admit it.
  const mute = createLensState('s5')
  noteThinking(mute, ' Hmm. Okay.')
  assert.equal(englishAction(mute), '')

  // Chinese thoughts are thinkingClause's job; this must not double-read them.
  const chinese = createLensState('s6')
  noteThinking(chinese, '接下来去看登录页的跳转逻辑。')
  assert.equal(englishAction(chinese), '')
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
test('thinking: kebab-case package names never reach the panel', () => {
  const state = createLensState('session-test')
  noteThinking(state, '装的插件出现在引导页里 sidekick-lens，接下来要确认它排在什么位置。')
  const digest = thinkingDigest(state)
  assert.equal(/sidekick-lens/.test(digest), false, digest)
  assert.match(digest, /某个名字/)
  assert.match(digest, /接下来要确认它排在什么位置/, digest)
})

test('thinking: an ALL-CAPS file name is neutralised too', () => {
  const state = createLensState('session-test')
  noteThinking(state, '看看 dsh-sidebar-narrator 这个仓库的 README，再写条目。')
  const digest = thinkingDigest(state)
  assert.equal(/README/.test(digest), false, digest)
  assert.equal(/dsh-sidebar-narrator/.test(digest), false, digest)
})

test('thinking: a path is swallowed whole, not one segment at a time', () => {
  const state = createLensState('session-test')
  noteThinking(state, '先读 src/components/my-widget.tsx 里的实现，然后改 login-page。')
  const digest = thinkingDigest(state)
  assert.equal(/(src\/|\.tsx)/.test(digest), false, digest)
  assert.equal(/某个文件\/某个文件/.test(digest), false, digest)
  assert.equal(/某个文件 某个文件/.test(digest), false, digest)
})

test('thinking: windows-style absolute paths collapse to one noun', () => {
  const state = createLensState('session-test')
  noteThinking(state, '在 C:/Users/edy/project/src/app.ts 里加了错误处理。')
  const digest = thinkingDigest(state)
  assert.equal(/(C:|\/Users\/|\.ts)/.test(digest), false, digest)
})

test('thinking: no space is left dangling before a Chinese comma', () => {
  const state = createLensState('session-test')
  noteThinking(state, '装的插件出现在引导页里 sidekick-lens，接下来要确认。')
  const digest = thinkingDigest(state)
  assert.equal(/ 某个名字，/.test(digest), false, digest)
})
test('intent: a debug fragment never becomes the sentence the panel shows', () => {
  assert.equal(intentOf('读得太早了点现在展开 after1: true de...'), '读得太早了点现在展开')
  assert.equal(intentOf('OK.'), '')
  assert.equal(intentOf('The panel is broken, I will fix it.'), '')
})

test('intent: an English-only line never becomes a Chinese panel row', () => {
  assert.equal(intentOf('Now I will run the test suite.'), '')
  assert.equal(intentOf('接下来改 lib/client.js 里的图片。'), '接下来改某个文件里的图片')
})

test('thinking: the panel drops ASCII debris, the explain door keeps English prose', () => {
  const state = createLensState('session-test')
  noteThinking(state, '读得太早了点现在展开 after1: true de...，接着看 after2。')
  // Strict: what the panel is allowed to quote.
  const strict = thinkingDigest(state, 'strict')
  assert.equal(/[A-Za-z0-9]/.test(strict), false, strict)
  // Loose: what the explain door may read. English is fine there.
  const english = createLensState('session-test')
  noteThinking(english, 'Let me check whether the digest carries the thinking line now.')
  assert.match(thinkingDigest(english), /carries the thinking line/)
  // The panel still refuses to quote that English thought.
  assert.equal(thinkingClause(english), '')
})

// ---------------------------------------------------------------------------
// 三行不许退化成模板：它们必须是对此刻的读数，且必须读同一份账
// ---------------------------------------------------------------------------

test('rows: a whole working session never falls back to the placeholder sentence', () => {
  // A real replay showed 28% of frames saying 「在想下一步做什么」 — the panel
  // admitting it could see nothing. Anything that reintroduces a fixed sentence
  // as the common case should fail here.
  const events = [{ type: 'turn/start', time: T0, data: { turn: 1 } }]
  for (let i = 0; i < 12; i += 1) {
    const at = T0 + 100 + i * 40
    events.push(...step('read', { file_path: `D:\\work\\proj\\m${i}.ts` }, at))
    events.push(...step('edit', { file_path: `D:\\work\\proj\\m${i}.ts` }, at + 20))
  }
  events.push(...step('bash', { command: 'node --test' }, T0 + 900))
  const texts = new Set()
  for (let i = 0; i < 40; i += 1) {
    const cut = events.filter((event) => event.time <= T0 + 100 + i * 25)
    if (cut.length === 0) continue
    const view = replay(cut, { now: T0 + 100 + i * 25 })
    const doing = view.rows.find((row) => row.key === 'doing')
    if (doing !== undefined) texts.add(doing.text)
  }
  assert.equal(texts.has('在想下一步做什么。'), false, [...texts].join(' | '))
  assert.equal(texts.size > 3, true, `only ${texts.size} distinct readings`)
})

test('rows: the next row and the summary name the same queue item', () => {
  // Two readings of one moment must not disagree: if the ledger says the next
  // item is X, the row above cannot promise Y.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'D:\\work\\proj\\a.ts' }, T0 + 10),
    { type: 'todo/write', time: T0 + 20, data: { todos: [
      { status: 'completed', text: '搭骨架' },
      { status: 'pending', text: '补边界测试' },
      { status: 'pending', text: '写说明' },
    ] } },
  ]
  const view = replay(events, { now: T0 + 30 })
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(next.text, /补边界测试/)
  assert.match(view.summary, /补边界测试/)
  // And it says how much is left, so the row changes as the queue drains.
  assert.match(next.text, /2 件/)
})

test('progress: a placeholder is never listed as a file name', () => {
  // desensitize() replaces names it will not print with 「某个文件」. If that word
  // reaches the ledger the summary reads 「动了 2 个文件（旁白逻辑、某个文件）」.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'D:\\work\\proj\\narrative.js' }, T0 + 10),
    ...step('edit', { file_path: 'D:\\work\\proj\\narrative.js' }, T0 + 20),
    ...step('edit', { file_path: 'D:\\work\\proj\\opaque-1a2b3c4d.mjs' }, T0 + 30),
  ]
  const view = replay(events, { now: T0 + 40 })
  assert.equal(view.progress.touched.includes('某个文件'), false, view.progress.touched.join(','))
  // The count still counts it: an unnamed file did change.
  assert.equal(view.progress.files, 2)
  // And when the names cannot account for the count, none are listed at all.
  assert.doesNotMatch(view.summary, /个文件（/)
})

test('rows: a nested quote never leaks into the sentence', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'D:\\work\\proj\\narrative.js' }, T0 + 10),
  ]
  const view = replay(events, { now: T0 + 20 })
  for (const row of view.rows) {
    const opens = (row.text.match(/「/g) ?? []).length
    const closes = (row.text.match(/」/g) ?? []).length
    assert.equal(opens, closes, row.text)
  }
})
test('rows: naming the same file in both rows is not the same sentence', () => {
  // The old overlap test compared raw wording, so two lines that both mentioned
  // the login page were treated as duplicates and one of them was flattened into
  // a generic sentence. They are in fact the two things the reader needs.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'src/auth/login.tsx' }, T0 + 10),
    { type: 'step/start', time: T0 + 30, data: { turn: 1, step: 2 } },
  ]
  const view = replay(events, { now: T0 + 31 })
  const next = view.rows.find((row) => row.key === 'next')
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.match(next.text, /看出来的问题改掉/, next.text)
  assert.doesNotMatch(next.text, /等这一步的结果出来再定/, '下一步 collapsed into a template')
  assert.doesNotMatch(doing.text, /上一步做完了/, '正在做 collapsed into a template')
})

test('rows: a gap sentence never doubles the past tense', () => {
  // `刚` already puts the sentence in the past, so 「刚看过了」 reads as a stutter.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'src/auth/login.tsx' }, T0 + 10),
    { type: 'step/start', time: T0 + 30, data: { turn: 1, step: 2 } },
  ]
  const view = replay(events, { now: T0 + 31 })
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.doesNotMatch(doing.text, /刚[^，]*过了/, doing.text)
})

test('rows: a step is reported finished, not narrated twice', () => {
  // 「刚翻过「客户端」，在判断要不要接着改」 repeats the row above (same action, same
  // object) and adds a stock tail. In one real session 41% of 正在做 frames carried
  // one of five such tails, so the row said nothing the frame before had not.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'src/auth/login.tsx' }, T0 + 10),
    { type: 'step/start', time: T0 + 30, data: { turn: 1, step: 2 } },
  ]
  const view = replay(events, { now: T0 + 31 })
  const done = view.rows.find((row) => row.key === 'done')
  const doing = view.rows.find((row) => row.key === 'doing')
  const actions = /在挑下一处该看的地方|在找下一处要动的地方|在判断要不要接着改|看清楚里面到底写了什么/
  assert.doesNotMatch(doing.text, actions, doing.text)
  // It still has to say where the work stands — silence is not an improvement.
  assert.match(doing.text, /这步收尾了|还没开下一步/, doing.text)
  assert.notEqual(doing.text.replace(/[。！？]/g, ''), done.text.replace(/[。！？]/g, ''))
})

test('rows: a long wait is a number, not a shrug', () => {
  // 「在看「图标」」 reads the same whether the call started two seconds ago or has
  // been hanging for eighteen minutes — and the hanging case is the one where the
  // reader needs to know. The number only appears past a minute so short steps stay
  // clean.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
  ]
  const quick = replay([
    ...events,
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"src/auth/login.tsx"}' } },
  ], { now: T0 + 15 })
  assert.doesNotMatch(quick.rows.find((row) => row.key === 'doing').text, /已经/, 'a 5-second call needs no number')

  const stuck = replay([
    ...events,
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"src/auth/login.tsx"}' } },
  ], { now: T0 + 10 + 18 * 60_000 })
  const doing = stuck.rows.find((row) => row.key === 'doing')
  assert.match(doing.text, /已经 18 分钟了/, doing.text)
})

test('rows: a long gap after the last step also says how long', () => {
  // Same argument for the between-steps sentence: 「这步收尾了，还没开下一步」 is
  // honest but leaves the reader unable to tell a pause from a wedge.
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'src/auth/login.tsx' }, T0 + 10),
    { type: 'step/start', time: T0 + 30, data: { turn: 1, step: 2 } },
  ]
  const view = replay(events, { now: T0 + 30 + 4 * 60_000 })
  const doing = view.rows.find((row) => row.key === 'doing')
  assert.match(doing.text, /已经 4 分钟没有新动作/, doing.text)
})

test('provenance: a next step that a template invented is never tagged observed', () => {
  // The panel has three sources, and 已观察到 has to keep meaning what README says
  // it means: a tool call and its result were actually read. A row derived from
  // 「上一步是 read，所以下一步大概是改」 is a prediction, and in one real session
  // 99.1% of 下一步 rows claimed otherwise.
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ...step('read', { file_path: 'src/auth/login.tsx' }, T0 + 10),
    { type: 'step/start', time: T0 + 30, data: { turn: 1, step: 2 } },
  ], { now: T0 + 40 })
  const next = view.rows.find((row) => row.key === 'next')
  assert.equal(next.source, 'inferred')
  const done = view.rows.find((row) => row.key === 'done')
  // The finished row really did come off a tool result, so it stays observed.
  assert.equal(done.source, 'observed')
})

test('provenance: a queue item is evidence, and so is the call in flight', () => {
  const queued = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 50, data: { todos: [{ status: 'pending', text: '补一个边界测试' }] } },
  ], { now: T0 + 60 })
  assert.equal(queued.rows.find((row) => row.key === 'next').source, 'observed')

  const running = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'todo/write', time: T0 + 50, data: { todos: [{ status: 'pending', text: '补一个边界测试' }] } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"path":"/a/login.tsx"}' } },
  ], { now: T0 + 150 })
  assert.equal(running.rows.find((row) => row.key === 'doing').source, 'observed')
})

// ---------------------------------------------------------------------------
// 进度：以「用户提的事」为单位，不是工具调用
// ---------------------------------------------------------------------------

/** One human request, shaped like the real `user/message` events. */
function ask(text, at) {
  return {
    type: 'user/message',
    time: at,
    data: { source: { kind: 'user', form: 'message' }, message: { content: [{ type: 'text', text }] } },
  }
}

test('progress: the unit is the request, not the tool call', () => {
  // The session that prompted this had 43 human messages and 2244 tool calls. The
  // panel counted calls, so it reported 「第 49 / 50 步」 — a number with no relation
  // to whether anything the user asked for had been done.
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把登录页的报错文案改掉', T0 + 5),
    ...step('read', { file_path: 'src/login.tsx' }, T0 + 10),
    ...step('read', { file_path: 'src/auth.ts' }, T0 + 20),
    ...step('edit', { file_path: 'src/login.tsx' }, T0 + 30),
    ...step('bash', { command: 'node --test' }, T0 + 40),
  ], { now: T0 + 50 })

  // 五步工具调用，但只有一件用户请求。
  assert.equal(view.progress.steps, 4)
  assert.equal(view.position.unit, 'request')
  assert.equal(view.position.total, 1)
  assert.equal(view.request.n, 1)
  assert.match(view.summary, /你提的第 1 件/)
})

test('progress: a change is only trustworthy once something ran after it', () => {
  // 先跑后改：那次跑没有碰到改动，不能算验证过。这是「改完能不能信」的分界，
  // 也是面板唯一有资格说「好了」的依据。
  const ranThenEdited = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('换个校验方式', T0 + 5),
    ...step('bash', { command: 'node --test' }, T0 + 10),
    ...step('edit', { file_path: 'src/auth.ts' }, T0 + 20),
  ], { now: T0 + 30 })
  assert.equal(ranThenEdited.request.ran, true)
  assert.equal(ranThenEdited.request.verified, false)
  // 「改之前跑过一次」和「压根没跑过」对读者是同一件事：这次改动没有证据。
  assert.equal(ranThenEdited.request.status, 'changed-unverified')
  assert.equal(ranThenEdited.request.open, '跑一遍验证')
  assert.match(ranThenEdited.request.verdict, /还没跑过验证/)

  // 改完再跑，跑过了：这才叫验证过。
  const editedThenRan = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('换个校验方式', T0 + 5),
    ...step('edit', { file_path: 'src/auth.ts' }, T0 + 10),
    ...step('bash', { command: 'node --test' }, T0 + 20),
  ], { now: T0 + 30 })
  assert.equal(editedThenRan.request.verified, true)
  assert.equal(editedThenRan.request.status, 'verified')
  assert.equal(editedThenRan.request.open, '')
  assert.match(editedThenRan.request.verdict, /跑过验证/)
})

test('progress: a failed run after the edit is a block, not a finish', () => {
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把守卫补上', T0 + 5),
    ...step('edit', { file_path: 'src/guard.ts' }, T0 + 10),
    { type: 'tool/call', time: T0 + 20, data: { turn: 1, step: 1, callId: 'c-bad', name: 'bash', arguments: JSON.stringify({ command: 'node --test' }) } },
    {
      type: 'tool/result',
      time: T0 + 25,
      data: {
        turn: 1,
        step: 1,
        message: { isError: true, content: [{ type: 'text', text: 'Error: 1 test failed' }] },
        error: { name: 'ProcessError', code: 'EXIT_1' },
      },
    },
  ]
  const view = replay(events, { now: T0 + 30 })
  assert.equal(view.request.ran, true)
  assert.equal(view.request.verified, false)
  assert.equal(view.request.status, 'blocked')
  assert.equal(view.request.open, '把没过的验证修好')
  assert.match(view.request.verdict, /卡住了/)
  // 状态行必须说出「还差什么」，不能只说「卡住了」。
  assert.match(view.summary, /还差|碰了/)
})

test('progress: a request that only looked around says so instead of pretending', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('先看看这个仓库是干什么的', T0 + 5),
    ...step('read', { file_path: 'README.md' }, T0 + 10),
    ...step('read', { file_path: 'package.json' }, T0 + 20),
  ], { now: T0 + 30 })
  assert.equal(view.request.changed, false)
  assert.equal(view.request.status, 'looking')
  assert.equal(view.request.open, '先找到要改的地方')
  assert.match(view.request.verdict, /还在看/)
})

test('progress: the user speaking again closes the previous request', () => {
  const state = createLensState('session-request-chain')
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('先改文案', T0 + 5),
    ...step('edit', { file_path: 'src/copy.ts' }, T0 + 10),
    ask('再改一下图标', T0 + 20),
  ]
  for (const event of events) applySessionEvent(state, event, event.time)
  assert.equal(state.requestCount, 2)
  assert.equal(state.request.n, 2)
  // 上一件有实活，所以它算做完了；说清楚是被下一件顶掉的，还是主动收的。
  const view = buildView(state, T0 + 30, {})
  assert.equal(view.position.total, 2)
  assert.equal(view.position.index, 2)
})

test('progress: the checklist no longer stands in for progress', () => {
  // 清单是计划，不是进度。43 件请求里可能只写过一次清单；按清单算进度，
  // 读者会以为「还剩 7 件」说明事情快好了，而实际上可能压根没开始。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('做插件', T0 + 5),
    { type: 'todo/write', time: T0 + 10, data: { todos: [
      { status: 'in_progress', text: '搭好结构' },
      { status: 'pending', text: '写文档' },
    ] } },
  ], { now: T0 + 20 })
  assert.equal(view.position.unit, 'request')
  assert.equal(view.position.total, 1)
  // 清单仍然照实报，只是它不再冒充「第几步」。
  assert.equal(view.progress.todos.total, 2)
})

test('status: 等你回话 is its own state, not another kind of running', () => {
  // 在跑和在等人是两件事：前者你可以走开，后者你不看它就永远停在那儿。
  // 灯色不新增（仍是青），但状态词必须换成「等你回话」。
  const asking = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'ask_user_question', arguments: '{}' } },
  ], { now: T0 + 200 })
  assert.equal(asking.status, 'waiting')
  assert.equal(asking.light, 'cyan')

  const working = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"/app/src/a.ts"}' } },
  ], { now: T0 + 200 })
  assert.equal(working.status, 'working')

  const failed = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 100, data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"file_path":"/app/src/a.ts"}' } },
    { type: 'tool/result', time: T0 + 200, data: { turn: 1, step: 1, message: { isError: true }, error: { name: 'FS_NOT_OBSERVED', code: 'FS_NOT_OBSERVED' } } },
  ], { now: T0 + 300 })
  assert.equal(failed.status, 'failed')

  const done = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'turn/end', time: T0 + 100, data: { turn: 1, status: 'completed' } },
  ], { now: T0 + 200 })
  assert.equal(done.status, 'done')
})

test('status: the header gets a duration it can count up, not a frozen string', () => {
  // 客户端拿 elapsedMs + updatedAt 自己往前推，所以两帧之间数字也在走。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    { type: 'tool/call', time: T0 + 90_000, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"/app/src/a.ts"}' } },
  ], { now: T0 + 120_000 })
  assert.equal(view.running, true)
  assert.equal(typeof view.elapsedMs, 'number')
  assert.ok(view.elapsedMs >= 120_000, `elapsedMs should reach the frame time, got ${view.elapsedMs}`)
})

// ---------------------------------------------------------------------------
// 总结：它自己说的话，不是从工具调用推出来的账
// ---------------------------------------------------------------------------

/** One assistant turn that says `text` out loud. */
function says(text, at, step = 1) {
  return {
    type: 'assistant/message',
    time: at,
    data: { turn: 1, step, message: { content: [{ type: 'text', text }] } },
  }
}

/**
 * A read step in flight. A session that only ever sent an assistant message has
 * no finished work, and then 已完成 is deliberately not rendered at all — the
 * row under test needs one real step behind it.
 */
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

test('summary: 已完成 quotes what it said it achieved, not the file it touched', () => {
  // 工具调用只会说「翻了类型定义」；「API 调研已经完成」这句只存在于它自己的正文里，
  // 而读者问的正是后者。工具那句降到展开详情里当证据。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('帮我调研', T0 + 5),
    { type: 'tool/call', time: T0 + 10, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"/app/src/types.ts"}' } },
    { type: 'tool/result', time: T0 + 20, data: { turn: 1, step: 1, callId: 'c1', message: { content: [{ type: 'text', text: 'ok' }] } } },
    says('API 调研已经完成。', T0 + 25),
  ], { now: T0 + 30 })
  const done = view.rows.find((row) => row.key === 'done')
  assert.equal(done.source, 'reported')
  assert.match(done.text, /API 调研已经完成/)
  assert.doesNotMatch(done.text, /类型定义/)
  // 证据没丢，只是挪到了展开里。
  assert.match(done.details.saw, /类型定义/)
})

test('summary: 还剩 several problems is progress, not a shrug', () => {
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('修一下', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('还剩两个问题：双重引号已经修好，但下一步仍固定在 10 种取值上。', T0 + 25),
  ], { now: T0 + 30 })
  const done = view.rows.find((row) => row.key === 'done')
  assert.equal(done.source, 'reported')
  assert.match(done.text, /还剩两个问题/)
})

test('summary: a plan never ends on the colon that introduced a list', () => {
  // 「接下来重新加载并检查：」原文后面跟着清单；直接贴进总结就成了
  // 「接下来重新加载并检查：。」—— 一个停在不该停的地方的句子。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('看看效果', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('接下来重新加载并到真实页面上检查：', T0 + 25),
  ], { now: T0 + 30 })
  assert.doesNotMatch(view.summary, /[：:]。/)
  assert.match(view.summary, /接下来重新加载并到真实页面上检查。$/)
  for (const row of view.rows) assert.doesNotMatch(row.text, /[：:]。/)
})

test('summary: a plan the 正在做 row already quotes is not printed twice', () => {
  // 同一个计划被两行各念一遍是最吵的噪音：那是同一件事，不是进展。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('看看效果', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('接下来重新加载并到真实页面上检查：', T0 + 25),
  ], { now: T0 + 30 })
  const doing = view.rows.find((row) => row.key === 'doing')
  const next = view.rows.find((row) => row.key === 'next')
  assert.match(doing.text, /接下来重新加载并到真实页面上检查/)
  assert.doesNotMatch(next.text, /接下来重新加载并到真实页面上检查/)
})

test('summary: the plan it wrote is handed to the panel as a checklist', () => {
  // 用户要的「有什么计划」就是这几条，原样给出去，不概括。
  const view = replay([
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('把剩下的做完', T0 + 5),
    ...readStep(T0 + 10, 1),
    says('接下来这几步：\n1. 补上回归测试\n2. 更新 README 文档\n3. 重装插件验证一遍', T0 + 25),
  ], { now: T0 + 30 })
  assert.deepEqual(view.checklist, ['补上回归测试', '更新 README 文档', '重装插件验证一遍'])
})

test('summary: a stale plan is dropped, not quoted as the current one', () => {
  // 三百步以前写下的清单是另一件活。引用它等于替它许一个它早忘了的诺。
  const events = [
    { type: 'turn/start', time: T0, data: { turn: 1 } },
    ask('做插件', T0 + 5),
    ...readStep(T0 + 8, 1),
    says('接下来补回归测试。\n1. 补上回归测试\n2. 更新 README 文档', T0 + 25),
  ]
  for (let step = 2; step <= 200; step += 1) {
    events.push(...readStep(T0 + 25 + step, step))
  }
  const view = replay(events, { now: T0 + 400 })
  assert.deepEqual(view.checklist, [])
  const next = view.rows.find((row) => row.key === 'next')
  assert.notEqual(next.source, 'reported')
})
