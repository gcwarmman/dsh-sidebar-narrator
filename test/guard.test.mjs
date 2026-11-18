import test from 'node:test'
import assert from 'node:assert/strict'

import { isCrossSite } from '../lib/index.js'

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