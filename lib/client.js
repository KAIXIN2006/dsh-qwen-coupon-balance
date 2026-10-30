/**
 * dsh-qwen-coupon-balance —— browser half.
 *
 * A hand-written `__ModuleLoader__` bundle (no build step): one action beside Settings
 * in the sidebar foot that shows the Alibaba Cloud cash-coupon balance and opens a
 * panel with the coupon list plus the AccessKey form.
 *
 * All data comes from the same-origin route `/api/qwen-coupon-balance/*` served by the
 * Host half; the page never talks to Alibaba Cloud and never sees the AccessKeySecret.
 */

window.__ModuleLoader__.load({
  id: 'dsh-qwen-coupon-balance',
  factory: function (require) {
    // The loader hands us nothing but `require`; the bundle owns its own module record.
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    if (React === null || React === undefined) {
      // Materialization must never throw: a client bundle that fails here aborts the whole Web boot.
      console.error('[qwen-coupon] react is unavailable; the sidebar action stays disabled')
      return { name: 'qwen-coupon-balance', inject: [], apply: function () {} }
    }
    var h = React.createElement
    var useCallback = React.useCallback
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useState = React.useState

    var API = '/api/qwen-coupon-balance'
    var NS = 'qwen-coupon'
    var POLL_MS = 60000

    /** Panel / action copy. `zh` is the fallback when the locale service is silent. */
    var TEXT = {
      zh: {
        label: '优惠券',
        title: '千问优惠券余额',
        available: '可用代金券',
        unused: '未配置',
        loading: '读取中…',
        failed: '读取失败',
        refresh: '刷新',
        noCoupon: '当前没有可用的代金券。',
        count: '{n} 张可用',
        other: '另有 {n} 张已过期或已用完',
        nominal: '面额 ¥{v}',
        expiry: '到期 {d}',
        noExpiry: '长期有效',
        cash: '现金余额 ¥{v}',
        credentials: 'AccessKey',
        akId: 'AccessKeyId',
        akSecret: 'AccessKeySecret',
        akPlaceholder: 'LTAI…',
        secretPlaceholder: '填写后保存到本机凭证库',
        save: '保存并验证',
        saving: '验证中…',
        saved: '已保存，凭证有效。',
        saveFailed: '保存失败',
        permission: '需要该 AccessKey 具备 bss:DescribeCoupons（只读）权限；密钥只保存在本机凭证库。',
        emptyFields: 'AccessKeyId 和 AccessKeySecret 都要填写。',
        fetchedAt: '更新于 {t}',
        notConfigured: '还没有配置 AccessKey，填写后即可读取账号里的代金券余额。',
        loadingHint: '正在向阿里云查询代金券…',
      },
      en: {
        label: 'Coupons',
        title: 'Qianwen coupon balance',
        available: 'Usable coupons',
        unused: 'Not set',
        loading: 'Loading…',
        failed: 'Failed',
        refresh: 'Refresh',
        noCoupon: 'No usable coupons right now.',
        count: '{n} usable',
        other: '{n} more expired or used up',
        nominal: 'Face value ¥{v}',
        expiry: 'Expires {d}',
        noExpiry: 'No expiry',
        cash: 'Cash balance ¥{v}',
        credentials: 'AccessKey',
        akId: 'AccessKeyId',
        akSecret: 'AccessKeySecret',
        akPlaceholder: 'LTAI…',
        secretPlaceholder: 'Stored in the local credential store',
        save: 'Save and verify',
        saving: 'Verifying…',
        saved: 'Saved and verified.',
        saveFailed: 'Save failed',
        permission: 'The key needs bss:DescribeCoupons (read-only); it stays in the local credential store.',
        emptyFields: 'Both AccessKeyId and AccessKeySecret are required.',
        fetchedAt: 'Updated {t}',
        notConfigured: 'No AccessKey yet. Fill one in to read this account’s coupon balance.',
        loadingHint: 'Asking Alibaba Cloud for coupons…',
      },
    }

    /** Tiny formatter: `{name}` placeholders. */
    function format(text, values) {
      return String(text).replace(/\{(\w+)\}/g, function (match, key) {
        return values !== undefined && values !== null && Object.prototype.hasOwnProperty.call(values, key)
          ? String(values[key])
          : match
      })
    }

    function money(value) {
      var parsed = Number(value)
      if (!isFinite(parsed)) return '—'
      return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    function dateText(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      var parsed = new Date(iso)
      if (isNaN(parsed.getTime())) return ''
      return parsed.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
    }

    function clockText(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      var parsed = new Date(iso)
      if (isNaN(parsed.getTime())) return ''
      return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function readJson(response) {
      return response.text().then(function (text) {
        var data = null
        try {
          data = text === '' ? null : JSON.parse(text)
        } catch (error) {
          data = null
        }
        return { status: response.status, data: data }
      })
    }

    // ---- icons ---------------------------------------------------------------

    function ticketIcon(size) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          style: { flex: 'none', display: 'block' },
        },
        h('path', {
          d: 'M2.75 5.16c0-.62.5-1.13 1.13-1.13h8.24c.62 0 1.13.5 1.13 1.13v1.7a1.5 1.5 0 0 0 0 2.96v1.7c0 .62-.5 1.13-1.13 1.13H3.88c-.62 0-1.13-.5-1.13-1.13v-1.7a1.5 1.5 0 0 0 0-2.96v-1.7Z',
          stroke: 'currentColor',
          strokeWidth: 1.15,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M9.9 6.2v3.6',
          stroke: 'currentColor',
          strokeWidth: 1.15,
          strokeLinecap: 'round',
          strokeDasharray: '1.1 1.4',
        }),
      )
    }

    function refreshIcon(size, spinning) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          className: spinning === true ? 'qc-spin' : undefined,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M12.6 8a4.6 4.6 0 1 1-1.35-3.25M12.9 3.3v2.6h-2.6',
          stroke: 'currentColor',
          strokeWidth: 1.35,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    // ---- styles --------------------------------------------------------------

    var CSS = [
      '.qc-layer{flex:none;align-items:center;width:100%;height:42px;margin:8px 0 0;display:flex;position:relative}',
      '.qc-layer.qc-rail{width:36px;height:36px;margin:0}',
      '.qc-badge{box-sizing:border-box;flex:1 1 0;min-width:0;width:auto;height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:0;padding:0 10px 0 8px;font-family:inherit;font-size:14px;display:inline-flex;overflow:hidden}',
      '.qc-badge:hover,.qc-badge[data-open="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.qc-badge:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}',
      '.qc-badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
      '.qc-badgeValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}',
      '.qc-rail .qc-badge{border-radius:50%;justify-content:center;gap:0;flex:none;width:36px;height:36px;padding:0}',
      '.qc-dot{position:absolute;top:7px;right:7px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}',
      '.qc-panel{isolation:isolate;z-index:40;width:380px;max-width:calc(100vw - 16px);max-height:min(70vh,620px);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.2));border:1px solid var(--dsw-alias-border-l1);border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}',
      '.qc-head{flex:none;align-items:center;gap:8px;padding:11px 10px 7px 12px;display:flex}',
      '.qc-title{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:13px;font-weight:600;line-height:20px;overflow:hidden}',
      '.qc-iconBtn{corner-shape:round;width:26px;height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:7px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}',
      '.qc-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary)}',
      '.qc-iconBtn:disabled{opacity:.5;cursor:default}',
      '.qc-body{flex:1;min-height:0;padding:0 12px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,transparent)}',
      '.qc-hero{background:var(--dsw-alias-bg-layer-1);border-radius:12px;flex-direction:column;gap:2px;padding:12px;display:flex}',
      '.qc-heroLabel{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}',
      '.qc-heroValue{color:var(--dsw-alias-label-primary);letter-spacing:-.01em;font-variant-numeric:tabular-nums;font-size:27px;font-weight:600;line-height:34px}',
      '.qc-heroValue small{color:var(--dsw-alias-label-secondary);margin-right:2px;font-size:15px;font-weight:500}',
      '.qc-heroMeta{color:var(--dsw-alias-label-secondary);opacity:.85;font-size:11px;line-height:17px}',
      '.qc-list{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}',
      '.qc-row{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;flex-direction:column;gap:2px;padding:8px 10px;display:flex}',
      '.qc-rowTop{align-items:baseline;gap:8px;display:flex}',
      '.qc-rowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:13px;font-weight:600;line-height:20px}',
      '.qc-rowNominal{color:var(--dsw-alias-label-secondary);opacity:.8;margin-left:auto;font-size:11px;line-height:18px}',
      '.qc-rowSub{color:var(--dsw-alias-label-secondary);opacity:.75;font-size:11px;line-height:17px;word-break:break-word}',
      '.qc-note{color:var(--dsw-alias-label-secondary);opacity:.85;font-size:11px;line-height:1.55}',
      '.qc-empty{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding:10px 0}',
      '.qc-error{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 28%,transparent);border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.55}',
      '.qc-errorHint{margin-top:4px;opacity:.85;font-size:11px;line-height:1.55}',
      '.qc-ok{color:var(--dsw-alias-state-success-primary);font-size:11px;line-height:1.55}',
      '.qc-section{border-top:1px solid var(--dsw-alias-border-l1);flex-direction:column;gap:7px;padding-top:10px;display:flex}',
      '.qc-sectionTitle{color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.04em;opacity:.9;font-size:10.5px;font-weight:600;line-height:16px}',
      '.qc-field{flex-direction:column;gap:6px;display:flex}',
      '.qc-input{box-sizing:border-box;width:100%;height:30px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px;font-family:inherit;font-size:12px}',
      '.qc-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.qc-input:focus{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-1px}',
      '.qc-actions{align-items:center;gap:8px;display:flex}',
      '.qc-btn{height:28px;color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;cursor:pointer;padding:0 12px;font-family:inherit;font-size:12px;line-height:1}',
      '.qc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.qc-btn:disabled{opacity:.45;cursor:default}',
      '.qc-btnPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);border-color:transparent}',
      '.qc-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.88}',
      '.qc-foot{color:var(--dsw-alias-label-secondary);opacity:.8;font-size:10.5px;line-height:16px}',
      '.qc-spin{animation:qc-rotate .9s linear infinite;transform-origin:50% 50%}',
      '@keyframes qc-rotate{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.qc-spin{animation:none}}',
    ].join('')

    // ---- component -----------------------------------------------------------

    function CouponChip(props) {
      var safeProps = props !== null && props !== undefined ? props : {}
      var wide = safeProps.wide === true
      var t = typeof safeProps.t === 'function' ? safeProps.t : function (key) { return TEXT.zh[key] || key }

      var viewState = useState({ phase: 'loading', data: null, error: null })
      var view = viewState[0]
      var setView = viewState[1]

      var openState = useState(false)
      var open = openState[0]
      var setOpen = openState[1]

      var anchorState = useState(null)
      var anchor = anchorState[0]
      var setAnchor = anchorState[1]

      var refreshState = useState(false)
      var refreshing = refreshState[0]
      var setRefreshing = refreshState[1]

      var formState = useState({ id: '', secret: '', saving: false, message: null })
      var form = formState[0]
      var setForm = formState[1]

      var rootRef = useRef(null)
      var panelRef = useRef(null)

      var load = useCallback(function (force) {
        if (force === true) setRefreshing(true)
        var request =
          force === true
            ? fetch(API + '/refresh', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
                cache: 'no-store',
              })
            : fetch(API + '/state', { cache: 'no-store' })
        return request
          .then(readJson)
          .then(function (result) {
            if (result.data !== null && typeof result.data === 'object') {
              setView({ phase: 'ready', data: result.data, error: null })
            } else {
              setView({ phase: 'ready', data: null, error: 'HTTP ' + result.status })
            }
          })
          .catch(function (error) {
            setView({ phase: 'ready', data: null, error: String((error && error.message) || error) })
          })
          .then(function () {
            setRefreshing(false)
          })
      }, [])

      // Initial read plus a slow poll; the Host caches, so this is cheap.
      useEffect(function () {
        var cancelled = false
        var timer = setInterval(function () {
          if (!cancelled) load(false)
        }, POLL_MS)
        load(false)
        return function () {
          cancelled = true
          clearInterval(timer)
        }
      }, [load])

      // Anchor the panel above the trigger and keep it there while the window moves.
      useEffect(function () {
        if (!open) return undefined
        var place = function () {
          var node = rootRef.current
          if (node === null) return
          var rect = node.getBoundingClientRect()
          var width = Math.min(380, window.innerWidth - 16)
          var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
          setAnchor({ left: left, bottom: Math.max(8, window.innerHeight - rect.top + 8) })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return function () {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open])

      // Click outside / Escape closes.
      useEffect(function () {
        if (!open) return undefined
        var onPointerDown = function (event) {
          var target = event.target
          if (target === null) return
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          if (rootRef.current !== null && rootRef.current.contains(target)) return
          setOpen(false)
        }
        var onKeyDown = function (event) {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return function () {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open])

      // Fresh numbers whenever the panel opens.
      useEffect(function () {
        if (open) load(false)
      }, [open, load])

      var save = function () {
        var accessKeyId = form.id.trim()
        var accessKeySecret = form.secret.trim()
        if (accessKeyId === '' || accessKeySecret === '') {
          setForm(function (current) {
            return { id: current.id, secret: current.secret, saving: false, message: { kind: 'err', text: t('emptyFields') } }
          })
          return
        }
        setForm(function (current) {
          return { id: current.id, secret: current.secret, saving: true, message: null }
        })
        fetch(API + '/credentials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessKeyId: accessKeyId, accessKeySecret: accessKeySecret }),
        })
          .then(readJson)
          .then(function (result) {
            var data = result.data
            if (data !== null && typeof data === 'object' && data.ok === true) {
              setForm({ id: '', secret: '', saving: false, message: { kind: 'ok', text: t('saved') } })
              setView({ phase: 'ready', data: data, error: null })
              return
            }
            var failure = data !== null && typeof data === 'object' ? data.error : null
            var text = failure !== null && failure !== undefined
              ? String(failure.message) + (failure.hint ? ' ' + String(failure.hint) : '')
              : 'HTTP ' + result.status
            setForm(function (current) {
              return { id: current.id, secret: current.secret, saving: false, message: { kind: 'err', text: text } }
            })
          })
          .catch(function (error) {
            setForm(function (current) {
              return { id: current.id, secret: current.secret, saving: false, message: { kind: 'err', text: String((error && error.message) || error) } }
            })
          })
      }

      var data = view.data
      var configured = data !== null && data !== undefined ? data.configured === true : false
      var usable = data !== null && data !== undefined && data.ok === true
      var amountText = '—'
      if (view.phase === 'loading') amountText = t('loading')
      else if (usable) amountText = '¥' + money(data.total)
      else if (data !== null && data !== undefined && data.configured === false) amountText = t('unused')
      else amountText = t('failed')

      var metaText = ''
      if (usable && data.couponCount > 0) {
        var pieces = [format(t('count'), { n: data.couponCount })]
        pieces.push(format(t('expiry'), { d: data.nextExpiry ? dateText(data.nextExpiry) : t('noExpiry') }))
        metaText = pieces.join(' · ')
      }

      var panel = null
      if (open && anchor !== null) {
        var rows = []
        if (usable && Array.isArray(data.coupons) && data.coupons.length > 0) {
          rows = data.coupons.map(function (coupon, index) {
            var sub = []
            if (coupon.expiry !== '') sub.push(format(t('expiry'), { d: dateText(coupon.expiry) }))
            else sub.push(t('noExpiry'))
            if (coupon.products !== '') sub.push(coupon.products)
            return h(
              'li',
              { className: 'qc-row', key: coupon.no !== '' ? coupon.no : 'coupon-' + index },
              h(
                'div',
                { className: 'qc-rowTop' },
                h('span', { className: 'qc-rowValue' }, '¥' + money(coupon.balance)),
                h('span', { className: 'qc-rowNominal' }, format(t('nominal'), { v: money(coupon.nominal) })),
              ),
              h('div', { className: 'qc-rowSub' }, sub.join(' · ')),
            )
          })
        }

        var body = [
          usable
            ? h(
                'div',
                { className: 'qc-hero', key: 'hero' },
                h('div', { className: 'qc-heroLabel' }, t('available')),
                h('div', { className: 'qc-heroValue' }, h('small', null, '¥'), money(data.total)),
                h('div', { className: 'qc-heroMeta' }, metaText),
              )
            : null,
          usable && data.account !== null && data.account !== undefined
            ? h('div', { className: 'qc-note', key: 'cash' }, format(t('cash'), { v: money(data.account.available) }))
            : null,
          usable && rows.length > 0 ? h('ul', { className: 'qc-list', key: 'list' }, rows) : null,
          usable && rows.length === 0 ? h('div', { className: 'qc-empty', key: 'empty' }, t('noCoupon')) : null,
          usable && data.otherCount > 0
            ? h('div', { className: 'qc-note', key: 'other' }, format(t('other'), { n: data.otherCount }))
            : null,
          view.phase === 'loading' ? h('div', { className: 'qc-empty', key: 'loading' }, t('loadingHint')) : null,
          !usable && view.phase === 'ready' && data !== null && data !== undefined && data.error !== null
            ? h(
                'div',
                { className: 'qc-error', key: 'error' },
                String(data.error.message),
                data.error.hint ? h('div', { className: 'qc-errorHint' }, String(data.error.hint)) : null,
              )
            : null,
          !usable && view.phase === 'ready' && data === null
            ? h('div', { className: 'qc-error', key: 'transport' }, String(view.error))
            : null,
          data !== null && data !== undefined && data.configured === false
            ? h('div', { className: 'qc-note', key: 'intro' }, t('notConfigured'))
            : null,
        ]

        var formBlock = h(
          'div',
          { className: 'qc-section', key: 'form' },
          h('div', { className: 'qc-sectionTitle' }, t('credentials')),
          configured
            ? h('div', { className: 'qc-note' }, t('akId') + '：' + String(data.accessKeyId))
            : null,
          h(
            'div',
            { className: 'qc-field' },
            h('input', {
              className: 'qc-input',
              type: 'text',
              spellCheck: false,
              autoComplete: 'off',
              placeholder: t('akPlaceholder'),
              value: form.id,
              onChange: function (event) {
                var value = event.target.value
                setForm(function (current) {
                  return { id: value, secret: current.secret, saving: current.saving, message: current.message }
                })
              },
            }),
            h('input', {
              className: 'qc-input',
              type: 'password',
              autoComplete: 'off',
              placeholder: t('secretPlaceholder'),
              value: form.secret,
              onChange: function (event) {
                var value = event.target.value
                setForm(function (current) {
                  return { id: current.id, secret: value, saving: current.saving, message: current.message }
                })
              },
            }),
          ),
          h(
            'div',
            { className: 'qc-actions' },
            h(
              'button',
              {
                className: 'qc-btn qc-btnPrimary',
                type: 'button',
                disabled: form.saving,
                onClick: save,
              },
              form.saving ? t('saving') : t('save'),
            ),
          ),
          h('div', { className: 'qc-note' }, t('permission')),
          form.message !== null
            ? h(
                'div',
                { className: form.message.kind === 'ok' ? 'qc-ok' : 'qc-error' },
                String(form.message.text),
              )
            : null,
        )
        body.push(formBlock)

        if (data !== null && data !== undefined && data.fetchedAt) {
          body.push(h('div', { className: 'qc-foot', key: 'foot' }, format(t('fetchedAt'), { t: clockText(data.fetchedAt) })))
        }

        panel = h(
          'div',
          {
            className: 'qc-panel',
            ref: panelRef,
            role: 'dialog',
            'aria-label': t('title'),
            style: { left: anchor.left + 'px', bottom: anchor.bottom + 'px' },
          },
          h(
            'div',
            { className: 'qc-head' },
            h('span', { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-secondary)' } }, ticketIcon(15)),
            h('div', { className: 'qc-title' }, t('title')),
            h(
              'button',
              {
                className: 'qc-iconBtn',
                type: 'button',
                title: t('refresh'),
                'aria-label': t('refresh'),
                disabled: refreshing,
                onClick: function () {
                  load(true)
                },
              },
              refreshIcon(14, refreshing),
            ),
          ),
          h('div', { className: 'qc-body' }, body),
        )
      }

      return h(
        'div',
        { className: wide ? 'qc-layer' : 'qc-layer qc-rail', ref: rootRef },
        h(
          'button',
          {
            className: 'qc-badge',
            type: 'button',
            'data-open': open ? 'true' : 'false',
            'aria-expanded': open ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            title: t('title'),
            onClick: function () {
              setOpen(function (current) {
                return !current
              })
            },
          },
          ticketIcon(16),
          wide ? h('span', { className: 'qc-badgeValue' }, amountText) : null,
          !wide && !usable && view.phase === 'ready' ? h('span', { className: 'qc-dot', 'aria-hidden': true }) : null,
        ),
        panel,
      )
    }

    // ---- plugin --------------------------------------------------------------

    function apply(ctx) {
      var locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      var bound = null
      if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
        try {
          ctx.effect(function () {
            var disposeZh = locale.register(NS, 'zh', TEXT.zh)
            var disposeEn = locale.register(NS, 'en', TEXT.en)
            return function () {
              disposeZh()
              disposeEn()
            }
          }, 'qwen-coupon: dictionaries')
          bound = locale.bind(NS)
        } catch (error) {
          console.error('[qwen-coupon] registering dictionaries failed', error)
        }
      }

      var translate = function (key) {
        if (bound !== null) {
          try {
            var text = bound(key)
            if (typeof text === 'string' && text !== key) return text
          } catch (error) {
            // fall through to the built-in dictionary
          }
        }
        return TEXT.zh[key] !== undefined ? TEXT.zh[key] : key
      }

      ctx.effect(function () {
        try {
          var id = 'dsh-qwen-coupon-balance-styles'
          if (document.getElementById(id) === null) {
            var style = document.createElement('style')
            style.id = id
            style.textContent = CSS
            document.head.appendChild(style)
          }
          return function () {
            var element = document.getElementById(id)
            if (element !== null && element.parentNode !== null) element.parentNode.removeChild(element)
          }
        } catch (error) {
          console.error('[qwen-coupon] injecting styles failed', error)
          return undefined
        }
      }, 'qwen-coupon: styles')

      ctx.slots.inject('sidebar.footer.action', function () {
        try {
          return ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'qwen-coupon-balance',
              order: 30,
              locale: NS,
              label: function () {
                return translate('label')
              },
              inject: function () {
                return { t: translate }
              },
            },
            CouponChip,
          )
        } catch (error) {
          // A failed registration must cost the widget, never the whole page boot.
          console.error('[qwen-coupon] registering the sidebar action failed', error)
          return undefined
        }
      })
    }

    module.exports = {
      name: 'qwen-coupon-balance',
      inject: ['slots'],
      apply: apply,
    }
    return module.exports
  },
})