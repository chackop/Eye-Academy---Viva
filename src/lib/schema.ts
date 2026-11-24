// Validation at the storage boundary: nothing read from or written to Firestore is trusted until it passes this.
import { z } from 'zod'
import { CONFIG } from './config'
import type { Attempt } from './types'

const finding = z.object({
  id: z.string(),
  eye: z.enum(['right', 'left', 'both']).nullable(),
  label: z.string(),
  value: z.union([z.string(), z.number()]).nullable(),
  unit: z.string().nullable(),
  method: z.string().nullable(),
  available: z.boolean(),
  unavailable_reason: z.string().optional(),
  revealedAt: z.number(),
})

const entry = z.object({
  role: z.enum(['trainee', 'examiner']),
  text: z.string(),
  kind: z.enum(['opening', 'finding', 'answer', 'followup', 'closing', 'clarify', 'system']),
  ts: z.number(),
  latencyMs: z.number().optional(),
  serverMs: z.number().optional(),
})

const retrieved = z.array(z.object({ id: z.string(), page: z.number(), score: z.number() }))

const revision = z.discriminatedUnion('supported', [
  z.object({ supported: z.literal(true), point: z.string(), page: z.number(), excerpt: z.string(), passageId: z.string(), source: z.enum(['llm', 'extractive']), retrieved }),
  z.object({ supported: z.literal(false), message: z.string(), retrieved }),
])

export const attemptSchema = z.object({
  schemaVersion: z.literal(CONFIG.schemaVersion),
  uid: z.string().min(1),
  caseId: z.string(),
  createdAt: z.number(),
  phase: z.enum(['examining', 'followup', 'done']),
  transcript: z.array(entry),
  revealed: z.array(finding),
  revision: revision.nullable(),
})

export class AttemptCorruptError extends Error {
  constructor(detail: string) { super(`This attempt's saved data is not in a form this version of the app can read (${detail}).`) }
}

/** Upgrade older stored shapes to the current one. Add a step here each time the schema changes. */
export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const doc = { ...(raw as Record<string, unknown>) }
  if (doc.schemaVersion === undefined) doc.schemaVersion = 1 // attempts saved before versioning were already v1-shaped
  if (typeof doc.schemaVersion === 'number' && doc.schemaVersion > CONFIG.schemaVersion) {
    throw new AttemptCorruptError(`saved by a newer version, v${doc.schemaVersion}`)
  }
  return doc
}

export function parseAttempt(raw: unknown): Attempt {
  const r = attemptSchema.safeParse(migrate(raw))
  if (!r.success) {
    const i = r.error.issues[0]
    throw new AttemptCorruptError(`${i.path.join('.') || 'document'}: ${i.message}`)
  }
  return r.data
}
