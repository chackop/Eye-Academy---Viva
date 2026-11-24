import { describe, expect, it } from 'vitest'
import { missedPoints } from '../src/lib/rubric'

const has = (missed: string[], word: string) => missed.some(m => m.toLowerCase().includes(word))

describe('missedPoints', () => {
  it('flags the allergy check when acetazolamide is mentioned without it', () => {
    expect(has(missedPoints('I would give acetazolamide and timolol'), 'sulfonamide')).toBe(true)
  })

  it('does not flag the allergy check when it was mentioned', () => {
    expect(has(missedPoints('acetazolamide after checking for sulfonamide allergy'), 'sulfonamide')).toBe(false)
  })

  it('does not raise the allergy point if acetazolamide was never mentioned', () => {
    expect(has(missedPoints('I would give timolol'), 'sulfonamide')).toBe(false)
  })

  it('flags the fellow eye when iridotomy is mentioned only for one eye', () => {
    expect(has(missedPoints('laser iridotomy'), 'both eyes')).toBe(true)
  })

  it('does not flag the fellow eye when both eyes are treated', () => {
    expect(has(missedPoints('laser iridotomy to both eyes'), 'both eyes')).toBe(false)
  })
})
