# TASK-55: POST /internal/sync route (bearer token, constant time, rate limited)

- id: TASK-55
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 1
- depends on: none (takes the sync as an injected function)
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/web/routes/internalSync.ts` exports `registerInternalSyncRoute(app, deps: { getToken: () => string | undefined; runSync: (opts: { force: boolean }) => Promise<unknown>; limiter?: RateLimiter })` mounting `POST /internal/sync` on the Hono app from `createApp`.
2. AC2: when the token secret is unset or empty, the route answers 404 with the same body as an unknown route (indistinguishable), for every method.
3. AC3: `Authorization: Bearer <token>` is compared in constant time (hash both sides with SHA-256, then XOR-compare all bytes; no early return). Missing, malformed or wrong credentials give 401 with no detail and `WWW-Authenticate` is not sent. A token in the query string is NOT accepted.
4. AC4: rate limit using `src/web/middleware/rateLimit.ts`: 5 per minute per IP (CF-Connecting-IP); the limiter runs BEFORE the token check so guessing is throttled; over the limit gives 429.
5. AC5: success returns 200 JSON of the summary (counts and failure list only); `?force=1` passes `force: true`. If runSync throws, 500 with a generic body; the error text is not echoed.
6. AC6: the response carries `X-Robots-Tag: noindex` and `Cache-Control: no-store` (use `noindex()` from middleware/security.ts); the route is not in any link, sitemap or page.
7. AC7: GET on `/internal/sync` gives 404 (only POST exists).

## Unit tests to write
- [ ] `404 when token unset or empty`: covers AC2
- [ ] `401 for missing, wrong, and query-string token`: covers AC3
- [ ] `constant-time compare function handles different lengths and equal tokens`: covers AC3
- [ ] `200 with summary and force flag`: covers AC5
- [ ] `429 after limit even with wrong token`: covers AC4
- [ ] `500 generic when sync throws`: covers AC5
- [ ] `noindex and no-store headers on 200, 401, 429`: covers AC6
- [ ] `GET returns 404`: covers AC7

## Files this task may touch
- `sheet-rag/src/web/routes/internalSync.ts`
- `sheet-rag/test/web/routes/internalSync.spec.ts`

## Dev notes
Related open check in decision.md (2026-11-19): the limiter trusts CF-Connecting-IP, then X-Forwarded-For. Tests send CF-Connecting-IP.

- Implemented in `src/web/routes/internalSync.ts`; tests in `test/web/routes/internalSync.spec.ts` (8 tests, all green; full unit suite 411 passed).
- Order: secret gate (404 via `c.notFound()`), then rate limit, then bearer check. `constantTimeEqual` is exported for tests.
- 200 body is the value returned by `runSync` as-is. No summary shape is defined in STORY-14 or the code yet, so the route does not filter it. If the sync can return file paths or row data, the caller must return counts and failures only.

## Review

Verdict: rework

Everything else is right (404 gate first, rate limit before token check, SHA-256 + full XOR compare, header-only token, noindex via global middleware, generic 500 with no echo, GET 404). One defect:

1. AC2 says the unset-secret 404 must be indistinguishable from an unknown route. `app.use(path, noindex(), noStore)` runs for every method on `/internal/sync`, so with the secret unset the 404 carries `Cache-Control: no-store`, while an unknown route's 404 carries none (noindex is global, so that header is fine). The route is therefore detectable by header. Fix: apply `noStore` only after the secret gate (e.g. set it inside `tokenCheck`/after the gate passes, and on the 429 response path), so the secret-unset 404 and the GET 404 have exactly the same headers as `/internal/nope`. The 429 and 401 must still carry no-store (existing test).
2. Strengthen test `404 when token unset or empty`: compare the full header set (at least `Cache-Control` and `X-Robots-Tag`) and status against an unknown route, and also assert it for a GET and another method (AC2 says every method).
3. Note (no change needed): the default limiter is in-memory per isolate, so the 5/min is per isolate; acceptable for now, tracked by the open decision.md check on CF-Connecting-IP.

The 200 body is runSync's result unfiltered; the guarantee is placed on TASK-54 (new AC9 added there).

## Questions
