import type { Complete } from './llm-types'
import { CONFIG } from './config'
import { search, isSupported, quoteInChunk, type Hit } from './retrieval'
import { missedPoints } from './rubric'
import type { Revision } from './types'

export const NO_SUPPORT = "I couldn't find support for a revision point in the reference note, so I won't offer one for this answer."

const summarise = (hits: Hit[]) => hits.map(h => ({ id: h.chunk.id, page: h.chunk.page, score: Math.round(h.score * 10) / 10 }))

export const REVISION_SYSTEM = `You write ONE revision point for an ophthalmology trainee, using ONLY the numbered passages from the Eye Academy reference note. Address the most important gap or error in the trainee's answer. Reply with JSON only: {"supported": boolean, "passage_id": string, "point": string (max 2 sentences, second person), "quote": string (a verbatim run of 8-30 words copied from that passage)}. If no passage supports a useful point, reply {"supported": false}.`

/** Check a model reply against the passages we actually retrieved. Returns null if it cannot be trusted. */
export function verifyModelReply(raw: string, hits: Hit[], retrieved: Revision['retrieved']): Revision | null {
  let j: any
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { return null }
  if (j?.supported === false) return { supported: false, retrieved, message: NO_SUPPORT }
  const chunk = hits.find(h => h.chunk.id === j?.passage_id)?.chunk // must be a passage we retrieved
  if (j?.supported && chunk && typeof j.point === 'string' && quoteInChunk(String(j.quote), chunk)) { // excerpt must really be in it
    return { supported: true, point: j.point, page: chunk.page, excerpt: String(j.quote), passageId: chunk.id, source: 'llm', retrieved }
  }
  return null
}

/** Cut at a word boundary, never mid-word. */
export function shorten(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, s.lastIndexOf(' ', max)).trimEnd() + '…'
}

export async function buildRevision(complete: Complete, answers: string[]): Promise<Revision> {
  const answer = answers.join(' ').trim()
  const missed = missedPoints(answer)
  // Gate on the answer alone: the note must be relevant to what the trainee actually said. (If we gated on the
  // query below, the rubric text we add would match the note whatever the answer was.)
  const answerHits = search(answer, CONFIG.retrieval.passages)
  if (!isSupported(answerHits[0])) return { supported: false, retrieved: summarise(answerHits), message: NO_SUPPORT }
  // The revision point is about the most important thing they left out, so search for that gap and put its
  // passages first. Otherwise the top passage would just echo the trainee's own words, not the gap we name.
  const gapHits = missed[0] ? search(missed[0], CONFIG.retrieval.gapPassages).filter(h => isSupported(h)) : []
  const hits = [...gapHits, ...answerHits.filter(h => !gapHits.some(g => g.chunk.id === h.chunk.id))].slice(0, CONFIG.retrieval.passages)
  const retrieved = summarise(hits)

  const passages = hits.map(h => `[${h.chunk.id}] (page ${h.chunk.page}) ${h.chunk.text}`).join('\n\n')
  const raw = await complete(
    REVISION_SYSTEM,
    `Trainee's answer: "${answer}"\nThings the examiner expected that were not mentioned: ${missed.join('; ') || 'none'}\n\nPassages:\n${passages}`,
    CONFIG.llm.revisionMaxTokens,
  )
  const verified = raw ? verifyModelReply(raw, hits, retrieved) : null
  if (verified) return verified

  // No key, or the model's reply failed verification: extractive point straight from the top passage.
  const top = hits[0].chunk
  const excerpt = shorten(top.text.split(/(?<=\.)\s/).slice(0, 2).join(' '), 300)
  return { supported: true, point: `Revise this section of the note${missed[0] ? ` (you didn't mention: ${missed[0].toLowerCase()})` : ''}.`, page: top.page, excerpt, passageId: top.id, source: 'extractive', retrieved }
}
