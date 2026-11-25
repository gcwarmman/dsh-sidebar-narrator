/**
 * dsh-sidekick-lens — the steward layer.
 *
 * The panel used to *compose* its own copy from rules: a tool call became
 * 「改完了「旁白逻辑」」, a queue item became 「下一件是…」. That is why it read as
 * fragments — the words were ours, not a reading of the work. This module
 * replaces that with a model that is asked, periodically, one narrow question:
 * *what small things has this conversation finished so far?*
 *
 * Everything here is pure: prompt construction, response parsing, and the
 * append-only folding of summaries. No I/O, no timers, no context — so the
 * whole thing is testable without a Host, exactly like `narrative.js`.
 */

/**
 * The steward is asked for facts it can only know from the digest it is given.
 * Kept deliberately short: this runs on a cheap model, repeatedly, and a long
 * prompt would cost more than the summary is worth.
 */
export function stewardPrompt() {
  return [
    '你是这次对话的记录员。你只做一件事：把「到目前为止已经真正做完的小事」整理成一条条记录。',
    '',
    '规则：',
    '1. 只写**已经做完**的事。不要写正在进行、计划、下一步、待办 —— 那些一律不写。',
    '2. 一条记录只讲一件小事，用大白话，不超过 24 个字，句末不要句号。',
    '3. 不要写工具名、函数名、文件绝对路径；需要提到文件时用口语叫法（例如「登录页」「说明文档」）。',
    '4. 只要这次进展里出现了**新做完的事**，就输出 1 到 3 条。',
    '5. 如果这次进展里没有任何新做完的事，只输出一行：NONE',
    '6. 不要输出编号、不要 Markdown、不要解释、不要任何前缀，一行一条。',
    '',
    '例子：',
    '输入：改好了登录页的校验逻辑，跑了一遍测试都过了。',
    '输出：',
    '改好了登录页的校验逻辑',
    '测试全部通过',
  ].join('\n')
}

/**
 * Build the user turn the steward reads.
 *
 * Only the recent window and the last few summaries: the record itself is the
 * memory, so re-sending the whole history every few minutes would be the one
 * way to make this expensive.
 */
export function stewardInput(digest, recentSummaries, options = {}) {
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 8
  const known = Array.isArray(recentSummaries) ? recentSummaries.slice(-limit) : []
  const lines = []
  if (known.length > 0) {
    lines.push('你已经记下的（不要重复它们）：')
    for (const item of known) lines.push(`- ${item}`)
    lines.push('')
  }
  lines.push('这次的新进展：')
  lines.push(String(digest ?? '').slice(0, 2600))
  return lines.join('\n')
}

/**
 * Things that are literally the labels this feature refuses to produce.
 *
 * No `\b` here: JavaScript word boundaries are defined against ASCII word
 * characters, so `\b` after 「正在做」 never matches — the guard silently did
 * nothing and plans went straight into the record.
 */
const FORBIDDEN = /^(正在做|正在|待做|待办|下一步|接下来|准备|计划|todo|next|doing)/i

/**
 * Parse the steward's answer into summary lines.
 *
 * The model is told to answer 「NONE」 when nothing was finished; anything else
 * is split one-per-line, stripped of list markers, and filtered. Filtering here
 * rather than trusting the prompt matters: a cheap model will occasionally slip
 * a plan into a facts list, and showing that would break the one promise the
 * record makes — that everything in it actually happened.
 */
export function parseSteward(text) {
  const body = String(text ?? '').replace(/\r\n?/g, '\n')
  const lines = []
  for (const raw of body.split('\n')) {
    let line = raw
      .replace(/```[a-z]*|```/gi, '')
      .replace(/^\s{0,3}(?:[-*+•]|\d+[.)、])\s*/, '')
      .replace(/^\s*(?:输出|记录)[:：]\s*/, '')
      .trim()
    if (line === '') continue
    if (/^NONE\.?$/i.test(line)) continue
    // 句末标点收掉：这些是记录条目，不是句子。
    line = line.replace(/[。；;，,]+$/, '').trim()
    if (line === '') continue
    // 长度：太短的没有信息量，太长的不是「一件小事」。
    if (line.length < 3 || line.length > 40) continue
    // 计划语气不是「做完的事」，一律丢。
    if (FORBIDDEN.test(line)) continue
    // 只收中文：这是中文面板，英文行是模型跑偏或思考残留。
    if (!/[\u4e00-\u9fff]/.test(line)) continue
    lines.push(line)
  }
  // 一轮最多三条：再多就不是摘要，是把日志又抄了一遍。
  return lines.slice(0, 3)
}

/**
 * Append new lines to the record, dropping ones already recorded.
 *
 * The record is append-only by contract: nothing here ever rewrites or reorders
 * what came before. `seen` is compared on the normalised text so that a model
 * repeating yesterday's line in slightly different punctuation does not create
 * a duplicate entry.
 */
export function appendSteward(record, lines, at) {
  const list = Array.isArray(record) ? record.slice() : []
  const seen = new Set(list.map((item) => normalise(item.text)))
  const added = []
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = normalise(line)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    added.push({ at: toTime(at), text: line })
  }
  if (added.length === 0) return { record: list, added }
  return { record: [...list, ...added], added }
}

function normalise(text) {
  return String(text ?? '')
    .replace(/[\s　]/g, '')
    .replace(/[。；;，,、！!？?：:]+/g, '')
    .toLowerCase()
}

function toTime(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

/**
 * When to ask again.
 *
 * The contract is 「间歇性」, not 「每一次事件」: a summary on every tool result
 * would be a model call every few seconds. `stepsSince` counts finished steps,
 * `msSince` guards against a burst of steps earning several summaries in one
 * minute, and `minSteps` keeps the very first summary from firing on a session
 * that has done nothing yet.
 */
export function shouldSummarise(state, options = {}) {
  const minSteps = typeof options.minSteps === 'number' ? options.minSteps : 4
  const everySteps = typeof options.everySteps === 'number' ? options.everySteps : 4
  const minGapMs = typeof options.minGapMs === 'number' ? options.minGapMs : 45_000
  const done = typeof state?.stepsDone === 'number' ? state.stepsDone : 0
  const lastStep = typeof state?.lastSummaryStep === 'number' ? state.lastSummaryStep : 0
  const lastAt = typeof state?.lastSummaryAt === 'number' ? state.lastSummaryAt : 0
  const now = toTime(options.now)
  const since = done - lastStep
  // 首次要攒够 minSteps；之后按 everySteps 走。取两者较小的那个当门槛：
  // 否则把 everySteps 调到 1（想看每一次进展）时，仍然要等够 minSteps 才动。
  const gate = lastStep === 0 ? Math.min(minSteps, everySteps) : everySteps
  if (since < gate) return false
  if (lastAt !== 0 && now - lastAt < minGapMs) return false
  return true
}
