# TASK-15: Wire the web app into the Worker entry and Cloudflare config (integration)

- id: TASK-15
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: blocked
- rework count: 0
- depends on: TASK-14, TASK-10, TASK-9, and the owner committing the real deployed `sheet-rag/src/index.ts` (and recovered `src/rag/`) to the repo
- size: fits a 100k-token context (few files, one behaviour)

## Why blocked
The `src/index.ts` in the repo is an old prototype; the deployed Worker has different code. Editing the prototype would overwrite production on the next deploy (technical design section 3.4 note). Do NOT dispatch this task until the owner has committed the real source (decision.md 2026-11-18, last row) and the coordinator has set the status back to `todo`. All other STORY-16 tasks (TASK-6 to TASK-14) are new files only and do not wait for it. The pm/coordinator should escalate this blocker to the user once TASK-14 is `done`.

## What it does (to be refined by lead against the real source before dispatch)
- In the real `src/index.ts`, build `createApp({ getSettings: () => getSettings(env.DB), limiters: { ... bound from env }, mount })` per request/isolate, where `mount` registers the existing `/search` and `/chat` handlers unchanged, and make the default export's `fetch` call it (keeping `scheduled` and `queue` untouched).
- `wrangler.jsonc`: add the D1 binding `DB`, the assets binding for `public/` (`lang.js`, `app.css`), and Workers Rate Limiting bindings for the four groups (names for example `RL_SEARCH`, `RL_CHAT`, `RL_SUGGEST`, `RL_DATA`; the owner may need to confirm the current binding syntax). Real database id and deploy are done by the owner on their own machine.
- Update the `Env` type with the new bindings.

## Acceptance criteria
1. AC10 / AC13: `/search` and `/chat` through the real entry return 429 over the rate and 400 over the input cap, with the AI binding stub never called (test through `worker.fetch` with a fake `Env`).
2. AC9 / AC12: A response from the real entry carries noindex and the five security headers.
3. Existing `/search` and `/chat` behaviour for valid input is unchanged (existing tests still pass).
4. `npx wrangler deploy --dry-run` succeeds (run by the owner or in CI if credentials-free dry run works).

## Unit tests to write
- [ ] `test/index.web.spec.ts` > `search and chat are guarded through the real entry`: covers AC1
- [ ] `test/index.web.spec.ts` > `entry responses carry noindex and security headers`: covers AC2
- [ ] Existing tests re-run: covers AC3

## Files this task may touch
(provisional, lead confirms after the real source lands)
- `sheet-rag/src/index.ts`
- `sheet-rag/src/env.ts` (new, if the real source has no Env module)
- `sheet-rag/wrangler.jsonc`
- `sheet-rag/test/index.web.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
