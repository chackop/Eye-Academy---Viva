import { describe, expect, it, vi } from 'vitest'
import { buildFollowUp, fallbackFollowUp } from '../src/lib/followup'

describe('buildFollowUp', () => {
  it('uses the model question when there is one, and sends the answer and revealed findings', async () => {
    const complete = vi.fn().mockResolvedValue('Why treat the left eye too?')
    const r = await buildFollowUp(complete, { answer: 'laser iridotomy right eye', revealedLabels: ['right Intraocular pressure'] })
    expect(r).toMatchObject({ text: 'Why treat the left eye too?', source: 'llm' })
    expect(complete.mock.calls[0][1]).toContain('laser iridotomy right eye')
    expect(complete.mock.calls[0][1]).toContain('right Intraocular pressure')
  })

  it('falls back to a rule when the model is unavailable', async () => {
    const r = await buildFollowUp(async () => null, { answer: 'I would give acetazolamide', revealedLabels: [] })
    expect(r.source).toBe('fallback')
    expect(r.text).toMatch(/acetazolamide/)
  })

  it.each([
    ['acetazolamide and timolol', /check before giving it/],
    ['acetazolamide after checking sulfonamide allergy', /pressure doesn't come down/], // allergy covered -> moves on
    ['pilocarpine drops', /pilocarpine not work/i],
    ['laser iridotomy', /left eye/],
  ])('fallback for "%s"', (answer, expected) => {
    expect(fallbackFollowUp(answer)).toMatch(expected)
  })
})
