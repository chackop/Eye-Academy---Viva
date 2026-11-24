import { describe, expect, it } from 'vitest'
import { PHASE_TABLE, examinerLine, UI_TABLE, completeTurn, findingsSpeech, newAttempt, planTurn, traineeAnswers, uiReducer, type UiEvent, type UiStatus } from '../src/lib/viva'

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

  it('an answer to the follow-up asks if there is anything else; it does NOT end the viva', () => {
    expect(planTurn('followup', 'I would check for a kidney problem and potassium')).toEqual({ action: 'offer_wrapup', next: 'wrapup' })
    expect(planTurn('followup', 'I would check the blood pressure and give acetazolamide')).toEqual({ action: 'offer_wrapup', next: 'wrapup' })
  })

  it('a terse reply to the follow-up is accepted as the answer', () => {
    expect(planTurn('followup', 'sulfonamide allergy and kidney function')).toEqual({ action: 'offer_wrapup', next: 'wrapup' })
  })

  describe('wrapup: the viva ends only when the trainee says they are finished', () => {
    it.each(["that's all", 'no', 'No thanks', "I'm done", 'nothing else', 'finish', "that's all, thank you"])('"%s" ends it', text => {
      expect(planTurn('wrapup', text)).toEqual({ action: 'close', next: 'done' })
    })

    it.each([
      'no allergy to sulfonamides', // starts with "no" but is a clinical statement
      'I would also stop the chlorphenamine',
      'nothing else makes the pressure fall faster than iridotomy',
    ])('"%s" does not end it; it is kept as part of the answer', text => {
      expect(planTurn('wrapup', text)).toEqual({ action: 'note', next: 'wrapup' })
    })

    it('findings can still be requested', () => {
      expect(planTurn('wrapup', 'what is the blood pressure')).toMatchObject({ action: 'reveal', next: 'wrapup' })
    })

    it('a garbled phrase asks again instead of ending', () => {
      expect(planTurn('wrapup', 'is there an r a p k')).toEqual({ action: 'clarify', next: 'wrapup' })
    })

    it.each(['examining', 'followup'] as const)('"that\'s all" during %s asks to confirm instead of ending on one phrase', phase => {
      expect(planTurn(phase, "that's all")).toEqual({ action: 'confirm_finish', next: 'wrapup' })
    })

    it('saying it again after the confirmation ends the viva', () => {
      expect(planTurn('wrapup', "that's all")).toEqual({ action: 'close', next: 'done' })
    })

    it('the confirmation line is not counted as an answer', () => {
      const a = newAttempt('u', 1)
      const next = completeTurn(a, planTurn('examining', "that's all"), "that's all", examinerLine('confirm_finish'), 2)
      expect(next.phase).toBe('wrapup')
      expect(next.transcript.at(-2)).toMatchObject({ role: 'trainee', kind: 'system' })
      expect(traineeAnswers(next)).toEqual([])
    })
  })

  it.each([
    'is there an r a p k', // garbled "RAPD"
    'wish you blorp in each eye', // garbled finding request: mentions an eye
    'okay',
  ])('a garbled request during the follow-up does not end the viva: "%s"', text => {
    expect(planTurn('followup', text)).toEqual({ action: 'clarify', next: 'followup' })
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
    for (const phase of ['examining', 'followup', 'wrapup', 'done'] as const) {
      expect(Object.keys(PHASE_TABLE[phase]).sort()).toEqual(['answer', 'done', 'findings', 'unclear'])
    }
  })
})

describe('completeTurn (full flow, no browser)', () => {
  it('runs finding -> unavailable finding -> answer -> follow-up reply -> wrap-up -> done', () => {
    let a = newAttempt('user-1', 1000)
    expect(a.transcript).toHaveLength(1)

    const turn = (text: string, examinerText?: string, meta = {}) => {
      const plan = planTurn(a.phase, text)
      const say = examinerText ?? (plan.action === 'reveal' ? findingsSpeech(plan.findings) : plan.action === 'ignore' || plan.action === 'ask_followup' ? 'Q?' : examinerLine(plan.action))
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
    expect(a.phase).toBe('wrapup') // not finished yet
    expect(a.transcript.at(-1)?.kind).toBe('wrapup')

    turn('I would also stop the chlorphenamine') // added during wrap-up: kept as part of the answer
    expect(a.phase).toBe('wrapup')

    turn("that's all")
    expect(a.phase).toBe('done')
    expect(a.transcript.at(-1)?.kind).toBe('closing')
    expect(a.transcript.at(-2)).toMatchObject({ role: 'trainee', kind: 'system' }) // "that's all" is not an answer
    expect(traineeAnswers(a)).toEqual([
      'I think this is angle closure, I would give acetazolamide',
      'I would check for kidney problems',
      'I would also stop the chlorphenamine',
    ])
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

  it('heard speech is shown for checking before the examiner acts', () => {
    expect(run('idle', { type: 'LISTEN' }, { type: 'CONFIRM' })).toBe('confirming')
    expect(run('confirming', { type: 'THINK' })).toBe('thinking') // sent
    expect(run('confirming', { type: 'LISTEN' })).toBe('listening') // say again
    expect(run('confirming', { type: 'CANCEL' })).toBe('idle')
  })

  it('cannot jump to checking unless the mic was listening', () => {
    expect(run('idle', { type: 'CONFIRM' })).toBe('idle')
    expect(run('speaking', { type: 'CONFIRM' })).toBe('speaking')
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
