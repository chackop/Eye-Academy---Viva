import type { Finding } from './findings'

export type Entry = {
  role: 'trainee' | 'examiner'
  text: string
  kind: 'opening' | 'finding' | 'answer' | 'followup' | 'closing' | 'clarify' | 'system'
  ts: number
  /** end of trainee speech (or typed submit) -> first examiner audio, ms */
  latencyMs?: number
  /** time spent waiting for the server (LLM) inside that turn, ms */
  serverMs?: number
}

export type Revision =
  | { supported: true; point: string; page: number; excerpt: string; passageId: string; source: 'llm' | 'extractive'; retrieved: { id: string; page: number; score: number }[] }
  | { supported: false; message: string; retrieved: { id: string; page: number; score: number }[] }

export type Attempt = {
  schemaVersion: number
  uid: string
  caseId: string
  createdAt: number
  phase: 'examining' | 'followup' | 'done'
  transcript: Entry[]
  revealed: (Finding & { revealedAt: number })[]
  revision: Revision | null
}
