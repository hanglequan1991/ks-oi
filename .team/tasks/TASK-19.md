# TASK-19: Query parameter validation and API dependency types (src/web/api/params.ts, types.ts)

- id: TASK-19
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-5 (`SiteSettings` type import in `types.ts`); TASK-1 (test runner). No dependency on TASK-17 (params do not fold text).
- size: fits a 100k-token context (few files, one behaviour)

## Why
AC3, AC12 and AC13: inputs are validated and limited before any query runs. No new dependency (the design mentions Zod; plain functions are used so `package.json` and the lock file stay untouched). Pure functions, no Hono, no D1.

Decision (user, for AC3): a page size above the maximum is NOT rejected; it is limited to 50. An invalid filter value is rejected with a clear error.

`sheet-rag/src/web/api/types.ts` (types only):
```ts
export interface ApiDeps { db: D1Database; getSettings(): Promise<SiteSettings> }   // SiteSettings from src/db/settings.ts (TASK-5)
export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export const MAX_PAGE_SIZE = 50; export const DEFAULT_PAGE_SIZE = 20;
export const SUGGEST_MAX_CHARS = 60; export const SUGGEST_MAX_LIMIT = 10; export const SUGGEST_DEFAULT_LIMIT = 8;
```
`sheet-rag/src/web/api/params.ts`:
```ts
export interface ListParams { city?: string; q?: string; stars?: number[]; facilities: string[]; sort: 'name'|'stars'|'price'; page: number; limit: number; lang: 'vi'|'en' }
export function parseListParams(url: URLSearchParams): ParseResult<ListParams>;
export interface SuggestParams { q: string; limit: number; lang: 'vi'|'en' }
export function parseSuggestParams(url: URLSearchParams): ParseResult<SuggestParams>;
export function parseLang(url: URLSearchParams): ParseResult<'vi'|'en'>;
```
Rules for the list: `city` matches `^[a-z0-9-]{1,60}$`; `q` trimmed, at most 100 characters (longer is an error), empty after trim is treated as absent; `stars` is a single integer 1 to 5 or a comma-separated list of them (`stars=4,5`), anything else is an error; `facility` may repeat (`facility=pool&facility=parking`) or use commas, each `^[a-z0-9_]{1,40}$`, at most 10, duplicates removed; `sort` one of `name` (default), `stars`, `price`, otherwise error; `page` integer at least 1 (default 1, upper bound 10000), otherwise error; `limit` default 20, integer at least 1, any value above 50 becomes 50 (no error), a non-integer or less than 1 is an error; `lang` `vi` (default) or `en`, anything else is an error. Error `code` is `invalid_param` and the `message` names the parameter (for example `limit must be a whole number from 1 to 50`).
Rules for suggest: `q` required, trimmed length 1 to 60 else error (`code: 'invalid_q'`), `limit` default 8, integer 1 to 10 else error (a value above 10 is an error here, per AC12 "1 to 10"), `lang` as above. Characters in `q` are NOT rejected here (search syntax characters are neutralised by `foldText` in the query layer; the route returns an empty list when the folded text is empty).

## Acceptance criteria
1. AC3: `limit=500` gives `limit` 50 and `ok: true`; `limit=abc`, `limit=0`, `limit=-3`, `limit=2.5` give `ok: false` with a message naming `limit`; missing limit gives 20.
2. AC3: invalid values for `stars` (`6`, `0`, `x`, `4,x`), `city` (`Da Nang`, `a;b`), `facility` (`Pool!`, 11 items), `sort` (`price_desc`), `page` (`0`, `abc`), `lang` (`fr`) and a `q` longer than 100 characters are each rejected with `invalid_param` and a message naming the parameter.
3. AC2: valid filters are parsed into typed values: `stars=4,5` gives `[4,5]`, repeated and comma `facility` give one deduplicated list, `q` is trimmed.
4. AC12: suggest defaults to limit 8; `limit=1` and `limit=10` are accepted; `limit=0` and `limit=11` are rejected; `q` of 1 and of 60 characters is accepted.
5. AC13: suggest with `q` missing, empty, only spaces, or 61 characters is rejected with `invalid_q`; `q` containing `"`, `*`, `%`, `(`, `)` is accepted unchanged (handled later), without throwing.

## Unit tests to write
In `test/web/api/params.spec.ts` (no Hono, no database).
- [ ] `oversized page size is limited to 50`: covers AC1
- [ ] `invalid limit values are rejected naming limit`: covers AC1
- [ ] `invalid stars, city, facility, sort, page, lang and long q are rejected`: covers AC2
- [ ] `valid filters are parsed and deduplicated`: covers AC3
- [ ] `suggest accepts limit 1 to 10 and defaults to 8`: covers AC4
- [ ] `suggest rejects empty, blank and over-long text`: covers AC5
- [ ] `suggest passes search-syntax characters through without throwing`: covers AC5

## Files this task may touch
- `sheet-rag/src/web/api/params.ts` (new)
- `sheet-rag/src/web/api/types.ts` (new)
- `sheet-rag/test/web/api/params.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
