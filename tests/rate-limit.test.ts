import { describe, expect, it } from 'vitest'
import { bearerToken, createRateLimiter } from '../src/lib/rate-limit'

describe('rate limiter', () => {
  const make = () => {
    let t = 0
    const rl = createRateLimiter({ windowMs: 1000, max: 3 }, () => t)
    return { rl, at: (ms: number) => (t = ms) }
  }

  it('allows up to max calls in the window, then blocks with a retry time', () => {
    const { rl, at } = make()
    at(0); expect(rl.check('u').ok).toBe(true)
    at(100); expect(rl.check('u').ok).toBe(true)
    at(200); expect(rl.check('u').ok).toBe(true)
    at(300)
    expect(rl.check('u')).toEqual({ ok: false, retryAfterMs: 700 }) // first call expires at t=1000
  })

  it('lets calls through again once the window has passed', () => {
    const { rl, at } = make()
    for (const t of [0, 1, 2]) { at(t); rl.check('u') }
    at(500); expect(rl.check('u').ok).toBe(false)
    at(1001); expect(rl.check('u').ok).toBe(true)
  })

  it('limits each user separately', () => {
    const { rl, at } = make()
    at(0)
    for (let i = 0; i < 3; i++) rl.check('a')
    expect(rl.check('a').ok).toBe(false)
    expect(rl.check('b').ok).toBe(true)
  })

  it('blocked calls do not extend the block', () => {
    const { rl, at } = make()
    at(0); for (let i = 0; i < 3; i++) rl.check('u')
    at(500); rl.check('u'); rl.check('u')
    at(1001); expect(rl.check('u').ok).toBe(true)
  })
})

describe('bearerToken', () => {
  it.each([
    ['Bearer abc.def', 'abc.def'],
    ['bearer xyz', 'xyz'],
    ['Basic abc', null],
    ['Bearer', null],
    ['', null],
    [undefined, null],
    ['Bearer a b', null],
  ])('%j -> %j', (h, expected) => {
    expect(bearerToken(h as string | undefined)).toBe(expected)
  })
})
