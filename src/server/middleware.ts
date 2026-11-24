import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { CONFIG } from '../lib/config'
import { bearerToken, createRateLimiter } from '../lib/rate-limit'
import { verifyIdToken } from './auth'

// One limiter shared by every model-backed function, so a user's budget is per user, not per endpoint.
// In-memory: fine for one server process; use a shared store (e.g. Redis) if you run several.
const limiter = createRateLimiter({ windowMs: CONFIG.rateLimit.windowMs, max: CONFIG.rateLimit.maxCalls })

/**
 * Client: attach the signed-in user's Firebase ID token.
 * Server: verify it, then rate-limit that user, before any Claude call (which costs money) can run.
 */
export const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const { auth } = await import('../lib/firebase') // browser-only module
    const token = await auth.currentUser?.getIdToken()
    return next({ headers: token ? { authorization: `Bearer ${token}` } : {} })
  })
  .server(async ({ next }) => {
    const token = bearerToken(getRequestHeader('authorization'))
    if (!token) throw new Error('Please sign in to use the examiner.')
    let uid: string
    try { uid = await verifyIdToken(token) } catch { throw new Error('Your sign-in has expired. Please sign in again.') }
    const r = limiter.check(uid)
    if (!r.ok) throw new Error(`Too many requests. Please wait ${Math.ceil(r.retryAfterMs / 1000)} seconds and try again.`)
    return next({ context: { uid } })
  })
