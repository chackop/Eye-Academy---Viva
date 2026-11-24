import { describe, expect, it } from 'vitest'
import { classifyUtterance, displayValue, spokenText, type Finding } from '../src/lib/findings'

const findings = (text: string): Finding[] => {
  const r = classifyUtterance(text)
  if (r.kind !== 'findings') throw new Error(`expected a finding request, got an answer: "${text}"`)
  return r.findings
}

describe('available findings keep eye, value and unit', () => {
  it('right-eye pressure returns only the right eye', () => {
    const f = findings('Can I have the pressure in the right eye please')
    expect(f.map(x => x.id)).toEqual(['iop_right'])
    expect(displayValue(f[0])).toBe('58 mmHg')
    expect(spokenText(f[0])).toBe('Right eye intraocular pressure: 58 millimetres of mercury.')
  })

  it('left-eye acuity is 6/9 Snellen', () => {
    const [f] = findings('what is the visual acuity in the left eye')
    expect(f.id).toBe('va_left')
    expect(displayValue(f)).toBe('6/9 Snellen')
  })

  it.each([
    ['visual acuity in each eye', ['va_right', 'va_left']],
    ['what are the pressures', ['iop_right', 'iop_left']], // no eye named = both, never a guess
    ['blood pressure', ['bp']],
  ])('"%s" -> %j', (text, ids) => {
    expect(findings(text).map(x => x.id)).toEqual(ids)
  })

  it('speaks blood pressure as "over" with units', () => {
    expect(spokenText(findings('blood pressure')[0])).toBe('Blood pressure: 168 over 94 millimetres of mercury.')
  })
})

describe('unavailable findings are reported, never invented', () => {
  it('right gonioscopy', () => {
    const [f] = findings('can I check gonioscopy in the right eye')
    expect(f.id).toBe('gonio_right')
    expect(f.available).toBe(false)
    expect(spokenText(f)).toBe('Right eye gonioscopy is not available. No view: corneal oedema.')
  })

  it('RAPD', () => {
    const [f] = findings('is there an RAPD')
    expect(f.id).toBe('rapd')
    expect(f.available).toBe(false)
  })
})

describe('speech-recognition mishearings', () => {
  it.each([
    ['visual equity in each eye', ['va_right', 'va_left']],
    ['what is the I O P in the left eye', ['iop_left']],
    ['gonna scopy of the right eye', ['gonio_right']],
    ['wish you liquidity in each eye', ['va_right', 'va_left']], // heard for "visual acuity in each eye"
    ['is there an r a p t', ['rapd']], // heard for "is there an RAPD"
  ])('"%s"', (text, ids) => {
    expect(findings(text).map(x => x.id)).toEqual(ids)
  })

  it.each([
    'what is the visual blorp in each eye',
    'show me the glarb',
    'wish you blorp in each eye',
    'is there an r a p k',
    'hello',
    'okay',
  ])('an unrecognised request is "unclear", not an answer: "%s"', text => {
    expect(classifyUtterance(text).kind).toBe('unclear')
  })

  it('a real answer is not "unclear"', () => {
    expect(classifyUtterance('I think this is angle closure in the right eye').kind).toBe('answer')
    expect(classifyUtterance('angle closure').kind).toBe('answer')
    expect(classifyUtterance('timolol and a laser').kind).toBe('answer')
    expect(classifyUtterance("I don't know").kind).toBe('answer')
  })
})

describe('answers are not mistaken for finding requests', () => {
  it.each([
    'I think this is acute angle closure and I would treat it',
    'I would lower the pressure with timolol and acetazolamide',
    'I would check for a kidney problem and potassium', // regression: was treated as a U&E request
    "I'd give timolol",
  ])('"%s"', text => {
    expect(classifyUtterance(text).kind).toBe('answer')
  })
})
