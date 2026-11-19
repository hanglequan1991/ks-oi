# TASK-56: Wire scheduled handler and /internal/sync into the hotel-dictionary Worker

- id: TASK-56
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-54, TASK-55
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/site.ts` `SiteEnv` gains optional `SHEET_CSV_URLS?: string`, `SYNC_TOKEN?: string`, `AI?: unknown`. Existing fields and every existing route are unchanged (site.spec.tsx still passes untouched except for the new tests).
2. AC2: `default export` gains `scheduled(controller, env, ctx)` that builds the source with `createCsvUrlSource(parseSheetCsvUrls(env.SHEET_CSV_URLS))` and runs `runSync` via `ctx.waitUntil`. A `SheetConfigError` or an empty list is logged and the run is skipped; the handler never throws.
3. AC3: `POST /internal/sync` is mounted through `registerInternalSyncRoute` inside the existing `createApp({ mount })` call, with the token from `env.SYNC_TOKEN`. With `SYNC_TOKEN` unset it is 404 (AC2 of TASK-55).
4. AC4: the `parse` dependency of `runSync` is `parseSheetRows` imported from `src/sync/rowParser.ts`. This task creates that file as a stub with `parseSheetRows(csv, tab): ParseResult` returning `{ ok: false, reason: 'parser_not_configured' }`, so nothing is published and every tab is reported (fail closed). TASK-58 replaces the body (same signature).
5. AC5: `wrangler.hotel.jsonc` gains `"triggers": { "crons": ["0 * * * *"] }` (hourly, matching the story; the user's note said daily, this is configurable, see Dev notes) and a comment listing the secrets `SHEET_CSV_URLS` and `SYNC_TOKEN` (`wrangler secret put`) and the optional `AI` binding as commented-out text. No secret value is in the file.
6. AC6: `test/web/site-config.spec.ts` gets a new test that the cron trigger is valid and that no secret value appears; its existing tests are untouched.
7. AC7: the existing routes (/bill, /api/*, static fallback) still pass their tests; no change to chat or search code (STORY-14 AC12).

## Unit tests to write
- [ ] `scheduled runs the sync with a configured source and swallows errors`: covers AC2
- [ ] `scheduled with unset or invalid SHEET_CSV_URLS skips and does not throw`: covers AC2
- [ ] `POST /internal/sync is 404 without SYNC_TOKEN and 200 with the token`: covers AC3
- [ ] `stub parser reports parser_not_configured and publishes nothing`: covers AC4
- [ ] `wrangler.hotel.jsonc has the cron trigger and no secrets`: covers AC5, AC6
- [ ] `existing site.spec.tsx and bill tests still pass`: covers AC1, AC7

## Files this task may touch
<!-- Shared files: src/site.ts and test/web/site.spec.tsx (from TASK-42), test/web/site-config.spec.ts. No other task may touch them. -->
- `sheet-rag/src/site.ts`
- `sheet-rag/src/sync/rowParser.ts` (stub only, replaced by TASK-58)
- `sheet-rag/wrangler.hotel.jsonc`
- `sheet-rag/test/web/site.spec.tsx`
- `sheet-rag/test/web/site-config.spec.ts`
- `sheet-rag/test/web/siteSync.spec.tsx`

## Dev notes
Cron frequency: the story says hourly, the user message said daily; hourly is the story text, so it is the default here. One string in the jsonc to change.

## Review

## Questions
