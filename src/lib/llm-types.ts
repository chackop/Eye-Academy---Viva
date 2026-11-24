/** A text-completion function. The real one calls Claude; tests pass a fake. Returns null if unavailable. */
export type Complete = (system: string, user: string, maxTokens?: number) => Promise<string | null>
