import { describe, expect, it, vi } from 'vitest'
import { buildRevision, NO_SUPPORT, shorten } from '../src/lib/revision'

const ANSWER = ['I think this is acute angle closure. I would give timolol, apraclonidine and acetazolamide, then laser iridotomy.']
const GOOD_QUOTE = 'Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it.'
const reply = (o: object) => async () => JSON.stringify(o)

describe('buildRevision with a fake model', () => {
  it('accepts a reply whose passage and quote are real', async () => {
    const r = await buildRevision(reply({ supported: true, passage_id: 'p6-c1', point: 'Check for sulfonamide allergy first.', quote: GOOD_QUOTE }), ANSWER)
    expect(r).toMatchObject({ supported: true, source: 'llm', page: 6, passageId: 'p6-c1' })
  })

  it('rejects an invented quote and falls back to an extract of a real passage', async () => {
    const r = await buildRevision(reply({ supported: true, passage_id: 'p6-c1', point: 'x', quote: 'Acetazolamide is safe for every patient with any allergy at all' }), ANSWER)
    expect(r).toMatchObject({ supported: true, source: 'extractive' })
    if (r.supported) expect(r.excerpt).not.toContain('safe for every patient')
  })

  it('rejects a citation of a passage that was not retrieved', async () => {
    const r = await buildRevision(reply({ supported: true, passage_id: 'p9-c99', point: 'x', quote: GOOD_QUOTE }), ANSWER)
    expect(r).toMatchObject({ supported: true, source: 'extractive' })
  })

  it('passes a model "not supported" verdict through to the trainee', async () => {
    const r = await buildRevision(reply({ supported: false }), ANSWER)
    expect(r).toMatchObject({ supported: false, message: NO_SUPPORT })
  })

  it.each([['not json at all'], [''], ['{"supported": tr']])('garbage reply %j -> extractive', async raw => {
    const r = await buildRevision(async () => raw, ANSWER)
    expect(r).toMatchObject({ supported: true, source: 'extractive' })
  })

  it('model unavailable (null) -> extractive from the top passage', async () => {
    const r = await buildRevision(async () => null, ANSWER)
    expect(r.supported && r.page).toBe(6)
  })

  it('off-topic answer is unsupported and never calls the model', async () => {
    const complete = vi.fn()
    const r = await buildRevision(complete, ['how do I cook pasta with tomato sauce'])
    expect(r).toMatchObject({ supported: false, message: NO_SUPPORT })
    expect(complete).not.toHaveBeenCalled()
  })

  it('no answers at all is unsupported', async () => {
    expect((await buildRevision(async () => null, [])).supported).toBe(false)
  })
})

describe('the revision point and its citation agree', () => {
  it('names the missed gap and cites the passage about that gap, not one echoing the answer', async () => {
    // Allergy is covered here, so the first missed point is "stop the chlorphenamine".
    const answer = ['This is acute angle closure. I would give timolol, apraclonidine and acetazolamide after checking for sulfonamide allergy, then laser iridotomy to both eyes. Analgesia and an antiemetic too.']
    const r = await buildRevision(async () => null, answer)
    expect(r.supported).toBe(true)
    if (r.supported) {
      console.log('gap citation:', r.page, r.passageId, '-', r.excerpt.slice(0, 100))
      expect(r.point).toMatch(/chlorphenamine/i)
      expect(r.page).toBe(4) // the Triggers list, where chlorphenamine is named
    }
  })
})

describe('shorten', () => {
  it('leaves short text alone', () => expect(shorten('short text', 50)).toBe('short text'))
  it('cuts at a word boundary and adds an ellipsis', () => {
    const out = shorten('Drugs with anticholinergic effects, including some antihistamines and tricyclic antidepressants', 60)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61)
    expect('Drugs with anticholinergic effects, including some antihistamines and tricyclic antidepressants').toContain(out.slice(0, -1))
    expect(out).not.toMatch(/\b(tricyclic|antid)\S*…$/) // not cut inside a word
  })
})
