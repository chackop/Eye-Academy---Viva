import { describe, expect, it } from 'vitest'
import { isSupported, quoteInChunk, search, type Chunk } from '../src/lib/retrieval'

describe('retrieval', () => {
  it('allergy-before-acetazolamide query ranks page 6 first and is supported', () => {
    const hits = search('acetazolamide sulfonamide allergy check before giving it')
    // Recorded for the write-up: which pages were retrieved and which passage would be cited.
    console.log('retrieved:', hits.map(h => `${h.chunk.id} (p${h.chunk.page}, ${h.score.toFixed(1)})`).join(', '))
    console.log('cited:', hits[0].chunk.id, '-', hits[0].chunk.text.slice(0, 120))
    expect(hits[0].chunk.page).toBe(6)
    expect(isSupported(hits[0])).toBe(true)
  })

  it('off-topic query is not supported', () => {
    expect(isSupported(search('how do I cook pasta with tomato sauce')[0])).toBe(false)
  })

  it('empty query finds nothing and is not supported', () => {
    expect(isSupported(search('')[0])).toBe(false)
  })
})

describe('quoteInChunk: the guard against invented citations', () => {
  const chunk: Chunk = {
    id: 'x', page: 6, heading: 'h',
    text: 'Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it.',
  }

  it('accepts a real excerpt, ignoring case and punctuation', () => {
    expect(quoteInChunk('check for sulfonamide allergy kidney disease low potassium', chunk)).toBe(true)
  })

  it('rejects a quote that is not in the passage', () => {
    expect(quoteInChunk('Always give acetazolamide to every patient immediately', chunk)).toBe(false)
  })

  it('rejects a quote that is too short to be meaningful', () => {
    expect(quoteInChunk('sulfonamide', chunk)).toBe(false)
  })
})
