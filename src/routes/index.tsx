import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { createAttempt, listAttempts } from '../lib/attempts'
import { useUser } from '../lib/useUser'
import { CASE } from '../lib/findings'
import type { Attempt } from '../lib/types'
import { markJustCreated } from '../lib/session'

export const Route = createFileRoute('/')({ ssr: false, component: Home })

function Home() {
  const user = useUser()
  if (user === undefined) return <div className="wrap">Loading…</div>
  return (
    <>
      <div className="top"><span className="brand">eyeacademy · Voice viva</span>{user && <span>{user.email} <button className="ghost" onClick={() => signOut(auth)}>Sign out</button></span>}</div>
      <div className="wrap">{user ? <Attempts uid={user.uid} /> : <SignIn />}</div>
    </>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const go = async (create: boolean) => {
    setErr('')
    try { await (create ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, email, password) }
    catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>Sign in to start a viva</h2>
      <p className="mute tiny">Fictional case. Not clinical guidance.</p>
      <p><input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></p>
      <p><input placeholder="Password (6+ characters)" type="password" value={password} onChange={e => setPassword(e.target.value)} /></p>
      <div className="row"><button onClick={() => go(false)}>Sign in</button><button className="ghost" onClick={() => go(true)}>Create account</button></div>
      {err && <p className="err tiny">{err}</p>}
    </div>
  )
}

function Attempts({ uid }: { uid: string }) {
  const nav = useNavigate()
  const [list, setList] = useState<(Attempt & { id: string })[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { listAttempts(uid).then(setList).catch(e => { setList([]); setErr((e as Error).message) }) }, [uid])
  const start = async () => {
    try {
      const id = await createAttempt(uid)
      markJustCreated(id)
      nav({ to: '/viva/$attemptId', params: { attemptId: id } })
    } catch (e) { setErr("Couldn't start a viva: " + (e as Error).message) }
  }
  return (
    <>
      <div className="card"><h2>{CASE.title}</h2><p className="mute">{CASE.disclaimer}</p><button onClick={start}>Start new viva</button>{err && <p className="err tiny">{err}</p>}</div>
      <h3>Your attempts</h3>
      {list === null ? <p>Loading…</p> : list.length === 0 ? <p className="mute">No attempts yet.</p> : list.map(a => (
        <div className="card" key={a.id}>
          <Link to="/viva/$attemptId" params={{ attemptId: a.id }}>{new Date(a.createdAt).toLocaleString()}</Link>
          <span className="mute"> · {a.phase === 'done' ? 'finished' : 'in progress'} · {a.revealed.length} findings revealed</span>
        </div>
      ))}
    </>
  )
}
