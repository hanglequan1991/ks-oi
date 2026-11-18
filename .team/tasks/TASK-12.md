# TASK-12: Rate limiting middleware with injectable limiter

- id: TASK-12
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-6 (hono and test glob)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Technical design section 13: rate limit public routes (Cloudflare rate-limiting rules or a Workers rate-limit binding). A real binding needs Cloudflare, so the middleware depends on a tiny interface that matches the Workers Rate Limiting binding (`limit({ key }) => Promise<{ success: boolean }>`) and tests use an in-memory limiter with a fake clock. Wiring the real binding is TASK-15.

`src/web/middleware/rateLimit.ts` exports:
- `interface RateLimiter { limit(opts: { key: string }): Promise<{ success: boolean }> }`
- `createMemoryLimiter({ limit, windowMs, now? }): RateLimiter`: fixed window per key; `now` defaults to `Date.now` and is injectable; old windows are dropped (no unbounded growth: purge expired keys when the map exceeds 10,000 entries).
- `rateLimit({ limiter, keyPrefix, message?, clientKey? }): MiddlewareHandler`: key = `keyPrefix + ':' + client`, where client defaults to the `CF-Connecting-IP` header, then the first value of `X-Forwarded-For`, then `unknown`. When `limiter.limit` returns `success: false` the middleware answers status 429, header `Retry-After: 60` (seconds; configurable `retryAfterSeconds`, default 60), `Content-Type: application/json`, body `{"error":"too_many_requests"}`, and does not call the next handler. `limiter` may be a function `(c) => RateLimiter | undefined`; when it is `undefined` or throws, the request is allowed (fail open, with `console.warn`), so an outage of the limiter never takes the site down.
- Different `keyPrefix` values keep separate counters (search and chat do not share a bucket); different clients do not affect each other.

## Acceptance criteria
1. AC10: With limit 3 per window, requests 1 to 3 from one client pass and the 4th gets 429 with `Retry-After` and the JSON body; the next handler is not invoked for the refused request.
2. AC10: Normal use is not affected: a different client (other IP) still passes while the first is blocked; a different `keyPrefix` has its own counter.
3. AC11: After the window passes (fake clock advanced by `windowMs`) the blocked client is accepted again.
4. AC10: A limiter that throws or is missing lets the request through.
5. Client key falls back from `CF-Connecting-IP` to `X-Forwarded-For` first entry to `unknown`.
6. Memory limiter does not grow without bound (expired keys purged).

## Unit tests to write
All in `test/web/middleware/rateLimit.spec.ts` (fake clock, `app.request` with headers).
- [ ] `blocks the request over the limit with 429 and Retry-After`: covers AC10
- [ ] `other clients and other prefixes are not affected`: covers AC10
- [ ] `accepts requests again after the window ends`: covers AC11
- [ ] `fails open when the limiter is missing or throws`: covers AC10
- [ ] `client key uses CF-Connecting-IP then X-Forwarded-For then unknown`: covers AC10
- [ ] `memory limiter purges expired keys`: covers AC11 (hygiene)

## Files this task may touch
- `sheet-rag/src/web/middleware/rateLimit.ts` (new)
- `sheet-rag/test/web/middleware/rateLimit.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
