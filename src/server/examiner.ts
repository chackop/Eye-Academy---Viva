import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { CONFIG } from '../lib/config'
import { buildFollowUp } from '../lib/followup'
import { buildRevision } from '../lib/revision'
import { complete } from './llm'
import { authMiddleware } from './middleware'

const followUpInput = z.object({
  answer: z.string().min(1).max(CONFIG.limits.maxAnswerChars),
  revealedLabels: z.array(z.string().max(100)).max(CONFIG.limits.maxLabels),
})
const revisionInput = z.object({ answers: z.array(z.string().max(CONFIG.limits.maxAnswerChars)).max(CONFIG.limits.maxAnswers) })

// Thin transport layer. Every call must be from a signed-in user within their rate limit (authMiddleware),
// and inputs are size-limited so a caller cannot stuff the prompt. The logic is in lib/followup.ts and lib/revision.ts.
export const followUpFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: z.input<typeof followUpInput>) => followUpInput.parse(d))
  .handler(({ data }) => buildFollowUp(complete, data))

export const revisionFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((d: z.input<typeof revisionInput>) => revisionInput.parse(d))
  .handler(({ data }) => buildRevision(complete, data.answers))
