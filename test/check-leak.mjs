// 验 proof：只读问答通道是否污染了主会话日志。
// 会话日志是「多帧 zstd 追加」格式（每帧单独压缩后追加），Node 的流式解压遇到
// 第二帧会报 Unknown frame descriptor，所以这里先扫出每帧的起始偏移再逐帧解压。
// 用法：node check-leak.mjs <session.jsonl.zstd> <marker> [expect]
//   expect=absent（默认）→ 标记不得变成 user/message 或 inbox 片段（只读通道）
//   expect=steer       → 标记必须变成一条 user/message（steer 通道）
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const [, , file, marker, expectArg] = process.argv
const expect = expectArg ?? 'absent'
if (file === undefined || marker === undefined) {
  console.error('usage: node check-leak.mjs <session.jsonl.zstd> <marker> [absent|steer]')
  process.exit(2)
}

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const buffer = readFileSync(file)

const offsets = []
for (let index = 0; index <= buffer.length - 4; index += 1) {
  if (buffer[index] === 0x28 && buffer[index + 1] === 0xb5 && buffer[index + 2] === 0x2f && buffer[index + 3] === 0xfd) {
    offsets.push(index)
  }
}

const pieces = []
let frames = 0
for (let index = 0; index < offsets.length; index += 1) {
  const start = offsets[index]
  const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
  try {
    pieces.push(zstdDecompressSync(buffer.subarray(start, end)))
    frames += 1
  } catch {
    /* a false magic hit inside a block — skip it */
  }
}

const text = Buffer.concat(pieces).toString('utf8')
const lines = text.split('\n').filter((line) => line.trim() !== '')
const hits = lines.filter((line) => line.includes(marker))

// 关键判据不是“标记出现在日志里”（我自己发这条命令，tool/call 参数里当然有它），
// 而是它有没有变成一条 user/message —— 那才叫“污染了主会话”。
const userMessages = hits.filter((line) => line.includes('"type":"user/message"'))
const inboxSplices = hits.filter((line) => line.includes('"type":"agent/inbox/spliced"'))
const byType = new Map()
for (const hit of hits) {
  const match = hit.match(/"type":"([^"]+)"/)
  const type = match === null ? '?' : match[1]
  byType.set(type, (byType.get(type) ?? 0) + 1)
}

console.log(`frames decoded: ${frames} (magic hits ${offsets.length})`)
console.log(`log bytes: ${text.length}`)
console.log(`event lines: ${lines.length}`)
console.log(`marker hits: ${hits.length} ${JSON.stringify([...byType])}`)
console.log(`  as user/message: ${userMessages.length}`)
console.log(`  as agent/inbox/spliced: ${inboxSplices.length}`)
for (const hit of hits.filter((line) => line.includes('"type":"user/message"')).slice(0, 2)) {
  console.log('  user/message ---', hit.slice(0, 260))
}

let clean
if (expect === 'steer') {
  // steer 应当作为一条真正的 user/message 落进会话日志，且 id 由插件生成。
  clean = userMessages.length >= 1
  console.log(clean ? 'RESULT: steer landed as a user message' : 'RESULT: steer did NOT land')
} else {
  const leaked = userMessages.length + inboxSplices.length
  clean = leaked === 0
  console.log(clean ? 'RESULT: clean — 只读通道没有往主会话塞任何消息' : 'RESULT: LEAKED')
}
process.exit(clean ? 0 : 1)
