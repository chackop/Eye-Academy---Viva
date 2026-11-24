// Matches an utterance against plain phrase lists, tolerating plurals and small spelling/recognition slips.
// Pure and dependency-free. Replaces hand-written regex aliases: a clinician can edit a list of phrases,
// and near-misses like "gonioscopey" match without anyone adding an alias.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&/ ]+/g, ' ').replace(/\s+/g, ' ').trim()
export const words = (s: string): string[] => { const n = norm(s); return n ? n.split(' ') : [] }

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * How many letters may differ. Short words get none: one wrong letter turns "cornea" into "corner",
 * so only longer, distinctive clinical words (gonioscopy, tonometry, conjunctiva...) are matched loosely.
 */
export const allowedEdits = (termLength: number) => (termLength < 7 ? 0 : termLength < 10 ? 1 : 2)

/**
 * Does `token` (a word the recogniser produced) stand for `term` (a word in our phrase list)?
 * `known` is every word in any phrase list: a real word that merely resembles a term (e.g. "blood" vs "bloods")
 * must not be "corrected" into the wrong topic.
 */
export function tokenMatches(token: string, term: string, known: ReadonlySet<string>): boolean {
  if (token === term || token === term + 's') return true // exact, or the plural of a listed singular
  if (known.has(token) || known.has(token.replace(/s$/, ''))) return false
  const k = allowedEdits(term.length)
  if (!k || token.length < 7 || token[0] !== term[0]) return false // the first sound is rarely the one that is wrong
  return Math.abs(token.length - term.length) <= k && levenshtein(token, term) <= k
}

function indexOfPhrase(tokens: string[], phrase: string[], known: ReadonlySet<string>): number {
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((term, j) => tokenMatches(tokens[i + j], term, known))) return i
  }
  return -1
}

export type CompiledTopic = { prefix: string; test: (text: string) => boolean }

export function compileTopics(
  topics: { prefix: string; phrases: string[]; excludes?: string[] }[],
): CompiledTopic[] {
  const split = (list: string[] = []) => list.map(words).filter(p => p.length)
  const known = new Set(topics.flatMap(t => [...split(t.phrases), ...split(t.excludes)].flat()))
  return topics.map(t => {
    const phrases = split(t.phrases)
    const excludes = split(t.excludes)
    return {
      prefix: t.prefix,
      test(text: string) {
        let tokens = words(text)
        // e.g. the pressure topic must not fire on "blood pressure": remove those words before matching.
        for (const ex of excludes) {
          for (let i = indexOfPhrase(tokens, ex, new Set()); i !== -1; i = indexOfPhrase(tokens, ex, new Set())) {
            tokens = [...tokens.slice(0, i), ...tokens.slice(i + ex.length)]
          }
        }
        return phrases.some(p => indexOfPhrase(tokens, p, known) !== -1)
      },
    }
  })
}
