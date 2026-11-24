// Pure viva logic: no React, no Firebase, no speech. Everything here is unit-tested.
import { CASE, classifyUtterance, spokenText, type Finding } from './findings'
import { CONFIG } from './config'
import type { Attempt, Entry } from './types'

export type Phase = Attempt['phase']

/* ---------- 1. Attempt phases: the only place transitions are defined ---------- */

export type TurnPlan =
  | { action: 'reveal'; findings: Finding[]; next: Phase }
  | { action: 'ask_followup'; next: Phase }
  | { action: 'close'; next: Phase }
  | { action: 'clarify'; next: Phase }
  | { action: 'ignore'; next: Phase }

type Action = TurnPlan['action']
/** phase -> what the trainee's utterance kind does -> [what the app does, next phase] */
export const PHASE_TABLE: Record<Phase, Record<'findings' | 'answer' | 'unclear', [Action, Phase]>> = {
  // An unclear request never uses up the trainee's answer; a finding request during the follow-up is still answered.
  examining: { findings: ['reveal', 'examining'], answer: ['ask_followup', 'followup'], unclear: ['clarify', 'examining'] },
  followup: { findings: ['reveal', 'followup'], answer: ['close', 'done'], unclear: ['clarify', 'followup'] },
  done: { findings: ['ignore', 'done'], answer: ['ignore', 'done'], unclear: ['ignore', 'done'] },
}

/** Decide what to do with an utterance. Pure: no side effects, no server calls. */
export function planTurn(phase: Phase, text: string): TurnPlan {
  const intent = classifyUtterance(text)
  const [action, next] = PHASE_TABLE[phase][intent.kind]
  if (action === 'reveal' && intent.kind === 'findings') return { action, findings: intent.findings, next }
  return { action: action as Exclude<Action, 'reveal'>, next }
}

export const CLOSING_TEXT = "Thank you, that's the end of the viva. Let me find a revision point from the reference note."

export const CLARIFY_TEXT = "Sorry, I didn't catch which finding you meant. Ask for one, such as visual acuity, pressure or pupils, or give me your diagnosis and management."

export const findingsSpeech = (findings: Finding[]) => findings.map(spokenText).join(' ')
export const revealedLabels = (revealed: Attempt['revealed']) => revealed.map(f => `${f.eye ?? ''} ${f.label}`.trim())

export function newAttempt(uid: string, now = Date.now()): Attempt {
  return {
    schemaVersion: CONFIG.schemaVersion, uid, caseId: CASE.case_id, createdAt: now, phase: 'examining', revealed: [], revision: null,
    transcript: [{ role: 'examiner', kind: 'opening', text: CASE.opening_prompt, ts: now }],
  }
}

/** Apply a finished turn to the attempt. Returns a new attempt; never mutates. */
export function completeTurn(
  a: Attempt, plan: TurnPlan, traineeText: string, examinerText: string, now: number,
  meta: { latencyMs?: number; serverMs?: number } = {},
): Attempt {
  if (plan.action === 'ignore') return a
  const trainee: Entry = { role: 'trainee', kind: plan.action === 'reveal' ? 'finding' : plan.action === 'clarify' ? 'clarify' : 'answer', text: traineeText, ts: now }
  const kind = { reveal: 'finding', ask_followup: 'followup', close: 'closing', clarify: 'clarify' }[plan.action] as Entry['kind']
  const examiner: Entry = { role: 'examiner', kind, text: examinerText, ts: now }
  if (meta.latencyMs != null) examiner.latencyMs = meta.latencyMs
  if (meta.serverMs != null) examiner.serverMs = meta.serverMs
  const fresh = plan.action === 'reveal'
    ? plan.findings.filter(f => !a.revealed.some(r => r.id === f.id)).map(f => ({ ...f, revealedAt: now }))
    : []
  return { ...a, phase: plan.next, revealed: [...a.revealed, ...fresh], transcript: [...a.transcript, trainee, examiner] }
}

export const traineeAnswers = (a: Attempt) => a.transcript.filter(e => e.role === 'trainee' && e.kind === 'answer').map(e => e.text)

/* ---------- 2. On-screen status: who may speak right now ---------- */

export type UiStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done'
export type UiEvent =
  | { type: 'LISTEN' } | { type: 'THINK' } | { type: 'SPEAK' } | { type: 'MIC_ENDED' } | { type: 'FINISH' }
  | { type: 'SETTLE'; done: boolean } // examiner finished / nothing left to do

export const UI_TABLE: Record<UiStatus, Partial<Record<UiEvent['type'], UiStatus>>> = {
  idle: { LISTEN: 'listening', THINK: 'thinking', SPEAK: 'speaking', FINISH: 'done', SETTLE: 'idle' },
  listening: { THINK: 'thinking', SPEAK: 'speaking', MIC_ENDED: 'idle', FINISH: 'done' },
  thinking: { THINK: 'thinking', SPEAK: 'speaking', SETTLE: 'idle', FINISH: 'done' },
  speaking: { SPEAK: 'speaking', THINK: 'thinking', LISTEN: 'listening', SETTLE: 'idle', FINISH: 'done' },
  done: { SPEAK: 'speaking', FINISH: 'done', SETTLE: 'done' }, // replaying a line after the viva
}

/** Illegal transitions are ignored, so the UI can never reach a state the table does not allow. */
export function uiReducer(state: UiStatus, ev: UiEvent): UiStatus {
  const to = UI_TABLE[state][ev.type]
  if (!to) return state
  return ev.type === 'SETTLE' && ev.done ? 'done' : to
}

export const canTalk = (s: UiStatus) => s === 'idle' || s === 'listening'
export const examinerBusy = (s: UiStatus) => s === 'thinking' || s === 'speaking'
