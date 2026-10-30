/**
 * Browser-half smoke test: loads lib/client.js exactly the way the page's
 * __ModuleLoader__ does — top-level evaluation, then `factory(require)` — and
 * calls `apply()` against a minimal Client ctx. This is the check that catches
 * module-contract mistakes (a missing `module` record, a bad export shape, a
 * throwing activation) without a browser.
 */
import assert from 'node:assert/strict'

// --- the page's globals -------------------------------------------------------
let definition
globalThis.window = {
  __ModuleLoader__: {
    load(candidate) {
      definition = candidate
    },
  },
}

const calls = { style: [] }
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', parentNode: null }),
  head: {
    appendChild(node) {
      calls.style.push(node.textContent)
    },
  },
}

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn,
  useEffect: () => undefined,
  useRef: (value) => ({ current: value ?? null }),
  useState: (value) => [value, () => {}],
  memo: (component) => component,
}
const require = (name) => {
  assert.equal(name, 'react', `unexpected require(${name})`)
  return React
}

await import('../lib/client.js')

// 1. The module registers itself and the factory produces a plugin object.
assert.ok(definition !== undefined, 'bundle did not call __ModuleLoader__.load')
assert.equal(definition.id, 'dsh-qwen-coupon-balance')

const plugin = definition.factory(require)
assert.equal(typeof plugin, 'object')
assert.equal(plugin.name, 'qwen-coupon-balance')
assert.deepEqual(plugin.inject, ['slots'])
assert.equal(typeof plugin.apply, 'function')
console.log('ok  factory returns { name, inject, apply }')

// 2. Activation registers exactly one footer action and one stylesheet.
const registrations = []
const disposers = []
const ctx = {
  get(name) {
    if (name === 'locale') {
      return {
        register() {
          return () => {}
        },
        bind() {
          return (key) => `t:${key}`
        },
      }
    }
    return undefined
  },
  effect(callback) {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
  slots: {
    inject(slot, callback) {
      assert.equal(slot, 'sidebar.footer.action')
      const dispose = callback()
      return dispose
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

plugin.apply(ctx)
assert.equal(registrations.length, 1, 'one footer action')
assert.equal(registrations[0].options.name, 'sidebar.footer.action')
assert.equal(registrations[0].options.id, 'qwen-coupon-balance')
assert.equal(typeof registrations[0].component, 'function')
assert.equal(calls.style.length, 1, 'stylesheet injected once')
assert.ok(calls.style[0].includes('.qc-panel'), 'stylesheet carries the panel rules')
console.log('ok  apply() registers the footer action and its stylesheet')

// 3. The component renders in both sidebar shapes without throwing.
const component = registrations[0].component
const t = (key) => `t:${key}`
for (const wide of [true, false]) {
  const tree = component({ wide, t })
  assert.equal(tree.type, 'div')
  assert.equal(tree.props.className, wide ? 'qc-layer' : 'qc-layer qc-rail')
  const button = tree.children[0]
  assert.equal(button.type, 'button')
  console.log(`ok  renders ${wide ? 'wide' : 'rail'} shape`)
}

// 4. Disposal removes the stylesheet.
for (const dispose of disposers) dispose()
console.log('ok  disposal runs')

// 5. A missing dependency degrades to an inert plugin instead of a failed boot.
const realError = console.error
console.error = () => {}
const inert = definition.factory(() => undefined)
console.error = realError
assert.equal(inert.name, 'qwen-coupon-balance')
assert.deepEqual(inert.inject, [])
assert.equal(typeof inert.apply, 'function')
inert.apply(ctx)
assert.equal(registrations.length, 1, 'inert plugin registers nothing')
console.log('ok  missing react degrades instead of throwing')

console.log('\nall browser-half checks passed')