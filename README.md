# Eye Academy voice viva (take-home)

TanStack Start + Firebase Auth/Firestore + browser Web Speech API. Fictional case EA-VIVA-001 (angle closure) and the Eye Academy glaucoma reference note. Not clinical guidance.

## Run locally

Needs Node 22 (Vite 8), Java (Firestore emulator) and the `firebase` CLI (`firebase-tools`). Use **Chrome or Edge** for speech input; other browsers fall back to typing.

```bash
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY for LLM follow-ups/revision (optional, see below)
npm run emulators             # terminal 1: Auth :9099, Firestore :8080 (demo project, no cloud account)
npm run dev                   # terminal 2: http://localhost:3000
npm test                      # Vitest: finding matching, retrieval, citation guard, rubric (90 tests)
```

Create an account on the sign-in page (emulator only, any email/password), press **Start new viva**, then press the mic or type.
To use a real Firebase project: set `VITE_USE_EMULATOR=false` and the `VITE_FIREBASE_*` values, then `firebase deploy --only firestore:rules`.

No `ANTHROPIC_API_KEY`? The app still works: the follow-up uses rule-based fallbacks and the revision point is extracted straight from the top retrieved passage (labelled "extracted"). With a key, `claude-haiku-5-5` writes the follow-up and revision point.

## Code layout

| Layer | Files | Notes |
|---|---|---|
| Pure viva logic | `src/lib/viva.ts` | `planTurn` + `PHASE_TABLE` (examining, followup, done), `completeTurn`, and `uiReducer` + `UI_TABLE` for who may speak. No React/Firebase/speech, fully unit-tested. |
| Findings / retrieval / rubric | `src/lib/findings.ts`, `retrieval.ts`, `rubric.ts` | Deterministic, offline. |
| Model-facing logic | `src/lib/followup.ts`, `revision.ts` | Take a `complete()` function, so tests use a fake model. `verifyModelReply` rejects invented passages/quotes. |
| Claude client | `src/server/llm.ts` | The only file that calls Claude. `src/server/examiner.ts` is just the server-function wrappers. |
| Data layer | `src/lib/attempts.ts` | The only file that talks to Firestore about attempts; typed not-found / access errors; save failures are shown to the user. |
| Config | `src/lib/config.ts` | Every threshold, timeout, token limit, rate limit and the schema version in one place. |
| Case rules | `data/case-rules.json`, `src/lib/case-rules.ts` | Topic keywords, answer/request cues, rubric and fallback follow-ups are data, validated with Zod at startup (bad regex or a topic matching no finding fails loudly). A new case needs a new rules file, not code changes. |
| Stored data | `src/lib/schema.ts` | Zod schema + `schemaVersion` + `migrate()`. Reads are validated (a corrupt attempt shows a clear error and is skipped in the list); writes are validated before they leave the app; `firestore.rules` also checks shape and version. |
| Server protection | `src/server/middleware.ts`, `auth.ts`, `src/lib/rate-limit.ts` | Model-backed server functions require a valid Firebase ID token (verified with the Admin SDK), are limited to 20 calls/minute per user, and inputs are size-limited. |
| UI | `src/routes/*` | Wiring only (speech, rendering, calling the layers above). |

**Security note:** the Claude key stays on the server. Without the auth middleware anyone could call the endpoints and spend your API credit; with it, a call needs a signed-in user's token and is rate-limited. The limiter is in memory (fine for one process; use a shared store if you run several). Writing the whole transcript on every turn is fine for a short viva but would need appending for long sessions.

## How it works

- **Findings never come from an LLM.** `src/lib/findings.ts` maps what the trainee says to finding ids in `data/case.json` (keywords + eye detection; no eye named = both eyes). Value, unit and eye are read from the JSON, shown verbatim on screen, and turned into a spoken string by a deterministic formatter. Unavailable findings say so and give the reason from the case.
- **Turn flow:** finding request(s) -> read back and shown. First non-finding answer -> one spoken follow-up that responds to it (`followUpFn`). Next answer -> closing line -> revision point. Status banner shows *Your turn / Listening / Examiner thinking / Examiner speaking*; the text box and mic are disabled while the examiner is responding.
- **Saved attempts:** `attempts/{id}` in Firestore holds transcript, revealed findings, phase and revision. `firestore.rules` allow read/write only where `resource.data.uid == request.auth.uid` (create requires own uid, uid is immutable). Verified by opening another user's attempt URL: access denied.
- **Revision point:** `data/note-pages.json` is produced once by `scripts/prep-note.mjs` (poppler `pdftotext -layout`, one page at a time). Each page is split into paragraph/bullet passages carrying the printed page number and section heading; a passage that continues from the previous page keeps a `context` lead-in so "check sulfonamide allergy" on p6 is still tied to acetazolamide on p5. Retrieval is BM25 over passages. The query is the trainee's answer plus the most important point from the examiner notes they missed. If the top passage scores under `MIN_SCORE` (6) or matches under 3 terms, the app says it found no support. When an LLM writes the point it must cite a retrieved passage id and give a quote; the server rejects it unless that quote really appears in the passage.

## Model choice and responsiveness

- **Voice:** browser SpeechRecognition (en-GB) for speech-to-text and SpeechSynthesis for text-to-speech, with Claude only for the follow-up/revision text. Why: zero extra cost or keys, no audio leaves the app code, trivial to build in four hours, and because finding values come from JSON the voice layer cannot corrupt them. **Alternative considered:** a realtime speech-to-speech API (e.g. OpenAI Realtime). Better turn-taking and voice, but it costs per minute, needs a token-minting backend, and makes it harder to guarantee exact values and units.
- **Timer:** starts when the recogniser emits its final result (it has decided the trainee stopped) or when Send is pressed; stops on the SpeechSynthesis `start` event (first audio). Shown per examiner message as "N ms to first audio", with server/LLM time in brackets for LLM turns. It excludes the recogniser's own end-of-speech silence wait.
- **Measured:** TODO, record from Chrome with a real microphone. (The in-app preview browser blocks the mic and its synth reports near-zero start times, so those numbers are meaningless.)

## Three repeatable checks

Automated parts: `npm test` (90 Vitest tests, all pass; the retrieval test prints the retrieved pages and cited passage with `npx vitest run --reporter=verbose`). End-to-end observed in the app (typed input, local emulator, no LLM key):

| # | Check | Input | Expected | Observed |
|---|-------|-------|----------|----------|
| 1 | Available finding | "What is the pressure in the right eye?" | Right eye, intraocular pressure, 58 mmHg; spoken "58 millimetres of mercury" | Card "Right eye / Intraocular pressure / 58 mmHg / Goldmann applanation, 23:55"; spoken text as expected. PASS |
| 1b | Both eyes | "Visual acuity in each eye" | Right 6/36 Snellen, left 6/9 Snellen | Both cards correct. PASS |
| 2 | Unavailable finding | "Can I see gonioscopy in the right eye?" | Says it is not available with the reason, no invented value | "Right eye gonioscopy is not available. No view: corneal oedema." Grey card. PASS |
| 3 | Citation supports revision point | Answer: timolol, apraclonidine, acetazolamide, laser iridotomy (no allergy check) | Point about sulfonamide allergy cited to page 6 | Retrieved p6 (p6-c1, 17.6), p5 (p5-c13, 17.1), p9 (p9-c7, 10.3), p2 (p2-c10, 9.6). Cited p6-c1: "250 mg four times a day. Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it." Matches the PDF text on page 6. PASS |
| 3b | No support | Off-topic query (pasta) | "Couldn't find support" | Top score 5.4 < 6, so unsupported. PASS (narrow margin, see below) |

## Handover

- **Where I stopped / not verified:** real microphone turn and latency measurement; the Claude-generated follow-up and revision point (only the fallback paths were run: no API key was set). Not deployed to a real Firebase project. No automated browser tests.
- **Bug found while testing:** answering the follow-up with "check for a kidney problem and potassium" was treated as a request for U&E results. Fixed (replies to the follow-up are always answers; "check" and "potassium" removed from the triggers) and covered by a test. Moving the checks to Vitest then caught a second one: "blood pressure" also returned both eyes' IOP; the pressure topic now ignores "blood pressure".
- **Known weaknesses:** terse answers (e.g. "I would give timolol", 1 matched term) score below the support threshold and get "no support", which may be too strict. The extractive fallback can quote table rows with flattened columns (the PDF tables are read line by line). If the backend is unreachable, starting a viva can hang silently (Firestore queues the write offline); an emulator restart also leaves a stale sign-in until you sign out. Also: keyword matching will miss unusual phrasings (the typed/spoken fallback is the same matcher). The "no support" threshold margin is small (5.4 vs 6): needs a labelled set of off-topic queries to tune. Extractive revision points are blunt. Chunking merges consecutive bullets in a couple of places (e.g. p6 "If the IOP does not fall").
- **AI tooling example:** Claude Code wrote the PDF-to-passages script. Verification: printed every extracted page, compared against the PDF, found p6's first passage began mid-sentence ("250 mg four times a day…", the end of the acetazolamide line from p5), added the continuation `context` field, and re-ran to confirm it now carries "Systemic carbonic anhydrase inhibitor. Acetazolamide 500 mg…".
- **Next improvement I would prioritise:** a small labelled evaluation set (answer -> expected page) to tune the support threshold, because wrongly claiming support is the worst failure for a revision tool.
