# TASK-13: Input length cap middleware (before the AI service)

- id: TASK-13
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: review
- assignee: dev
- rework count: 0
- depends on: TASK-6 (hono and test glob)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Technical design section 13: an input length cap on `/chat` and `/search` before the website is public, so oversized input is refused before Workers AI is called. The deployed `src/index.ts` is not in the repo, so the real field names of the chat and search routes are unknown: the middleware takes the field names as options and is tested with a stub handler that records whether it was reached (it stands in for the AI call).

`src/web/middleware/inputLimit.ts` exports `inputLimit(opts): MiddlewareHandler` with
`opts = { queryFields?: string[]; bodyFields?: string[]; maxChars: number; maxBodyBytes?: number; messages? }`:
- Query string: each listed field longer than `maxChars` (count Unicode code points, not UTF-16 units, so Vietnamese diacritics and emoji count fairly) leads to status 400 `{"error":"input_too_long","field":"<name>","max":<maxChars>}`.
- JSON body (only when the method is POST/PUT and content-type is JSON): reject when `Content-Length` is above `maxBodyBytes` (default 8192) with 413 `{"error":"body_too_large"}` before reading the body; otherwise read with `c.req.raw.clone()` so the handler can still read it; each listed top-level string field longer than `maxChars` leads to 400 as above; invalid JSON is not this middleware's concern and is passed on (handler decides); non-string or missing fields are ignored.
- Never calls the next handler on a refusal.
- Provide defaults as exported constants for later wiring: `SEARCH_MAX_CHARS = 200`, `CHAT_MAX_CHARS = 1000`.

## Acceptance criteria
1. AC13: A query field `q` of 201 characters on a route with `maxChars: 200` is refused with 400 and the stub handler is not called; exactly 200 characters passes.
2. AC13: A JSON body field `message` above `maxChars` is refused with 400 and the stub is not called; a body within the limit reaches the handler and the handler can still read the full JSON body.
3. AC13: A `Content-Length` above `maxBodyBytes` is refused with 413 before the body is read.
4. Length counts code points: 200 Vietnamese characters with diacritics (some composed of combining marks) and a 200-emoji string are handled consistently (counted by code points, documented in the test).
5. Non-string, missing fields and invalid JSON are passed on without error.
6. Constants `SEARCH_MAX_CHARS` and `CHAT_MAX_CHARS` are exported with the values above.

## Unit tests to write
All in `test/web/middleware/inputLimit.spec.ts`.
- [ ] `refuses an over-long query field and never reaches the handler`: covers AC13
- [ ] `accepts exactly the maximum length`: covers AC13
- [ ] `refuses an over-long JSON body field and the handler can still read a valid body`: covers AC13
- [ ] `refuses a body above maxBodyBytes with 413`: covers AC13
- [ ] `counts code points for Vietnamese text and emoji`: covers AC13 (fairness)
- [ ] `ignores missing fields, non-strings and invalid JSON`: covers AC13 (robustness)
- [ ] `exports the default limits`: covers AC13

## Files this task may touch
- `sheet-rag/src/web/middleware/inputLimit.ts` (new)
- `sheet-rag/test/web/middleware/inputLimit.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- 7/7 tests in `test/web/middleware/inputLimit.spec.ts` pass (red first: module missing).
- Length = `[...value].length` (code points). Test documents precomposed vs decomposed Vietnamese and emoji.
- Body is read through `c.req.raw.clone().json()`; invalid JSON calls `next()`; non-object bodies and non-string fields are ignored.
- `messages?` is accepted in the options type but unused (response shape is fixed by the task). Flag if it should drive wording.
- Full suite: 69 tests pass; `test/domain/hotelView.spec.ts` fails to import `src/domain/hotelView` (another task's area, not touched).

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
