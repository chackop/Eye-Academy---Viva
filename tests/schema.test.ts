import { describe, expect, it } from 'vitest'
import { AttemptCorruptError, migrate, parseAttempt } from '../src/lib/schema'
import { completeTurn, newAttempt, planTurn } from '../src/lib/viva'

describe('attempt schema', () => {
  it('a fresh attempt is valid and versioned', () => {
    const a = newAttempt('u1', 1000)
    expect(a.schemaVersion).toBe(1)
    expect(parseAttempt(JSON.parse(JSON.stringify(a)))).toEqual(a)
  })

  it('an attempt after real turns (findings, followup, revision) round-trips', () => {
    let a = newAttempt('u1', 1000)
    a = completeTurn(a, planTurn(a.phase, 'what is the pressure in the right eye'), 'what is the pressure in the right eye', 'x', 2000, { latencyMs: 5 })
    a = { ...a, phase: 'done', revision: { supported: true, point: 'p', page: 6, excerpt: 'e', passageId: 'p6-c1', source: 'llm', retrieved: [{ id: 'p6-c1', page: 6, score: 12.3 }] } }
    expect(parseAttempt(JSON.parse(JSON.stringify(a)))).toEqual(a)
  })

  it('migrates attempts saved before versioning', () => {
    const { schemaVersion, ...old } = newAttempt('u1', 1000)
    expect(schemaVersion).toBe(1)
    expect(parseAttempt(old).schemaVersion).toBe(1)
  })

  it('rejects a newer schema version instead of guessing', () => {
    expect(() => migrate({ ...newAttempt('u', 1), schemaVersion: 2 })).toThrow(AttemptCorruptError)
  })

  it.each([
    ['unknown phase', { phase: 'banana' }],
    ['transcript not a list', { transcript: 'hi' }],
    ['missing uid', { uid: '' }],
    ['bad revision shape', { revision: { supported: true } }],
  ])('rejects corrupt data: %s', (_n, patch) => {
    expect(() => parseAttempt({ ...newAttempt('u', 1), ...patch })).toThrow(AttemptCorruptError)
  })

  it('the error message names the failing field', () => {
    expect(() => parseAttempt({ ...newAttempt('u', 1), phase: 'banana' })).toThrow(/phase/)
  })

  it('rejects non-objects', () => {
    expect(() => parseAttempt(null)).toThrow(AttemptCorruptError)
  })
})
