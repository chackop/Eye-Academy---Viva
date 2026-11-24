import { describe, expect, it } from 'vitest'
import { CLOSING_TEXT, PHASE_TABLE, UI_TABLE, completeTurn, findingsSpeech, newAttempt, planTurn, traineeAnswers, uiReducer, type UiEvent, type UiStatus } from '../src/lib/viva'

describe('planTurn (phase transitions)', () => {
  it('a finding request reveals and stays in examining', () => {
    const p = planTurn('examining', 'what is the pressure in the right eye')
    expect(p.action).toBe('reveal')
    expect(p.next).toBe('examining')
  })

  it('the first answer triggers the follow-up', () => {
    const p = planTurn('examining', 'I think this is acute angle closure and I would give timolol')
    expect(p).toEqual({ action: 'ask_followup', next: 'followup' })
  })

  it('an answer to the follow-up closes the viva, even one mentioning exam words', () => {
    expect(planTurn('followup', 'I would check for a kidney problem and potassium')).toEqual({ action: 'close', next: 'done' })
    expect(planTurn('followup', 'I would check the blood pressure and give acetazolamide')).toEqual({ action: 'close', next: 'done' })
  })

  it('a finding request during the follow-up is answered and does not use up the follow-up', () => {
    const p = planTurn('followup', 'what is the blood pressure')
    expect(p.action).toBe('reveal')
    expect(p.next).toBe('followup')
  })

  it.each(['examining', 'followup'] as const)('an unclear finding request (%s) asks again and keeps the phase', phase => {
    expect(planTurn(phase, 'what is the visual blorp in each eye')).toEqual({ action: 'clarify', next: phase })
  })

  it('a mis-heard "visual equity" is still understood as visual acuity', () => {
    expect(planTurn('examining', 'visual equity in each eye').action).toBe('reveal')
  })

  it('clarifying does not count as an answer', () => {
    const a = newAttempt('u', 1)
    const next = completeTurn(a, planTurn('examining', 'what is the visual blorp'), 'what is the visual blorp', 'Sorry?', 2)
    expect(next.transcript.at(-2)).toMatchObject({ role: 'trainee', kind: 'clarify' })
    expect(traineeAnswers(next)).toEqual([])
  })

  it('nothing happens once the viva is done', () => {
    expect(planTurn('done', 'what is the pressure')).toEqual({ action: 'ignore', next: 'done' })
  })

  it('table is total: every phase defines every utterance kind', () => {
    for (const phase of ['examining', 'followup', 'done'] as const) {
      expect(Object.keys(PHASE_TABLE[phase]).sort()).toEqual(['answer', 'findings', 'unclear'])
    }
  })
})

describe('completeTurn (full flow, no browser)', () => {
  it('runs finding -> unavailable finding -> answer -> follow-up reply -> done', () => {
    let a = newAttempt('user-1', 1000)
    expect(a.transcript).toHaveLength(1)

    const turn = (text: string, examinerText?: string, meta = {}) => {
      const plan = planTurn(a.phase, text)
      const say = examinerText ?? (plan.action === 'reveal' ? findingsSpeech(plan.findings) : plan.action === 'close' ? CLOSING_TEXT : 'Q?')
      a = completeTurn(a, plan, text, say, 2000, meta)
    }

    turn('what is the pressure in the right eye', undefined, { latencyMs: 300 })
    expect(a.revealed.map(f => f.id)).toEqual(['iop_right'])
    expect(a.transcript.at(-1)).toMatchObject({ kind: 'finding', text: 'Right eye intraocular pressure: 58 millimetres of mercury.', latencyMs: 300 })

    turn('can I see gonioscopy in the right eye')
    expect(a.revealed.map(f => [f.id, f.available])).toEqual([['iop_right', true], ['gonio_right', false]])

    turn('what is the pressure in the right eye') // asked twice: shown once
    expect(a.revealed).toHaveLength(2)

    turn('I think this is angle closure, I would give acetazolamide', 'You mentioned acetazolamide...', { serverMs: 800 })
    expect(a.phase).toBe('followup')
    expect(a.transcript.at(-1)).toMatchObject({ kind: 'followup', serverMs: 800 })

    turn('I would check for kidney problems')
    expect(a.phase).toBe('done')
    expect(a.transcript.at(-1)?.kind).toBe('closing')
    expect(traineeAnswers(a)).toEqual(['I think this is angle closure, I would give acetazolamide', 'I would check for kidney problems'])
  })

  it('does not mutate the previous attempt', () => {
    const a = newAttempt('u', 1)
    const before = JSON.stringify(a)
    completeTurn(a, planTurn('examining', 'visual acuity'), 'visual acuity', 'x', 2)
    expect(JSON.stringify(a)).toBe(before)
  })

  it('ignored turns return the same attempt', () => {
    const a = { ...newAttempt('u', 1), phase: 'done' as const }
    expect(completeTurn(a, planTurn('done', 'hello'), 'hello', 'x', 2)).toBe(a)
  })
})

describe('uiReducer (who may speak)', () => {
  const run = (start: UiStatus, ...events: UiEvent[]) => events.reduce(uiReducer, start)

  it('happy path: idle -> listening -> thinking -> speaking -> idle', () => {
    expect(run('idle', { type: 'LISTEN' }, { type: 'THINK' }, { type: 'SPEAK' }, { type: 'SETTLE', done: false })).toBe('idle')
  })

  it('settling after the final line goes to done, not idle', () => {
    expect(run('speaking', { type: 'SETTLE', done: true })).toBe('done')
  })

  it('cannot start listening while the examiner is thinking', () => {
    expect(run('thinking', { type: 'LISTEN' })).toBe('thinking')
  })

  it('a mic that ends with no speech returns to idle, but only from listening', () => {
    expect(run('listening', { type: 'MIC_ENDED' })).toBe('idle')
    expect(run('speaking', { type: 'MIC_ENDED' })).toBe('speaking')
  })

  it('replaying a line after the viva returns to done', () => {
    expect(run('done', { type: 'SPEAK' }, { type: 'SETTLE', done: true })).toBe('done')
  })

  it('every state can reach done', () => {
    for (const s of Object.keys(UI_TABLE) as UiStatus[]) expect(run(s, { type: 'FINISH' })).toBe('done')
  })
})
