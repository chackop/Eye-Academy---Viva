// The single source of truth for the shape of our data. TypeScript types are derived from these schemas
// (types.ts re-exports them), so a type and its validation can never drift apart.
// Validation happens at the boundaries: reading the case file, and reading/writing Firestore.
import { z } from 'zod'
import { CONFIG } from './config'

/** One examination finding, exactly as it appears in the case file. */
export const findingSchema = z.object({
  id: z.string().min(1),
  eye: z.enum(['right', 'left', 'both']).nullable(),
  label: z.string(),
  value: z.union([z.string(), z.number()]).nullable(),
  unit: z.string().nullable(),
  method: z.string().nullable(),
  available: z.boolean(),
  unavailable_reason: z.string().optional(),
})

const revealedFindingSchema = findingSchema.extend({ revealedAt: z.number() })

const entrySchema = z.object({
  role: z.enum(['trainee', 'examiner']),
  text: z.string(),
  kind: z.enum(['opening', 'finding', 'answer', 'followup', 'wrapup', 'closing', 'clarify', 'system']),
  ts: z.number(),
  /** from when the text was sent to the first examiner audio, ms */
  latencyMs: z.number().optional(),
  /** time spent waiting for the server (LLM) inside that turn, ms */
  serverMs: z.number().optional(),
})

const retrievedSchema = z.array(z.object({ id: z.string(), page: z.number(), score: z.number() }))

const revisionSchema = z.discriminatedUnion('supported', [
  z.object({ supported: z.literal(true), point: z.string(), page: z.number(), excerpt: z.string(), passageId: z.string(), source: z.enum(['llm', 'extractive']), retrieved: retrievedSchema }),
  z.object({ supported: z.literal(false), message: z.string(), retrieved: retrievedSchema }),
])

export const attemptSchema = z.object({
  schemaVersion: z.literal(CONFIG.schemaVersion),
  uid: z.string().min(1),
  caseId: z.string(),
  createdAt: z.number(),
  phase: z.enum(['examining', 'followup', 'wrapup', 'done']),
  transcript: z.array(entrySchema),
  revealed: z.array(revealedFindingSchema),
  revision: revisionSchema.nullable(),
})

export type Finding = z.infer<typeof findingSchema>
export type Entry = z.infer<typeof entrySchema>
export type Revision = z.infer<typeof revisionSchema>
export type Attempt = z.infer<typeof attemptSchema>

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
