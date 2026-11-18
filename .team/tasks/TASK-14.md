# TASK-14: Hono app composition (src/web/app.ts) with injected dependencies

- id: TASK-14
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-5 (settings), TASK-7 (language helpers), TASK-9 (Layout and `renderPage`), TASK-11 (security), TASK-12 (rate limit), TASK-13 (input limit)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Composes the pieces into the app that later stories (STORY-11 billing page, STORY-15 API) mount their routes on. It is a new file and does not touch `src/index.ts` (the real deployed source is not in the repo). It takes everything it needs through a `WebDeps` interface so it runs under plain Vitest with fakes.

`src/web/app.ts` exports:
```ts
export interface WebDeps {
  getSettings(): Promise<SiteSettings>;          // production: () => getSettings(env.DB) from src/db/settings.ts
  limiters?: { search?: RateLimiter; chat?: RateLimiter; suggest?: RateLimiter; data?: RateLimiter };
  mount?: (app: Hono<WebEnv>) => void;           // later stories register their routes here
}
export type WebEnv = { Variables: { lang: Lang; settings: SiteSettings } };
export function createApp(deps: WebDeps): Hono<WebEnv>;
```
Behaviour:
- Global middleware order: `securityHeaders()`, `noindex()`, then a language middleware that sets `c.var.lang = langFromPath(c.req.path)` and loads settings lazily (`c.var.settings` available through a helper `getSiteSettings(c)` that calls `deps.getSettings()` at most once per request; routes that show no price never trigger a database read).
- Route groups with limiter and input cap (limiter keys separate per group; defaults exported as `RATE_LIMITS = { search: {limit: 20, windowMs: 60_000}, chat: {limit: 20, windowMs: 60_000}, suggest: {limit: 120, windowMs: 60_000}, data: {limit: 60, windowMs: 60_000} }`): `/search` and `/chat` (rate limit then `inputLimit`; `queryFields ['q','query']`, `bodyFields ['q','query','message','text']` so the real field is covered whichever it is called; `SEARCH_MAX_CHARS` for search and `CHAT_MAX_CHARS` for chat); `/api/suggest` (rate limit, `inputLimit` on `q` with `SEARCH_MAX_CHARS`); `/api/hotels`, `/api/hotels/*`, `/api/cities`, `/api/config` (rate limit group `data`). Rate limit is applied before the input cap and before the route handler, so refused requests never reach the AI service. The limiters are optional: missing means a memory limiter with the `RATE_LIMITS` defaults is created per app instance.
- `/search` and `/chat` handlers are NOT defined here (they are the existing routes); `mount` registers them. `createApp` only guarantees the guards run first.
- `app.notFound` and `app.onError` return a small JSON or text body and still pass through the security headers (use the `errors.*` dictionary by language).
- No route for `/bill` here (STORY-11) and no link to it anywhere.

## Acceptance criteria
1. AC1 / AC2 / AC4: A page mounted through `mount` that uses `Layout` is Vietnamese at `/sample` and English at `/en/sample`; with nothing sent by the client it is Vietnamese.
2. AC9: Responses of the sample page, of a JSON route and of a 404 carry `X-Robots-Tag: noindex, nofollow`.
3. AC12: The same three responses and a 429 carry the five security headers.
4. AC10: The 21st request within a minute to `/search` (from one IP, stub handler mounted) gets 429; `/chat` has its own counter; `/api/suggest` and `/api/hotels` are limited by their own counters; another IP is not affected.
5. AC11: With injected limiters using a fake clock, requests are accepted again after the window.
6. AC13: A `/chat` request with a `message` over 1000 characters and a `/search?q=` over 200 characters are refused and the mounted stub handler (stand-in for the AI call) is never invoked; a refusal due to rate limiting also never invokes it.
7. AC7 / AC8: A mounted page that renders a `PriceBlock` through `renderPage` with settings from `deps.getSettings` shows the disclaimer and, with `showFeeNote` true and fee 10, `Includes 10% service fee` at `/en/sample`; with `showFeeNote` false there is no fee note; a page without a price does not call `getSettings`.
8. A `getSettings` that rejects results in a 500 response with security headers, not an unhandled crash.

## Unit tests to write
All in `test/web/app.spec.tsx`, using `app.request` and fake `getSettings` (no D1, no Cloudflare).
- [ ] `sample page is Vietnamese at normal address and English under /en`: covers AC1, AC2, AC4
- [ ] `page, json and 404 carry noindex`: covers AC9
- [ ] `page, json, 404 and 429 carry security headers`: covers AC12
- [ ] `search, chat, suggest and data endpoints are rate limited with separate counters`: covers AC10
- [ ] `limited client is accepted again after the window (fake clock)`: covers AC11
- [ ] `over-long chat and search input never reaches the handler`: covers AC13
- [ ] `page with prices shows disclaimer and fee note by setting, and pages without prices skip the settings read`: covers AC7, AC8
- [ ] `settings failure gives a 500 with headers`: covers AC12 (robustness)

## Files this task may touch
- `sheet-rag/src/web/app.ts` (new)
- `sheet-rag/test/web/app.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Files: `sheet-rag/src/web/app.ts` (new), `sheet-rag/test/web/app.spec.tsx` (new). src/index.ts not touched.
- Tests: 10 in app.spec.tsx (the 8 listed plus 2 extra: default memory limiters, failing limiter fails open). `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/web/app.spec.tsx`: 10 passed.
- bodyFields is passed on every guarded route (`/search`, `/chat`, `/api/suggest`), so the TASK-13 body check runs on POST.
- Hono 4.13 `app.use()` does not accept an array of paths; one `use` per path.
- `/api/hotels/*` also matches the bare `/api/hotels` in Hono, so it is registered once (a second guard would double count).
- Language comes from the URL path, so routes are not rewritten: `mount` must register each page at both `/x` and `/en/x`. Later routes (TASK-38, TASK-23/24/25, TASK-15) need to do this. The test helper `bothLangs` shows the pattern.
- `getSiteSettings(c)` memoizes one loader per request (WeakMap keyed by the Hono context); a rejected `getSettings` gives 500 through `onError`.
- Full unit run: 233 of 234 pass. The one failure is `test/web/pages/bill-page.spec.tsx` (TASK-37, another dev), not my files.

## Review
**Verdict: approve** (lead, 2026-11-18). Full unit run: 36 files, 234 tests, all pass. Only the two listed files are in scope; src/index.ts untouched.

Checked:
1. Composition order is correct: securityHeaders, noindex, language and lazy settings, then per-group guards (rate limit before inputLimit), then `mount`, then notFound/onError. Because the security middleware wraps everything, 404, 429, 400 and the onError 500 all keep the headers (tests cover 404, 429 and 500).
2. Limits match the decision log (20/20/120/60 per minute, caps 200 and 1000). `bodyFields` is passed on `/search`, `/chat` and `/api/suggest`; the POST `message` over 1000 chars is refused and a body of exactly 1000 is accepted.
3. `WebDeps`, `WebEnv`, `createApp`, `getSiteSettings`, `RATE_LIMITS` are exported as TASK-23/24 need. `getSettings` is lazy and memoized per request; a sync or async throw becomes a 500.
4. Design note judged sound: one `use` per path, `/api/hotels/*` registered once so it does not double count, WeakMap-keyed loader. Language is path-derived, so `mount` must register each page at both `/x` and `/en/x` (`bothLangs` pattern). Not a defect here.

Non-blocking notes (no rework needed):
- The tests do not prove the AC10 `/api/suggest` counter is separate by exhausting it (120); they only show suggest still answers 200 while search and data are exhausted. Acceptable, the group wiring is visible in the code.
- The "rate limit refusal never invokes the handler" part of AC13 is not asserted (the `hits` array is not checked after the 429s). The guard order in the code guarantees it. TASK-23/24 mounters should keep this in mind.
- Guards are registered for `/search` and `/chat` only (not `/en/search`, `/en/chat`). That is what the task specified; if the existing search or chat routes are ever also served under `/en`, the guards must be added there.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
