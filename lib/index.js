/**
 * dsh-qwen-coupon-balance —— Host half.
 *
 * Reads the Alibaba Cloud account's cash coupons (代金券) through the BSS OpenAPI and
 * exposes them to the browser half over one same-origin route. The AccessKey lives in
 * the Host credential store, never in the page and never in the patch file.
 *
 * Why BSS and not DashScope: a DashScope/Bailian API key can only call models; coupon
 * balance is an account-level finance figure, published by BSS OpenAPI
 * (`QueryCashCoupons`, `QueryAccountBalance`, API version 2017-12-14, RPC signature).
 */

import { createHmac, randomUUID } from 'node:crypto'

export const name = 'qwen-coupon-balance'

/** `webServer` carries the same-origin route; `credentials` is read optionally below. */
export const inject = ['webServer']

const API_PREFIX = '/api/qwen-coupon-balance'
const BSS_ENDPOINT = 'https://business.aliyuncs.com/'
const BSS_VERSION = '2017-12-14'

/** Credential refs double as environment-variable names, so an exported shell wins too. */
const AK_ID_REF = 'QWEN_COUPON_ACCESS_KEY_ID'
const AK_SECRET_REF = 'QWEN_COUPON_ACCESS_KEY_SECRET'

const DEFAULT_REFRESH_SECONDS = 300
const MIN_REFRESH_SECONDS = 30
const MAX_REFRESH_SECONDS = 3600
const FAILURE_TTL_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000
const BODY_LIMIT_BYTES = 32 * 1024
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

/** Errors that carry an HTTP status back to the page. */
class RequestError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** A refused or failed BSS call, already carrying the Aliyun error code. */
class BssError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Aliyun RPC signature
// ---------------------------------------------------------------------------

/**
 * RFC-3986 encoding, matching the Aliyun SDK's `percentEncode`
 * (URLEncoder + `+`→`%20`, `*`→`%2A`, `~` kept literal).
 */
function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** `2017-12-14` style timestamp: ISO-8601 UTC without milliseconds. */
function isoSecond(milliseconds) {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Build the signed query string of one RPC call.
 * @param {{ accessKeyId: string, accessKeySecret: string, action: string, params: Record<string, string> }} input
 */
function signedQuery({ accessKeyId, accessKeySecret, action, params }) {
  const common = {
    Format: 'JSON',
    Version: BSS_VERSION,
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: randomUUID(),
    Timestamp: isoSecond(Date.now()),
    Action: action,
    ...params,
  }
  const canonical = Object.keys(common)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(common[key])}`)
    .join('&')
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonical)}`
  const signature = createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign, 'utf8')
    .digest('base64')
  return `${canonical}&Signature=${percentEncode(signature)}`
}

/** One BSS RPC call, returning the parsed body when `Success` is true. */
async function callBss({ accessKeyId, accessKeySecret, action, params = {} }) {
  const query = signedQuery({ accessKeyId, accessKeySecret, action, params })
  let response
  try {
    response = await fetch(`${BSS_ENDPOINT}?${query}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new BssError('NETWORK_ERROR', `无法连接阿里云 BSS 接口：${reason}`)
  }
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new BssError('BAD_RESPONSE', `接口返回了非 JSON 内容（HTTP ${response.status}）`)
  }
  if (body !== null && typeof body === 'object' && body.Success === true) return body
  const code = typeof body?.Code === 'string' && body.Code !== '' ? body.Code : `HTTP_${response.status}`
  const message =
    typeof body?.Message === 'string' && body.Message !== '' ? body.Message : text.slice(0, 200)
  throw new BssError(code, message)
}

const ERROR_HINTS = {
  NotAuthorized: '这个 AccessKey 缺少代金券查询权限：给对应的 RAM 用户授予 bss:DescribeCoupons（只读）权限后再试。',
  NoPermission: '这个 AccessKey 缺少权限：需要 bss:DescribeCoupons（只读）。',
  Forbidden: 'AccessKey 被策略拒绝：检查 RAM 用户的权限与 IP/时间限制。',
  InvalidAccessKeyId: 'AccessKeyId 不存在或已被禁用。',
  'InvalidAccessKeyId.NotFound': 'AccessKeyId 不存在或已被禁用。',
  SignatureDoesNotMatch: 'AccessKeySecret 不正确，或本机时间与阿里云相差超过 15 分钟。',
  InvalidParameter: '请求参数被拒绝，请确认账号类型支持代金券查询。',
  NotApplicable: '当前账号类型不支持这个查询接口（例如非自付账号）。',
  NETWORK_ERROR: '本机无法访问 business.aliyuncs.com，请检查网络或代理设置。',
  NO_CREDENTIALS_SERVICE: '当前部署没有凭证服务，无法保存 AccessKey。',
  INVALID_INPUT: '请填写完整的 AccessKeyId 与 AccessKeySecret。',
  CROSS_ORIGIN: '拒绝跨站请求。',
}

/** Turn any thrown value into the flat `{ code, message, hint }` the panel renders. */
function describeError(error) {
  const code = error instanceof BssError || error instanceof RequestError ? error.code : 'INTERNAL_ERROR'
  const message = error instanceof Error ? error.message : String(error)
  return { code, message, hint: ERROR_HINTS[code] ?? '' }
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** A money string from the API, normalised to two decimals. */
function money(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00'
}

function maskedKey(accessKeyId) {
  if (typeof accessKeyId !== 'string' || accessKeyId.length === 0) return ''
  if (accessKeyId.length <= 8) return `${accessKeyId.slice(0, 2)}****`
  return `${accessKeyId.slice(0, 4)}****${accessKeyId.slice(-4)}`
}

/** Sum of usable coupons, plus the rows the panel lists. */
function summariseCoupons(payload) {
  const raw = payload?.Data?.CashCoupon
  const rows = Array.isArray(raw) ? raw : []
  const now = Date.now()
  const coupons = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const balance = Number(row.Balance)
    const status = typeof row.Status === 'string' ? row.Status : ''
    const expiry = typeof row.ExpiryTime === 'string' ? row.ExpiryTime : ''
    const expiryMs = expiry === '' ? Number.POSITIVE_INFINITY : Date.parse(expiry)
    const usable =
      status.toLowerCase() === 'available' &&
      Number.isFinite(balance) &&
      balance > 0 &&
      (Number.isNaN(expiryMs) || expiryMs > now)
    coupons.push({
      no: typeof row.CashCouponNo === 'string' ? row.CashCouponNo : '',
      balance: money(row.Balance),
      nominal: money(row.NominalValue),
      status,
      usable,
      expiry,
      description: typeof row.Description === 'string' ? row.Description : '',
      products: typeof row.ApplicableProducts === 'string' ? row.ApplicableProducts : '',
    })
  }
  const usable = coupons
    .filter((coupon) => coupon.usable)
    .sort((left, right) => {
      const leftAt = left.expiry === '' ? Number.POSITIVE_INFINITY : Date.parse(left.expiry)
      const rightAt = right.expiry === '' ? Number.POSITIVE_INFINITY : Date.parse(right.expiry)
      return leftAt - rightAt
    })
  const total = usable.reduce((sum, coupon) => sum + Number(coupon.balance), 0)
  return {
    total: total.toFixed(2),
    couponCount: usable.length,
    nextExpiry: usable.length > 0 ? usable[0].expiry : '',
    coupons: usable.slice(0, 12),
    otherCount: coupons.length - usable.length,
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > BODY_LIMIT_BYTES) throw new RequestError(413, 'INVALID_INPUT', '请求体过大。')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new RequestError(400, 'INVALID_INPUT', '请求体不是合法 JSON。')
  }
}

/**
 * Writes must be same-origin JSON: `sec-fetch-site` rejects a cross-site form post and
 * the JSON content type forces a CORS preflight, which this route never answers.
 */
function assertSameOriginWrite(request) {
  const site = request.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
    throw new RequestError(403, 'CROSS_ORIGIN', '拒绝跨站写入请求。')
  }
  const type = String(request.headers['content-type'] ?? '')
  if (!type.toLowerCase().includes('application/json')) {
    throw new RequestError(415, 'INVALID_INPUT', '写入请求必须使用 application/json。')
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const configured = Number(config?.refreshSeconds)
  const refreshSeconds = Number.isFinite(configured)
    ? Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(configured)))
    : DEFAULT_REFRESH_SECONDS
  const refreshMs = refreshSeconds * 1000

  /** `{ at, value, ttl }` — one cache entry, replaced wholesale. */
  let cache = { at: 0, value: undefined, ttl: refreshMs }
  /** Deduplicates concurrent refreshes so two tabs do not double-charge the API. */
  let inflight

  const credentialStore = () => {
    const store = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
    return store === undefined || store === null ? undefined : store
  }

  /** Resolve the AccessKey out of the credential store (file first, then environment). */
  async function resolveAccessKey() {
    const store = credentialStore()
    if (store === undefined) return { state: 'unavailable' }
    const id = await store.resolve(AK_ID_REF)
    const secret = await store.resolve(AK_SECRET_REF)
    if (id === undefined || secret === undefined) return { state: 'missing' }
    return {
      state: 'ready',
      accessKeyId: id.value,
      accessKeySecret: secret.value,
      source: id.source,
    }
  }

  async function queryCoupons(accessKey) {
    const payload = await callBss({
      accessKeyId: accessKey.accessKeyId,
      accessKeySecret: accessKey.accessKeySecret,
      action: 'QueryCashCoupons',
      params: {
        ExpiryTimeStart: isoSecond(Date.now() - 24 * 60 * 60 * 1000),
        ExpiryTimeEnd: isoSecond(Date.now() + TEN_YEARS_MS),
        EffectiveOrNot: 'true',
      },
    })
    return summariseCoupons(payload)
  }

  /** Cash balance is a bonus row; its permission or absence must not fail the panel. */
  async function queryCash(accessKey) {
    try {
      const payload = await callBss({
        accessKeyId: accessKey.accessKeyId,
        accessKeySecret: accessKey.accessKeySecret,
        action: 'QueryAccountBalance',
      })
      const data = payload?.Data
      if (data === null || typeof data !== 'object') return null
      return {
        available: money(data.AvailableAmount),
        cash: money(data.AvailableCashAmount),
        currency: typeof data.Currency === 'string' && data.Currency !== '' ? data.Currency : 'CNY',
      }
    } catch {
      return null
    }
  }

  async function refresh(accessKey) {
    const fetchedAt = new Date().toISOString()
    try {
      const summary = await queryCoupons(accessKey)
      const account = await queryCash(accessKey)
      const value = {
        ok: true,
        configured: true,
        accessKeyId: maskedKey(accessKey.accessKeyId),
        source: accessKey.source,
        total: summary.total,
        currency: 'CNY',
        couponCount: summary.couponCount,
        nextExpiry: summary.nextExpiry,
        coupons: summary.coupons,
        otherCount: summary.otherCount,
        account,
        fetchedAt,
        error: null,
      }
      cache = { at: Date.now(), value, ttl: refreshMs }
      return { ...value, cached: false }
    } catch (error) {
      const value = {
        ok: false,
        configured: true,
        accessKeyId: maskedKey(accessKey.accessKeyId),
        source: accessKey.source,
        total: null,
        currency: 'CNY',
        couponCount: 0,
        nextExpiry: '',
        coupons: [],
        otherCount: 0,
        account: null,
        fetchedAt,
        error: describeError(error),
      }
      // A short TTL keeps a fixed AccessKey from looking broken for a full interval.
      cache = { at: Date.now(), value, ttl: Math.min(refreshMs, FAILURE_TTL_MS) }
      return { ...value, cached: false }
    }
  }

  async function loadState({ force }) {
    let accessKey
    try {
      accessKey = await resolveAccessKey()
    } catch (error) {
      return {
        ok: false,
        configured: false,
        accessKeyId: '',
        source: '',
        total: null,
        currency: 'CNY',
        couponCount: 0,
        nextExpiry: '',
        coupons: [],
        otherCount: 0,
        account: null,
        fetchedAt: new Date().toISOString(),
        error: describeError(error),
      }
    }

    if (accessKey.state === 'unavailable') {
      return {
        ok: false,
        configured: false,
        accessKeyId: '',
        source: '',
        total: null,
        currency: 'CNY',
        couponCount: 0,
        nextExpiry: '',
        coupons: [],
        otherCount: 0,
        account: null,
        fetchedAt: null,
        error: describeError(new BssError('NO_CREDENTIALS_SERVICE', '凭证服务不可用。')),
      }
    }

    if (accessKey.state === 'missing') {
      return {
        ok: false,
        configured: false,
        accessKeyId: '',
        source: '',
        total: null,
        currency: 'CNY',
        couponCount: 0,
        nextExpiry: '',
        coupons: [],
        otherCount: 0,
        account: null,
        fetchedAt: null,
        error: null,
      }
    }

    if (!force && cache.value !== undefined && Date.now() - cache.at < cache.ttl) {
      return { ...cache.value, cached: true }
    }
    if (inflight === undefined) {
      inflight = refresh(accessKey).finally(() => {
        inflight = undefined
      })
    }
    return inflight
  }

  async function saveCredentials(accessKeyId, accessKeySecret) {
    const store = credentialStore()
    if (store === undefined) {
      throw new BssError('NO_CREDENTIALS_SERVICE', '凭证服务不可用。')
    }
    // Validate before persisting: a typo must not replace a working key.
    await queryCoupons({ accessKeyId, accessKeySecret })
    await store.set(AK_ID_REF, accessKeyId)
    await store.set(AK_SECRET_REF, accessKeySecret)
    cache = { at: 0, value: undefined, ttl: refreshMs }
  }

  const handler = async (request, response) => {
    const path = String(request.url ?? '').split('?')[0].slice(API_PREFIX.length) || '/'
    try {
      if (request.method === 'GET' && (path === '/state' || path === '/')) {
        return sendJson(response, 200, await loadState({ force: false }))
      }
      if (request.method === 'POST' && path === '/refresh') {
        assertSameOriginWrite(request)
        return sendJson(response, 200, await loadState({ force: true }))
      }
      if (request.method === 'POST' && path === '/credentials') {
        assertSameOriginWrite(request)
        const body = await readJsonBody(request)
        const accessKeyId = String(body.accessKeyId ?? '').trim()
        const accessKeySecret = String(body.accessKeySecret ?? '').trim()
        if (accessKeyId === '' || accessKeySecret === '') {
          throw new RequestError(400, 'INVALID_INPUT', 'AccessKeyId 与 AccessKeySecret 都不能为空。')
        }
        await saveCredentials(accessKeyId, accessKeySecret)
        return sendJson(response, 200, await loadState({ force: true }))
      }
      return sendJson(response, 404, {
        ok: false,
        error: { code: 'NOT_FOUND', message: `未知接口 ${path}`, hint: '' },
      })
    } catch (error) {
      // A refused BSS call is the user's input problem, not a server fault.
      const status =
        error instanceof RequestError ? error.status : error instanceof BssError ? 400 : 500
      sendJson(response, status, { ok: false, error: describeError(error) })
    }
  }

  ctx.effect(() => {
    try {
      return ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
    } catch (error) {
      // The Loader can mount a row twice in some compositions; a duplicate path is not fatal.
      if (error instanceof Error && error.message.includes('already')) {
        ctx.logger?.warn?.('qwen-coupon-balance: route already registered, skipping')
        return () => {}
      }
      throw error
    }
  }, 'qwen-coupon-balance: /api route')
}