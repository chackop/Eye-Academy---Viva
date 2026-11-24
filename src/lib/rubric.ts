import { CASE } from './findings-data'
import { RULES } from './case-rules'

// Which of the examiner's key points did the trainee's answer touch? Cheap keyword check driven by
// data/case-rules.json; used only to steer retrieval towards the most important gap, never shown as a mark.
export function missedPoints(answer: string): string[] {
  const a = answer.toLowerCase()
  return RULES.rubric.filter(r => (r.onlyIf ? r.onlyIf.test(a) : true) && !r.hit.test(a)).map(r => r.key)
}

export const KEY_POINTS: string[] = CASE.examiner_notes.key_points
