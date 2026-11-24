import Anthropic from '@anthropic-ai/sdk'
import type { Complete } from '../lib/llm-types'
import { CONFIG } from '../lib/config'

/** The only file that talks to Claude. Returns null (so callers use their fallback) if there is no key or the call fails. */
export const complete: Complete = async (system, user, maxTokens = 400) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const client = new Anthropic({ apiKey, timeout: CONFIG.llm.timeoutMs })
    const r = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || CONFIG.llm.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    })
    return r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
  } catch (e) {
    console.error('LLM call failed, using fallback:', (e as Error).message)
    return null
  }
}
