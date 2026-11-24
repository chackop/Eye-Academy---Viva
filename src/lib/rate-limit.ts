/** Sliding-window limiter keyed by user id. Pure (clock is injectable) so it is unit-tested. */
export type LimitResult = { ok: true } | { ok: false; retryAfterMs: number }

export function createRateLimiter(opts: { windowMs: number; max: number }, now: () => number = Date.now) {
  const calls = new Map<string, number[]>()
  return {
    check(key: string): LimitResult {
      const t = now()
      const recent = (calls.get(key) ?? []).filter(ts => ts > t - opts.windowMs)
      if (recent.length >= opts.max) {
        calls.set(key, recent)
        return { ok: false, retryAfterMs: recent[0] + opts.windowMs - t }
      }
      recent.push(t)
      calls.set(key, recent)
      if (calls.size > 5000) for (const [k, v] of calls) if (!v.some(ts => ts > t - opts.windowMs)) calls.delete(k) // keep memory bounded
      return { ok: true }
    },
  }
}

export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return m ? m[1] : null
}
