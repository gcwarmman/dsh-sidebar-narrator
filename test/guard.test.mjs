import test from 'node:test'
import assert from 'node:assert/strict'

import { isCrossSite, requestsBefore, seedWindow, shouldPush } from '../lib/index.js'

test('push: an unchanged frame is not re-sent', () => {
  // 这个判断曾经是坏的：computeView 顺手改写了 signature，比较两边拿的都是新值，
  // 于是相等永远成立，非 force 的推送全被吃掉 —— 面板停在旧画面上。
  assert.equal(shouldPush('a', 'a', false, 0, 10_000), false)
  assert.equal(shouldPush('a', 'b', false, 0, 10_000), true)
})

test('push: force always goes through, throttle or not', () => {
  assert.equal(shouldPush('a', 'a', true, 1_000_000, 1_000_001), true)
  assert.equal(shouldPush('a', 'b', true, 1_000_000, 1_000_001), true)
})

test('push: a change right after a push waits for the throttle window', () => {
  assert.equal(shouldPush('a', 'b', false, 1_000_000, 1_000_100), false)
  assert.equal(shouldPush('a', 'b', false, 1_000_000, 1_000_400), true)
})

test('guard: the panel own requests pass', () => {
  assert.equal(isCrossSite({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), false)
  assert.equal(isCrossSite({ host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }), false)
})

test('guard: a script on this machine passes, because it can reach the Host anyway', () => {
  assert.equal(isCrossSite({}), false)
  assert.equal(isCrossSite({ host: '127.0.0.1:3080' }), false)
})

test('guard: another site in the same browser is refused', () => {
  assert.equal(isCrossSite({ host: '127.0.0.1:3080', origin: 'https://evil.example' }), true)
  // A look-alike host is still a different host.
  assert.equal(isCrossSite({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:9999' }), true)
  assert.equal(isCrossSite({ 'sec-fetch-site': 'cross-site' }), true)
})

test('guard: an unparsable origin is treated as foreign', () => {
  assert.equal(isCrossSite({ host: '127.0.0.1:3080', origin: 'null' }), true)
})

/** The user actually asking for something. */
function asked(text) {
  return { type: 'user/message', data: { source: { kind: 'user' }, message: { content: [{ type: 'text', text }] } } }
}
/** Filler events, so a window has a length to assert on. */
function noise(count) {
  return Array.from({ length: count }, (_, i) => ({ type: 'tool/result', data: { i } }))
}
/** The harness talking to the session, not the user. */
function notice() {
  return { type: 'user/message', data: { source: { kind: 'user', form: 'notice' } } }
}

test('seed: the replay window reaches back to the request it describes', () => {
  // A request that sat 911 events before the end is the case that broke a live
  // reload: a flat 400-event tail has no request in it, so the panel came back
  // saying 「第 1 / 1 件」 about work 240 steps deep.
  const events = [...noise(500), asked('改一下总结'), ...noise(911)]
  const window = seedWindow(events)
  assert.equal(window[0].type, 'user/message')
  assert.equal(window.length, 912)
})

test('seed: a short session replays whole, and never starts mid-nothing', () => {
  const small = [asked('看看'), ...noise(20)]
  assert.equal(seedWindow(small).length, 21)
  // No request anywhere: fall back to the ordinary tail rather than replaying
  // a whole long log to say the same thing.
  const noRequest = noise(5000)
  assert.equal(seedWindow(noRequest).length, 400)
})

test('seed: a recent request does not shrink the window below the normal tail', () => {
  // The request is 10 events from the end, so the 400-event tail is the wider
  // and cheaper choice — the point is to include the request, not to trim.
  const events = [...noise(1000), asked('继续'), ...noise(10)]
  assert.equal(seedWindow(events).length, 400)
})

test('seed: what the user was told by the system is not a request', () => {
  const events = [...noise(1000), notice(), ...noise(900)]
  assert.equal(seedWindow(events)[0].type, 'tool/result')
  assert.equal(seedWindow(events).length, 400)
})

test('seed: the count keeps counting past the window, so it never restarts at 1', () => {
  // Four requests were served before the window opens. A replay that only
  // counts inside the window says 「第 1 / 1 件」 about the fifth thing asked.
  const events = [
    asked('第一件'), ...noise(50),
    asked('第二件'), ...noise(50),
    asked('第三件'), ...noise(50),
    asked('第四件'), ...noise(50),
    asked('第五件'), ...noise(900),
  ]
  const window = seedWindow(events)
  assert.equal(requestsBefore(events, window), 4)
  assert.equal(window[0].type, 'user/message')
})

test('seed: a whole session needs no head count', () => {
  const events = [asked('看看'), ...noise(20)]
  assert.equal(requestsBefore(events, seedWindow(events)), 0)
})
