import { CASE } from './findings-data'
import { CONFIG } from './config'
import { RULES } from './case-rules'
import type { Complete } from './llm-types'

/** Rule-based question used when no model is available. Rules come from data/case-rules.json. */
export function fallbackFollowUp(answer: string): string {
  const a = answer.toLowerCase()
  const ideas = CASE.examiner_notes.follow_up_ideas
  for (const r of RULES.followUps.rules) {
    if (r.when.test(a) && !(r.unless && r.unless.test(a))) return r.ask ?? ideas[r.idea!]
  }
  return ideas[RULES.followUps.defaultIdea]
}

export async function buildFollowUp(complete: Complete, input: { answer: string; revealedLabels: string[] }) {
  const t0 = Date.now()
  const system = `You are a friendly but exacting ophthalmology viva examiner. Ask the trainee exactly ONE short spoken follow-up question (max 25 words, no lists, no preamble) that responds to something specific they just said. Do not reveal findings they have not requested and do not give away the answer. You may draw on these teaching angles if relevant: ${CASE.examiner_notes.follow_up_ideas.join(' | ')}. Output only the question.`
  const user = `Case: ${CASE.opening_prompt}\nFindings the trainee has asked for so far: ${input.revealedLabels.join('; ') || 'none'}\nTrainee's answer: "${input.answer}"`
  const text = await complete(system, user, CONFIG.llm.followUpMaxTokens)
  return { text: text || fallbackFollowUp(input.answer), source: text ? ('llm' as const) : ('fallback' as const), serverMs: Date.now() - t0 }
}
