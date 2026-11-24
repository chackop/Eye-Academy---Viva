// Data layer: the only place that talks to Firestore about attempts.
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import { newAttempt } from './viva'
import { attemptSchema, parseAttempt } from './schema'
import type { Attempt } from './types'

export class AttemptNotFoundError extends Error { constructor() { super('Attempt not found.') } }
export class AttemptAccessError extends Error { constructor() { super('You do not have access to this attempt (attempts are private to their owner).') } }

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) // Firestore rejects `undefined`

export async function createAttempt(uid: string): Promise<string> {
  const ref = await addDoc(collection(db, 'attempts'), clean(newAttempt(uid)))
  return ref.id
}

export async function loadAttempt(id: string): Promise<Attempt> {
  try {
    const s = await getDoc(doc(db, 'attempts', id))
    if (!s.exists()) throw new AttemptNotFoundError()
    return parseAttempt(s.data())
  } catch (e) {
    if (e instanceof AttemptNotFoundError) throw e
    if ((e as { code?: string }).code === 'permission-denied') throw new AttemptAccessError()
    throw e
  }
}

export async function saveAttempt(id: string, a: Attempt): Promise<void> {
  const { transcript, revealed, phase, revision } = attemptSchema.parse(clean(a)) // never write something we could not read back
  await updateDoc(doc(db, 'attempts', id), { transcript, revealed, phase, revision })
}

/** Rules only allow reading your own attempts, and the query says so explicitly. */
export async function listAttempts(uid: string): Promise<(Attempt & { id: string })[]> {
  const s = await getDocs(query(collection(db, 'attempts'), where('uid', '==', uid)))
  const out: (Attempt & { id: string })[] = []
  for (const d of s.docs) {
    try { out.push({ id: d.id, ...parseAttempt(d.data()) }) }
    catch (e) { console.warn(`Skipping unreadable attempt ${d.id}:`, (e as Error).message) } // one bad document must not hide the rest
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}
