import { CONFIG } from './config'
import { RULES } from './case-rules'
import { CASE, FINDINGS, type Finding } from './findings-data'

export { CASE, FINDINGS, type Finding }

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9&/ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

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
  | { kind: 'unclear' } // sounds like a finding request but names nothing we recognise (often a mis-heard word)

/** Short, request-shaped, and not an answer: likely a finding request the recogniser garbled. */
function looksLikeRequest(t: string): boolean {
  if (RULES.answerCue.test(t)) return false
  return RULES.requestCue.test(t) || (t.split(' ').length <= 5 && /\b(each|both|right|left) eyes?\b/.test(t))
}

export function classifyUtterance(raw: string): Intent {
  const t = norm(raw)
  const topics = RULES.topics.filter(x => x.re.test(t))
  if (!topics.length) return looksLikeRequest(t) ? { kind: 'unclear' } : { kind: 'answer' }
  const isAnswer = RULES.answerCue.test(t)
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
