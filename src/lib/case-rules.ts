// Case-specific matching rules live in data/case-rules.json, not in code. This file validates and compiles them,
// so a bad pattern or a topic with no matching finding fails loudly at startup instead of silently at runtime.
import { z } from 'zod'
import raw from '../../data/case-rules.json'
import { FINDINGS } from './findings-data'

const pattern = z.string().refine(p => { try { new RegExp(p); return true } catch { return false } }, 'invalid regular expression')

export const caseRulesSchema = z.object({
  topics: z.array(z.object({ prefix: z.string().min(1), pattern })).min(1),
  answerCue: pattern,
  requestCue: pattern,
  rubric: z.array(z.object({ key: z.string().min(1), hit: pattern, onlyIf: pattern.optional() })),
  followUps: z.object({
    rules: z.array(z.object({ when: pattern, unless: pattern.optional(), ask: z.string().optional(), idea: z.number().int().min(0).optional() })
      .refine(r => r.ask !== undefined || r.idea !== undefined, 'a follow-up rule needs `ask` or `idea`')),
    defaultIdea: z.number().int().min(0),
  }),
})

const parsed = caseRulesSchema.parse(raw)

for (const t of parsed.topics) {
  if (!FINDINGS.some(f => f.id.startsWith(t.prefix))) throw new Error(`case-rules.json: topic "${t.prefix}" matches no finding in case.json`)
}

const re = (p: string) => new RegExp(p)
export const RULES = {
  topics: parsed.topics.map(t => ({ prefix: t.prefix, re: re(t.pattern) })),
  answerCue: re(parsed.answerCue),
  requestCue: re(parsed.requestCue),
  rubric: parsed.rubric.map(r => ({ key: r.key, hit: re(r.hit), onlyIf: r.onlyIf ? re(r.onlyIf) : undefined })),
  followUps: {
    rules: parsed.followUps.rules.map(r => ({ when: re(r.when), unless: r.unless ? re(r.unless) : undefined, ask: r.ask, idea: r.idea })),
    defaultIdea: parsed.followUps.defaultIdea,
  },
}
