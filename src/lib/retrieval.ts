import notePages from '../../data/note-pages.json'
import { CONFIG } from './config'

export type Chunk = { id: string; page: number; heading: string; text: string; context?: string }
export type Hit = { chunk: Chunk; score: number; matched: string[] }

const STOP = new Set(('a an and are as at be but by for from has have i if in into is it its of on or so that the their then there this to was were what when which will with would you your they them can may not do does did we our us should also than more most some such').split(' '))

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .map(w => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w))
}

const chunks: Chunk[] = (notePages as { chunks: Chunk[] }[]).flatMap(p => p.chunks)
// Index text = section heading + continuation context + passage text.
const docs = chunks.map(c => tokenize(`${c.heading} ${c.context ?? ''} ${c.text}`))
const avgLen = docs.reduce((n, d) => n + d.length, 0) / docs.length
const df = new Map<string, number>()
for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)

/** BM25 over passages. Deterministic and offline, so every retrieval is repeatable. */
export function search(query: string, k: number = CONFIG.retrieval.passages): Hit[] {
  const q = [...new Set(tokenize(query))]
  const N = docs.length
  const hits: Hit[] = []
  docs.forEach((d, i) => {
    const tf = new Map<string, number>()
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1)
    let score = 0
    const matched: string[] = []
    for (const w of q) {
      const f = tf.get(w)
      if (!f) continue
      const n = df.get(w) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * 2.5) / (f + 1.5 * (0.25 + 0.75 * (d.length / avgLen))))
      matched.push(w)
    }
    if (score > 0) hits.push({ chunk: chunks[i], score, matched })
  })
  return hits.sort((a, b) => b.score - a.score).slice(0, k)
}

/** Minimum evidence before we will claim the note supports anything. */
export const MIN_SCORE = CONFIG.retrieval.minScore
export const MIN_MATCHED_TERMS = CONFIG.retrieval.minMatchedTerms

export function isSupported(h?: Hit) {
  return !!h && h.score >= MIN_SCORE && h.matched.length >= MIN_MATCHED_TERMS
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** True only if `quote` really appears in the chunk, so a model cannot invent a supporting excerpt. */
export function quoteInChunk(quote: string, c: Chunk) {
  const q = norm(quote)
  return q.length >= 15 && norm(c.text).includes(q)
}
