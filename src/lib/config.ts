/** Every tunable number in one place. Env overrides (model, API key) are applied server-side in src/server. */
export const CONFIG = {
  retrieval: {
    /** Minimum BM25 score and distinct matched terms before we claim the note supports anything. */
    minScore: 6,
    minMatchedTerms: 3,
    /** Passages sent to the model / shown as "retrieved". */
    passages: 4,
    /** Passages searched for the gap the trainee left out. */
    gapPassages: 2,
  },
  llm: {
    model: 'claude-haiku-5-5',
    timeoutMs: 20_000,
    followUpMaxTokens: 120,
    revisionMaxTokens: 500,
  },
  matching: {
    /** A finding-sounding utterance this short counts as a request even without a request word. */
    shortRequestMaxWords: 6,
    /** With no answer wording or clinical terms, a statement this long (and not a question) still counts as an answer. */
    longAnswerMinWords: 12,
  },
  speech: {
    lang: 'en-GB',
    rate: 1.0,
    /** After speech is recognised, show the text for this long (editable) before acting on it. 0 = act immediately. */
    confirmMs: 2500,
    /** If the browser never reports speech finished/started, give up after base + perChar * length. */
    fallbackBaseMs: 4000,
    fallbackPerCharMs: 120,
  },
  rateLimit: {
    /** Per signed-in user, across all model-backed server functions. */
    windowMs: 60_000,
    maxCalls: 20,
  },
  limits: {
    maxAnswerChars: 2000,
    maxAnswers: 20,
    maxLabels: 50,
  },
  schemaVersion: 1,
} as const
