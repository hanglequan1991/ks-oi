# TASK-63: Classify thrown fetch errors into cause codes; never retry subrequest_limit or illegal_invocation

- id: TASK-63
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-54, TASK-56, TASK-62 (all done)
- size: fits a 100k-token context (few files, one behaviour)

## Background (real production failure, live sync 2026-11-19)
Run 97433cc4 (manual, 27 min): failed=451, every note is `csv_network`. `getText` in `sheet-rag/src/sync/publicGoogleSource.ts` catches every thrown fetch error and reports `<reason>_network`, so the real cause is hidden. 27 min / 451 tabs is about 3.5 s per tab: 3 tries with 1s and 2s backoff, each failing at once. Prime suspect (unverified): the Workers per-invocation subrequest limit (Free 50, Paid 1000; fetch and bindings count), error text "Too many subrequests". Retrying such an error is pointless and wastes wall time.

Design (fixed by lead):
- New closed set `NetworkCause`: `subrequest_limit`, `illegal_invocation`, `timeout`, `redirect_error`, `network_other`.
- New error code format for a thrown fetch: `<reason>_<cause>` (for example `csv_subrequest_limit`, `csv_network_other`). The old `<reason>_network` code is retired; tests that pin it are updated deliberately. All codes still match `^[a-z][a-z0-9_]{0,63}$`.
- `SheetReadError` gets an optional readonly field `networkCause?: NetworkCause` (not `cause`, to avoid clashing with `Error.cause`). It is set only for thrown-fetch failures; HTTP-status failures leave it undefined. TASK-68 reads it for the circuit breaker.
- Classification looks only at `error.name` and `error.message` of the thrown value, case-insensitive: contains `too many subrequests` -> subrequest_limit; contains `illegal invocation` -> illegal_invocation; name `TimeoutError` or `AbortError` or message contains `timed out`/`timeout` -> timeout; contains `redirect` -> redirect_error; anything else, including non-Error values -> network_other. The message and URL are never stored or returned.

## Acceptance criteria
1. AC1: New pure module `sheet-rag/src/sync/fetchErrors.ts` exports `NETWORK_CAUSES` (readonly tuple of the five codes), `type NetworkCause`, and `classifyFetchError(error: unknown): NetworkCause`, following the rules above. It has no imports besides types.
2. AC2: `SheetReadError` accepts an optional second constructor argument `networkCause` and exposes it; existing one-argument use is unchanged.
3. AC3: In `getText`, a thrown fetch is classified; on the final failure it throws `SheetReadError("<reason>_<cause>", cause)`. No URL and no raw message appears in `reason`, `message`, or `networkCause`.
4. AC4: `subrequest_limit` and `illegal_invocation` are not retried: exactly one fetch call and no sleep. `timeout`, `redirect_error` and `network_other` keep the 3-try policy with backoff.
5. AC5: HTTP-status behaviour from TASK-62 is unchanged (`<reason>_http_<status>`, 429/5xx retried, 404/403 not).
6. AC6: The header comment of `publicGoogleSource.ts` mentions the cause codes.

## Unit tests to write
- [ ] `classifyFetchError maps each message to its cause`: covers AC1 (Too many subrequests, Illegal invocation, TimeoutError, redirect text, unknown text, non-Error value like a string or undefined)
- [ ] `classifyFetchError output is always a member of NETWORK_CAUSES`: covers AC1
- [ ] `SheetReadError exposes networkCause and stays optional`: covers AC2
- [ ] `thrown fetch ends as csv_network_other after 3 tries with sleeps`: covers AC3, AC4 (replaces the old `csv_network` test)
- [ ] `error text containing the URL does not leak into the reason or message`: covers AC3
- [ ] `subrequest_limit is not retried`: covers AC4 (1 fetch call, sleep never called, reason `csv_subrequest_limit`)
- [ ] `illegal_invocation is not retried`: covers AC4
- [ ] `timeout is retried then reported as <reason>_timeout`: covers AC4
- [ ] `HTTP 503 still retried and 404 not retried`: covers AC5 (existing tests stay green)

## Files this task may touch
- `sheet-rag/src/sync/fetchErrors.ts` (new)
- `sheet-rag/src/sync/sheetSource.ts`
- `sheet-rag/src/sync/publicGoogleSource.ts`
- `sheet-rag/test/sync/fetchErrors.spec.ts` (new)
- `sheet-rag/test/sync/publicGoogleSource.spec.ts`
- `sheet-rag/test/fakes/sheetSource.ts` and `sheet-rag/test/fakes/sheetSource.spec.ts` only if the fake needs the new optional arg
- Shared file: `publicGoogleSource.ts` and `sheetSource.ts` are also touched by TASK-64 and TASK-67. They must run after this task (see dependency order).

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red first: new fetchErrors.spec.ts and updated publicGoogleSource.spec.ts failed as expected (missing module, old `_network` code).
- Green: `src/sync/fetchErrors.ts` (new, pure). `SheetReadError(reason, networkCause?)` in sheetSource.ts; the file's only import is `import type` from fetchErrors. `getText` catch block classifies, throws `<reason>_<cause>`, and fails at once for subrequest_limit / illegal_invocation.
- The `fake` source needed no change (no test pins `_network` outside publicGoogleSource.spec.ts).
- Targeted specs: 55 passed (fetchErrors, publicGoogleSource, test/fakes). Full suite: 500 passed, 1 failed in `test/sync/syncHotel.spec.ts` (TASK-65/66 area, not touched here).

## Review
Verdict: approve (lead, 2026-11-19)
- Tests cover all ACs: classify mapping and closed set (AC1), SheetReadError optional networkCause (AC2), csv_network_other after 3 tries with sleeps and no URL leak (AC3), subrequest_limit and illegal_invocation fail after one fetch with no sleep, timeout retried (AC4), HTTP 503/404 behaviour kept (AC5); header comment lists the cause codes (AC6).
- Targeted run: fetchErrors, publicGoogleSource, budget, countingDb specs all green (47 tests here, 55 with test/fakes per dev).
- Code matches: classification reads only error.name and error.message, returns only a member of the closed set; the reason is `<reason>_<cause>`, the message and URL are never stored. fetchErrors.ts has no runtime imports; sheetSource.ts imports it as a type only. Only files in the list changed.
- Minor, not blocking: the header comment line about "The owner must verify..." now runs on after the new text; tidy when next touched (TASK-64/67).

## Questions
Q1 (for the owner, via product; first task of this fix): (a) Which Cloudflare Workers plan is the hotel-dictionary Worker on, Free (50 subrequests per invocation) or Paid (1000)? Defaults in this fix assume Free (SUBREQUEST_BUDGET 40, MAX_TABS_PER_RUN 25); on Paid the owner raises both in `vars`. (b) Should Cloudflare Queues be used later to fan out one message per tab, as the deployed sheet-rag does?
A (lead, technical part): Recommend budgeted resumable runs now (TASK-65 to TASK-71): no new bindings, no new infrastructure, and a 450-tab folder converges over several cron ticks. Queues would need a new queue binding, a producer and a consumer handler, and a dead-letter policy in `wrangler.hotel.jsonc`; keep it as a later improvement once the owner confirms the plan (Queues are available on Free with limits). This is a business and cost decision for the owner, so the plan question stays open for product; it does not block the tasks, because the defaults are safe for Free.
