import { CONFIG } from './config'

// Thin wrapper over the browser's Web Speech API (Chrome/Edge/Safari for recognition; all browsers for synthesis).
export const speechInputSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

export function listen(cb: { onInterim: (t: string) => void; onFinal: (t: string, endedAt: number) => void; onEnd: () => void; onError: (e: string) => void }) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const rec = new SR()
  rec.lang = CONFIG.speech.lang
  rec.interimResults = true
  rec.continuous = false
  let finalText = ''
  rec.onresult = (ev: any) => {
    let interim = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]
      if (r.isFinal) {
        finalText += r[0].transcript
        // Timer starts here: the recogniser has decided the trainee has finished speaking.
        cb.onFinal(finalText.trim(), performance.now())
      } else interim += r[0].transcript
    }
    if (interim) cb.onInterim(interim)
  }
  rec.onerror = (e: any) => cb.onError(e.error)
  rec.onend = () => cb.onEnd()
  rec.start()
  return { stop: () => rec.abort() }
}

let voice: SpeechSynthesisVoice | undefined
function pickVoice() {
  const vs = window.speechSynthesis.getVoices()
  voice = vs.find(v => v.lang === CONFIG.speech.lang) ?? vs.find(v => v.lang.startsWith('en'))
}

/** Speak `text`. `onStart` fires when audio actually begins (timer stop); `onEnd` when finished. */
export function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  const synth = window.speechSynthesis
  synth.cancel()
  if (!voice) pickVoice()
  const u = new SpeechSynthesisUtterance(text)
  if (voice) u.voice = voice
  u.lang = CONFIG.speech.lang
  u.rate = CONFIG.speech.rate
  u.onstart = () => onStart?.()
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  synth.speak(u)
}

export const stopSpeaking = () => typeof window !== 'undefined' && window.speechSynthesis.cancel()
