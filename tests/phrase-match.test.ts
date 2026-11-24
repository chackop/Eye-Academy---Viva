import { describe, expect, it } from 'vitest'
import { allowedEdits, compileTopics, levenshtein, tokenMatches, words } from '../src/lib/phrase-match'
import { classifyUtterance } from '../src/lib/findings'

const ids = (text: string) => {
  const r = classifyUtterance(text)
  return r.kind === 'findings' ? r.findings.map(f => f.id) : r.kind
}

describe('levenshtein', () => {
  it.each([['gonioscopy', 'gonioscopy', 0], ['gonioscopey', 'gonioscopy', 1], ['tonometri', 'tonometry', 1], ['equity', 'acuity', 2], ['', 'abc', 3]])(
    '%s vs %s = %i', (a, b, d) => expect(levenshtein(a, b)).toBe(d))
})

describe('allowedEdits: short words get none', () => {
  it.each([[4, 0], [6, 0], [7, 1], [9, 1], [10, 2], [14, 2]])('%i letters -> %i', (len, k) => expect(allowedEdits(len)).toBe(k))
})

describe('tokenMatches', () => {
  const known = new Set(['blood', 'bloods', 'pressure', 'pupil', 'gonioscopy', 'cornea', 'conjunctiva'])
  it('matches exact words and plurals of listed singulars', () => {
    expect(tokenMatches('pupil', 'pupil', known)).toBe(true)
    expect(tokenMatches('pupils', 'pupil', known)).toBe(true)
  })
  it('matches a small slip in a long clinical word', () => {
    expect(tokenMatches('gonioscopey', 'gonioscopy', known)).toBe(true)
    expect(tokenMatches('conjuntiva', 'conjunctiva', known)).toBe(true)
  })
  it('does NOT loosely match short words ("corner" must not become "cornea")', () => {
    expect(tokenMatches('corner', 'cornea', known)).toBe(false)
  })
  it('does NOT correct a real listed word into a different one ("blood" is not "bloods")', () => {
    expect(tokenMatches('blood', 'bloods', known)).toBe(false)
  })
  it('requires the same first letter', () => {
    expect(tokenMatches('ronioscopy', 'gonioscopy', known)).toBe(false)
  })
  it('does not stretch to very different lengths', () => {
    expect(tokenMatches('gonioscopyyyy', 'gonioscopy', known)).toBe(false)
  })
})

describe('compileTopics', () => {
  const [bp, iop] = compileTopics([
    { prefix: 'bp', phrases: ['blood pressure', 'bp'] },
    { prefix: 'iop_', phrases: ['pressure', 'iop'], excludes: ['blood pressure'] },
  ])
  it('matches multi-word phrases only as a contiguous run', () => {
    expect(bp.test('what is the blood pressure')).toBe(true)
    expect(bp.test('the blood is under pressure')).toBe(false)
  })
  it('excludes phrases so "blood pressure" does not trigger the eye-pressure topic', () => {
    expect(iop.test('what is the blood pressure')).toBe(false)
    expect(iop.test('what is the pressure')).toBe(true)
    expect(iop.test('the pressure and the blood pressure')).toBe(true) // a genuine eye-pressure request is kept
  })
})

describe('topics through the real case rules', () => {
  it.each([
    ['gonioscopey in the right eye', ['gonio_right']], // spelling slip, no alias needed
    ['tonometri of the left eye', ['iop_left']],
    ['conjuntiva in each eye', ['conj_right', 'conj_left']],
    ['the pupils', ['pupil_right', 'pupil_left']],
    ['what are the blood pressures', ['bp']],
    ['visual equity in each eye', ['va_right', 'va_left']], // listed mishearing
  ])('"%s"', (text, expected) => expect(ids(text)).toEqual(expected))

  it('"corner" is not the cornea', () => {
    expect(ids('what is in the corner of the eye')).not.toContain('cornea_right')
  })

  it('words() normalises case and punctuation', () => {
    expect(words("What's the I.O.P?")).toEqual(['what', 's', 'the', 'i', 'o', 'p'])
  })
})
