import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useUser } from '../lib/useUser'
import { CONFIG } from '../lib/config'
import { displayValue, EYE_LABEL, CASE } from '../lib/findings'
import { listen, speak, speechInputSupported, stopSpeaking } from '../lib/speech'
import { consumeJustCreated } from '../lib/session'
import { loadAttempt, saveAttempt } from '../lib/attempts'
import { CLARIFY_TEXT, CLOSING_TEXT, completeTurn, examinerBusy, findingsSpeech, planTurn, revealedLabels, traineeAnswers, uiReducer, type UiStatus } from '../lib/viva'
import { followUpFn, revisionFn } from '../server/examiner'
import type { Attempt } from '../lib/types'

export const Route = createFileRoute('/viva/$attemptId')({ ssr: false, component: Viva })

const STATUS_TEXT: Record<UiStatus, string> = {
  idle: 'Your turn: press the microphone (or type) to speak',
  listening: 'Listening… speak now',
  thinking: 'Examiner is thinking…',
  speaking: 'Examiner is speaking: please wait',
  done: 'Viva finished',
}

const MIC_ERRORS: Record<string, string> = {
  network: "This browser can't reach its speech-recognition service (common in Brave, Chromium, or behind a VPN/blocker). Try Chrome or Edge, or type instead.",
  'not-allowed': 'Microphone access was blocked. Allow it in the address bar, or type instead.',
  'service-not-allowed': 'Speech recognition is disabled in this browser. Try Chrome or Edge, or type instead.',
  'audio-capture': 'No microphone was found. You can type instead.',
}

/** This component only wires things together: pure logic is in lib/viva.ts, storage in lib/attempts.ts. */
function Viva() {
  const { attemptId } = Route.useParams()
  const user = useUser()
  const followUp = useServerFn(followUpFn)
  const revision = useServerFn(revisionFn)

  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [error, setError] = useState('')
  const [status, dispatch] = useReducer(uiReducer, 'idle' as UiStatus)
  const [interim, setInterim] = useState('')
  const [typed, setTyped] = useState('')
  const [autoListen, setAutoListen] = useState(true)
  const ref = useRef<Attempt | null>(null)
  const recRef = useRef<{ stop: () => void } | null>(null)
  const canSpeak = typeof window !== 'undefined' && speechInputSupported()

  /** Update the screen immediately, then save. A failed save is shown, not swallowed. */
  const persist = async (next: Attempt) => {
    ref.current = next
    setAttempt(next)
    try { await saveAttempt(attemptId, next) }
    catch { setError("Couldn't save your progress. Check your connection: your last turn may be missing after a refresh.") }
  }

  /** Speak and resolve with the latency (timer stop = first audio) and a promise for the end of speech. */
  const say = (text: string, t0: number) =>
    new Promise<{ latency: number | null; ended: Promise<void> }>(resolve => {
      let resolved = false
      let endResolve!: () => void
      const ended = new Promise<void>(r => (endResolve = r))
      const done = (latency: number | null) => { if (!resolved) { resolved = true; resolve({ latency, ended }) } }
      dispatch({ type: 'SPEAK' })
      speak(text, () => done(Math.round(performance.now() - t0)), endResolve)
      setTimeout(() => { done(null); endResolve() }, CONFIG.speech.fallbackPerCharMs * text.length + CONFIG.speech.fallbackBaseMs) // never hang if audio is blocked
    })

  const settle = () => dispatch({ type: 'SETTLE', done: ref.current?.phase === 'done' })

  const startListening = useCallback(() => {
    if (!canSpeak || ref.current?.phase === 'done') return
    stopSpeaking()
    setInterim('')
    dispatch({ type: 'LISTEN' })
    let got = false
    recRef.current = listen({
      onInterim: setInterim,
      onFinal: (t, at) => { got = true; recRef.current?.stop(); handle(t, at) },
      onEnd: () => { if (!got) dispatch({ type: 'MIC_ENDED' }) },
      onError: e => { if (e !== 'no-speech' && e !== 'aborted') setError(MIC_ERRORS[e] ?? `Microphone error (${e}). You can type instead.`) },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak])

  const afterExaminer = async (ended: Promise<void>) => {
    await ended
    settle()
    if (ref.current?.phase !== 'done' && autoListen && canSpeak) startListening()
  }

  const handle = async (text: string, t0: number) => {
    const a0 = ref.current!
    const plan = planTurn(a0.phase, text)
    if (!text.trim() || plan.action === 'ignore') return
    setInterim(''); setError(''); dispatch({ type: 'THINK' })
    try {
      let examinerText: string
      let serverMs: number | undefined
      if (plan.action === 'reveal') examinerText = findingsSpeech(plan.findings)
      else if (plan.action === 'ask_followup') {
        const r = await followUp({ data: { answer: text, revealedLabels: revealedLabels(a0.revealed) } })
        examinerText = r.text; serverMs = r.serverMs
      } else examinerText = plan.action === 'clarify' ? CLARIFY_TEXT : CLOSING_TEXT

      const { latency, ended } = await say(examinerText, t0)
      const next = completeTurn(ref.current!, plan, text, examinerText, Date.now(), { latencyMs: latency ?? undefined, serverMs })
      await persist(next)
      if (next.phase === 'done') { await ended; await finish() } else afterExaminer(ended)
    } catch (e) {
      setError('Something went wrong with that turn: ' + (e as Error).message)
      settle()
    }
  }

  const finish = async () => {
    const a = ref.current!
    dispatch({ type: 'THINK' })
    try { await persist({ ...a, phase: 'done', revision: await revision({ data: { answers: traineeAnswers(a) } }) }) }
    catch (e) { setError('Could not generate a revision point: ' + (e as Error).message); await persist({ ...a, phase: 'done' }) }
    dispatch({ type: 'FINISH' })
  }

  const endNow = async () => {
    stopSpeaking(); recRef.current?.stop()
    await persist({ ...ref.current!, phase: 'done' })
    await finish()
  }

  useEffect(() => {
    if (!user) return
    loadAttempt(attemptId).then(a => {
      ref.current = a; setAttempt(a)
      if (a.phase === 'done') dispatch({ type: 'FINISH' })
      else if (consumeJustCreated(attemptId) && a.transcript.length === 1) say(a.transcript[0].text, performance.now()).then(r => afterExaminer(r.ended))
    }).catch(e => setError((e as Error).message))
    return () => { stopSpeaking(); recRef.current?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attemptId])

  if (user === undefined) return <div className="wrap">Loading…</div>
  if (!user) return <div className="wrap"><Link to="/">Sign in</Link> to view this attempt.</div>
  if (error && !attempt) return <div className="wrap"><p className="err">{error}</p><Link to="/">Back</Link></div>
  if (!attempt) return <div className="wrap">Loading…</div>

  const last = [...attempt.transcript].reverse().find(e => e.latencyMs != null)
  const busy = examinerBusy(status)

  return (
    <>
      <div className="top"><Link className="brand" to="/">← eyeacademy · Voice viva</Link><span className="mute tiny">{CASE.case_id} · fictional case</span></div>
      <div className="wrap">
        <div className={`status ${status}`} role="status" aria-live="polite"><span className="dot" />{STATUS_TEXT[status]}</div>
        {interim && <p className="mute"><em>“{interim}”</em></p>}
        {error && <p className="err">{error}</p>}
        <div className="grid" style={{ marginTop: 12 }}>
          <div>
            <div className="card">
              <h3>Transcript</h3>
              {attempt.transcript.map((e, i) => (
                <div key={i} className={`msg ${e.role}`}>
                  <small>{e.role === 'examiner' ? 'Examiner' : 'You'}{e.latencyMs != null && ` · ${e.latencyMs} ms to first audio`}</small>
                  {e.text}
                  {e.role === 'examiner' && canSpeak && <button className="ghost tiny" style={{ marginLeft: 8, padding: '2px 8px' }} disabled={busy} onClick={() => { stopSpeaking(); say(e.text, performance.now()).then(r => r.ended.then(settle)) }}>🔊</button>}
                </div>
              ))}
              {attempt.phase !== 'done' && (
                <>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="mic" disabled={busy || !canSpeak} onClick={() => status === 'listening' ? (recRef.current?.stop(), dispatch({ type: 'MIC_ENDED' })) : startListening()}>{status === 'listening' ? '■ Stop' : '🎤 Speak'}</button>
                    <form style={{ flex: 1, display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); const t = typed; setTyped(''); handle(t, performance.now()) }}>
                      <input value={typed} disabled={busy} onChange={e => setTyped(e.target.value)} placeholder={canSpeak ? 'or type, e.g. "what is the pressure in the right eye?"' : 'Speech input not supported in this browser: type here'} />
                      <button disabled={busy || !typed.trim()}>Send</button>
                    </form>
                  </div>
                  <p className="tiny mute">
                    <label><input type="checkbox" style={{ width: 'auto' }} checked={autoListen} onChange={e => setAutoListen(e.target.checked)} /> Start listening automatically after the examiner finishes</label>
                    {' · '}<button className="ghost tiny" style={{ padding: '2px 8px' }} disabled={busy} onClick={endNow}>End viva &amp; get revision point</button>
                  </p>
                </>
              )}
              {last && <p className="tiny mute">Last turn: {last.latencyMs} ms from end of your speech (or Send) to first examiner audio{last.serverMs != null && ` (server/LLM ${last.serverMs} ms)`}.</p>}
            </div>
          </div>
          <div>
            <div className="card">
              <h3>Revealed findings</h3>
              {attempt.revealed.length === 0 && <p className="mute">Ask for findings, e.g. “visual acuity in each eye”.</p>}
              {attempt.revealed.map(f => (
                <div key={f.id} className={`finding ${f.available ? '' : 'na'}`}>
                  <span className="eye">{f.eye ? EYE_LABEL[f.eye] : 'General'}</span>{f.label}
                  <div className="val">{displayValue(f)}</div>
                  {f.available && f.method && <div className="tiny mute">{f.method}</div>}
                </div>
              ))}
            </div>
            {attempt.phase === 'done' && (
              <div className="card">
                <h3>Revision point</h3>
                {!attempt.revision ? (status === 'thinking' ? <p className="mute">Preparing…</p> : <p className="mute">No revision point yet. <button className="ghost tiny" style={{ padding: '2px 8px' }} onClick={finish}>Try again</button></p>) : attempt.revision.supported ? (
                  <>
                    <p>{attempt.revision.point}</p>
                    <p className="quote">“{attempt.revision.excerpt}”</p>
                    <p className="tiny mute">Reference note, <strong>page {attempt.revision.page}</strong> · passage {attempt.revision.passageId} · {attempt.revision.source === 'llm' ? 'generated from retrieved passages' : 'extracted (no LLM key configured)'}</p>
                  </>
                ) : <p>{attempt.revision.message}</p>}
                {attempt.revision && <p className="tiny mute">Retrieved: {attempt.revision.retrieved.map(r => `p${r.page} (${r.id}, ${r.score})`).join(', ') || 'nothing'}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
