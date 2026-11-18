# TASK-11: Security headers and noindex middleware

- id: TASK-11
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-6 (hono and test glob)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Technical design section 13 (Headers) and 18.1 (`X-Robots-Tag: noindex`). One Hono middleware module, no bindings, so it runs under plain Vitest with `app.request`.

`src/web/middleware/security.ts` exports:
- `securityHeaders(): MiddlewareHandler` sets on every response (including 404, 429 and errors, so it must set headers after `await next()` and also for responses thrown as `HTTPException`/`app.onError`; it must not overwrite a header a handler already set, except it always sets the five below):
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (no `unsafe-inline`, no `unsafe-eval`; export it as `CSP`)
  - `X-Frame-Options: DENY`
- `noindex(): MiddlewareHandler` sets `X-Robots-Tag: noindex, nofollow` on every response it wraps.
Also export `CSP` constant.

## Acceptance criteria
1. AC9: A route wrapped by `noindex()` returns `X-Robots-Tag: noindex, nofollow` for HTML, JSON and 404 responses.
2. AC12: Under `securityHeaders()`, an HTML route, a JSON route, a 404 and a route that throws (500 through `app.onError`) all carry the five headers with the values above.
3. AC12: The CSP contains `script-src 'self'` and `style-src 'self'`, contains `img-src 'self' https:`, and does not contain `unsafe-inline` or `unsafe-eval`.
4. A header set by the handler for something else (for example `Cache-Control`) is preserved.
5. Middleware does not change status code or body.

## Unit tests to write
All in `test/web/middleware/security.spec.ts`.
- [ ] `noindex header on html, json and 404`: covers AC9
- [ ] `security headers on html, json, 404 and 500`: covers AC12
- [ ] `csp allows only self scripts and styles and https images`: covers AC12
- [ ] `existing headers, status and body are unchanged`: covers AC12 (no side effects)

## Files this task may touch
- `sheet-rag/src/web/middleware/security.ts` (new)
- `sheet-rag/test/web/middleware/security.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->
Verdict: approve
- Tests cover AC1-AC5 (noindex on html/json/404; five headers on html/json/404/500 via onError; CSP content; Cache-Control, status and body preserved). Suite run: 14 files, 78 tests pass.
- Code matches the task; only the two listed files were added.
- Process gap (minor): Dev notes section is empty. Judged on the code, no rework.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
