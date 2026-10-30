/**
 * Host-half smoke test: drives the real `apply()` with a simulated Aliyun BSS
 * response and the real HTTP handler, so parsing, caching and the credential
 * write path are exercised without a browser or a live AccessKey.
 *
 *   node test/host-smoke.mjs
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

const module = await import('../lib/index.js')

const COUPON_PAYLOAD = {
  Success: true,
  Code: 'Success',
  Data: {
    CashCoupon: [
      {
        CashCouponNo: 'Q-aaa',
        Status: 'Available',
        NominalValue: '100.00',
        Balance: '80.00',
        EffectiveTime: '2026-01-01T00:00:00Z',
        ExpiryTime: '2027-01-01T00:00:00Z',
        ApplicableProducts: '通用',
        Description: '测试券 A',
      },
      {
        CashCouponNo: 'Q-bbb',
        Status: 'Available',
        NominalValue: '50.00',
        Balance: '12.50',
        EffectiveTime: '2026-02-01T00:00:00Z',
        ExpiryTime: '2026-12-01T00:00:00Z',
        ApplicableProducts: '百炼',
        Description: '测试券 B',
      },
      {
        CashCouponNo: 'Q-ccc',
        Status: 'Expired',
        NominalValue: '20.00',
        Balance: '20.00',
        ExpiryTime: '2025-01-01T00:00:00Z',
      },
      {
        CashCouponNo: 'Q-ddd',
        Status: 'Available',
        NominalValue: '10.00',
        Balance: '0.00',
        ExpiryTime: '2027-05-01T00:00:00Z',
      },
    ],
  },
}

const ACCOUNT_PAYLOAD = {
  Success: true,
  Code: '200',
  Data: { AvailableAmount: '1000.00', AvailableCashAmount: '250.00', Currency: 'CNY' },
}

let sawUrls = []
let mode = 'ok'

const realFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  sawUrls.push(String(url))
  if (mode === 'network') throw new Error('getaddrinfo ENOTFOUND business.aliyuncs.com')
  const isCoupon = String(url).includes('QueryCashCoupons')
  const body = isCoupon ? COUPON_PAYLOAD : ACCOUNT_PAYLOAD
  return {
    status: 200,
    async text() {
      return JSON.stringify(body)
    },
  }
}

// --- fake Host context -------------------------------------------------------
const store = new Map()
const credentials = {
  async resolve(ref) {
    return store.has(ref) ? { value: store.get(ref), source: 'file' } : undefined
  },
  async describe(ref) {
    return { configured: store.has(ref), writable: true }
  },
  async set(ref, value) {
    store.set(ref, value)
  },
}

let route
const ctx = {
  get(name) {
    return name === 'credentials' ? credentials : undefined
  },
  webServer: {
    register(candidate) {
      route = candidate
      return () => {
        route = undefined
      }
    },
  },
  effect(fn) {
    return fn()
  },
  logger: { warn() {} },
}

module.apply(ctx, { refreshSeconds: 300 })
assert.equal(route.path, '/api/qwen-coupon-balance', 'route path')
assert.equal(route.kind, 'prefix', 'route kind')

function request(method, path, { body, headers = {} } = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.url = `/api/qwen-coupon-balance${path}`
  stream.headers = { 'sec-fetch-site': 'same-origin', ...headers }
  return stream
}

function call(method, path, options) {
  const req = request(method, path, options)
  return new Promise((resolve) => {
    const res = {
      status: 0,
      headers: {},
      body: '',
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
      },
      end(payload) {
        this.body = payload ?? ''
        resolve({ status: this.status, headers: this.headers, json: JSON.parse(this.body) })
      },
    }
    route.handler(req, res)
  })
}

// 1. Nothing configured yet.
let result = await call('GET', '/state')
assert.equal(result.status, 200)
assert.equal(result.json.configured, false)
assert.equal(result.json.error, null)
assert.equal(sawUrls.length, 0, 'no network call without credentials')
console.log('ok  unconfigured state')

// 2. Save a key: validates first, then persists.
result = await call('POST', '/credentials', {
  body: { accessKeyId: 'LTAI_TEST_ID_1234', accessKeySecret: 'secret-value' },
  headers: { 'content-type': 'application/json' },
})
assert.equal(result.status, 200)
assert.equal(result.json.configured, true)
assert.equal(result.json.ok, true)
assert.equal(result.json.total, '92.50', `total from usable coupons, got ${result.json.total}`)
assert.equal(result.json.couponCount, 2)
assert.equal(result.json.nextExpiry, '2026-12-01T00:00:00Z')
assert.equal(result.json.coupons.length, 2)
assert.equal(result.json.coupons[0].no, 'Q-bbb', 'soonest expiry first')
assert.equal(result.json.otherCount, 2)
assert.equal(result.json.account.cash, '250.00')
assert.equal(result.json.accessKeyId, 'LTAI****1234')
assert.equal(store.get('QWEN_COUPON_ACCESS_KEY_ID'), 'LTAI_TEST_ID_1234')
assert.equal(store.get('QWEN_COUPON_ACCESS_KEY_SECRET'), 'secret-value')
assert.ok(sawUrls.some((url) => url.includes('Signature=')), 'request is signed')
assert.ok(sawUrls.some((url) => url.includes('Action=QueryCashCoupons')))
assert.ok(sawUrls.some((url) => url.includes('Action=QueryAccountBalance')))
console.log('ok  credentials saved, coupons parsed and sorted')

// 3. Second read is served from cache (no new outbound call).
const before = sawUrls.length
result = await call('GET', '/state')
assert.equal(result.json.cached, true)
assert.equal(sawUrls.length, before, 'cached read made no network call')
console.log('ok  cache hit')

// 4. Forced refresh bypasses the cache.
result = await call('POST', '/refresh', { headers: { 'content-type': 'application/json' } })
assert.equal(result.json.cached, false)
assert.equal(sawUrls.length, before + 2, 'refresh made both calls')
console.log('ok  forced refresh')

// 5. A cross-origin / non-JSON write is refused.
result = await call('POST', '/credentials', {
  body: { accessKeyId: 'x', accessKeySecret: 'y' },
  headers: { 'content-type': 'text/plain' },
})
assert.equal(result.status, 415)
console.log('ok  non-JSON write refused')

result = await call('POST', '/credentials', {
  body: { accessKeyId: 'x', accessKeySecret: 'y' },
  headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
})
assert.equal(result.status, 403)
console.log('ok  cross-site write refused')

// 6. A transport failure surfaces as a readable error state, not a crash.
mode = 'network'
result = await call('POST', '/refresh', { headers: { 'content-type': 'application/json' } })
assert.equal(result.status, 200)
assert.equal(result.json.ok, false)
assert.equal(result.json.configured, true)
assert.equal(result.json.error.code, 'NETWORK_ERROR')
assert.ok(result.json.error.hint.length > 0)
console.log('ok  network failure reported')

// 7. An unknown sub-route is a JSON 404.
result = await call('GET', '/nope')
assert.equal(result.status, 404)
assert.equal(result.json.error.code, 'NOT_FOUND')
console.log('ok  unknown route')

globalThis.fetch = realFetch
console.log('\nall host-half checks passed')