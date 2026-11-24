import { describe, expect, it } from 'vitest'
import raw from '../data/case-rules.json'
import { RULES, caseRulesSchema } from '../src/lib/case-rules'
import { FINDINGS } from '../src/lib/findings-data'

describe('case rules', () => {
  it('the shipped rules file is valid', () => {
    expect(caseRulesSchema.safeParse(raw).success).toBe(true)
  })

  it('every finding can be reached by some topic (no finding is unaskable)', () => {
    const unreachable = FINDINGS.filter(f => !RULES.topics.some(t => f.id.startsWith(t.prefix)))
    expect(unreachable.map(f => f.id)).toEqual([])
  })

  it('rejects an invalid regular expression', () => {
    const bad = { ...raw, answerCue: '([unclosed' }
    expect(caseRulesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a follow-up rule with neither `ask` nor `idea`', () => {
    const bad = { ...raw, followUps: { ...raw.followUps, rules: [{ when: 'x' }] } }
    expect(caseRulesSchema.safeParse(bad).success).toBe(false)
  })
})
