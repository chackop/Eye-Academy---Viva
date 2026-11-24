import { CONFIG } from './config'
import { RULES } from './case-rules'
import { CASE, FINDINGS, type Finding } from './findings-data'
import { norm } from './phrase-match'

export { CASE, FINDINGS, type Finding }


/** Which eyes did the trainee name? Unnamed = both, so a lookup can never silently return the wrong eye. */
function eyesMentioned(t: string): ('right' | 'left')[] {
  const both = /\b(both|each|either|bilateral|bilaterally|other eye|fellow eye|two eyes)\b/.test(t)
  const r = /\b(right|od)\b/.test(t)
  const l = /\b(left|os)\b/.test(t)
  if (both || (r && l) || (!r && !l)) return ['right', 'left']
  return r ? ['right'] : ['left']
}

export type Intent =
  | { kind: 'findings'; findings: Finding[] }
  | { kind: 'answer' }
  | { kind: 'done' } // "that's all": only recognised when the examiner has asked if there is anything else
  | { kind: 'unclear' } // names no finding and does not sound like an answer (often a mis-heard word)

/**
 * An utterance counts as the trainee's answer only if it positively looks like one: answer wording, clinical terms,
 * or a long statement that is not a question. Speech recognition garbles words often, so a short phrase we do not
 * understand must NOT be taken as their diagnosis; it is 'unclear' and the examiner asks again.
 */
function looksLikeAnswer(t: string): boolean {
  if (RULES.answerCue.test(t) || RULES.answerTerms.test(t)) return true
  return t.split(' ').length >= CONFIG.matching.longAnswerMinWords && !RULES.requestCue.test(t)
}

/** `expectingAnswer`: the examiner has just asked a question, so a terse reply that is not shaped like a request is the answer. */
export function classifyUtterance(raw: string, opts: { expectingAnswer?: boolean; wrappingUp?: boolean } = {}): Intent {
  const t = norm(raw)
  // Whole-utterance match, so "no allergy to sulfonamides" is an answer, not the end.
  if (opts.wrappingUp && RULES.doneCue.test(t)) return { kind: 'done' }
  const topics = RULES.topics.filter(x => x.test(t))
  if (!topics.length) {
    const terseReply = !!opts.expectingAnswer && t.split(' ').length >= 3 && !RULES.requestCue.test(t) && !/\b(each|both|right|left) eyes?\b/.test(t)
    return looksLikeAnswer(t) || terseReply ? { kind: 'answer' } : { kind: 'unclear' }
  }
  const isAnswer = looksLikeAnswer(t) // answer wording, or clinical terms such as "iridotomy"
  const isRequest = RULES.requestCue.test(t) || t.split(' ').length <= CONFIG.matching.shortRequestMaxWords
  // "I think it's angle closure so I'd get gonioscopy" is an answer; "can I have gonioscopy" is a request.
  if (isAnswer && !isRequest) return { kind: 'answer' }
  const eyes = eyesMentioned(t)
  const out: Finding[] = []
  for (const tp of topics) {
    for (const f of FINDINGS) {
      if (!f.id.startsWith(tp.prefix)) continue
      if ((f.eye === 'right' || f.eye === 'left') && !eyes.includes(f.eye)) continue
      if (!out.includes(f)) out.push(f)
    }
  }
  return out.length ? { kind: 'findings', findings: out } : { kind: 'answer' }
}

export const EYE_LABEL: Record<string, string> = { right: 'Right eye', left: 'Left eye', both: 'Both eyes' }

/** Value exactly as it should appear on screen (value + unit once). */
export function displayValue(f: Finding): string {
  if (!f.available) return `Not available: ${f.unavailable_reason ?? 'not performed'}`
  const v = String(f.value)
  if (!f.unit) return v
  return v.toLowerCase().includes(f.unit.toLowerCase()) ? v : `${v} ${f.unit}`
}

/** Text for the speech synthesiser: same facts, spoken-friendly. */
export function spokenText(f: Finding): string {
  const eye = f.eye ? EYE_LABEL[f.eye] + ' ' : ''
  const label = `${eye}${f.label.toLowerCase()}`.replace(/^\w/, c => c.toUpperCase())
  if (!f.available) return `${label} is not available. ${f.unavailable_reason ?? ''}`.trim() + '.'
  let v = displayValue(f)
  v = v
    .replace(/1\/4/g, 'a quarter')
    .replace(/(\d+)\/(\d+)/g, '$1 over $2')
    .replace(/\+(\d)/g, 'plus $1')
    .replace(/\bmmHg\b/g, 'millimetres of mercury')
    .replace(/(\d) ?mm\b/g, '$1 millimetres')
    .replace(/\bDS\b/g, 'dioptre sphere')
  return `${label}: ${v}.`
}
