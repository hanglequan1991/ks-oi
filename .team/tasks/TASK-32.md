# TASK-32: Browser API client for suggestions and rooms (src/client/bill/api.ts)

- id: TASK-32
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-28 (`RoomOption` type), TASK-6 (test glob). Contract with the server: TASK-23 (`GET /api/hotels/:slug`) and TASK-24 (`GET /api/suggest`); this task is tested with a fake `fetch`, no server.
- size: fits a 100k-token context (one file, injected fetch and timers)

## Why
Technical design 18.4 and 18.5: suggestions are debounced and the previous request aborted; room lists per hotel are cached in memory for the session; prices come only from the API (the final price including the fee, never a base price). Nothing about the bill is ever sent: only GET requests with the typed hotel text or the hotel slug (AC34). Imports only `./state` (type) and `src/domain/`.

Exports of `sheet-rag/src/client/bill/api.ts`:
```ts
export interface HotelOption { slug: string; name: string; city: string }
export interface BillApi {
  suggestHotels(q: string, signal?: AbortSignal): Promise<HotelOption[]>;   // GET /api/suggest?q=<encoded>&limit=8&lang=<lang>
  loadRooms(slug: string): Promise<RoomOption[]>;                            // GET /api/hotels/<encoded slug>?lang=<lang>, cached per slug
}
export function createBillApi(o: { fetch: typeof fetch; lang: 'vi' | 'en' }): BillApi;
export function createSuggester(o: { api: BillApi; delayMs: number; timers: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void } }):
  { request(q: string, onResult: (items: HotelOption[]) => void, onError: () => void): void; cancel(): void };
```
Rules:
- `q` is trimmed and cut to 60 characters; an empty `q` makes no request and gives `[]`. `fetch` is called with only the URL and `{ method: 'GET', signal, credentials: 'omit' }`; no body, no custom headers.
- Response parsing is defensive: a non-OK status rejects; `items` entries without string `slug` and `name` are dropped; a room entry needs a string `id` and `name`; its price is `room.price.amount` when that is a finite integer >= 0, otherwise null. Rooms keep the API order. Unknown fields are ignored (no base price is ever read; look only at `price.amount`).
- `loadRooms` caches the promise per slug; a failed load is evicted so the next call retries.
- `createSuggester.request` waits `delayMs` (debounce), aborts the previous in-flight request, and ignores results of aborted or superseded requests (an `AbortError` does not call `onError`).

## Acceptance criteria
1. AC11: `suggestHotels('mo')` calls `/api/suggest?q=mo&limit=8&lang=vi` and returns `{slug,name,city}` items; `q` with spaces, `&`, `#` or accents is URL-encoded.
2. AC14 / AC17: `loadRooms('mong-hotel')` calls `/api/hotels/mong-hotel?lang=vi` and returns rooms with `price` equal to `price.amount` (the final price); a room with `price: null` gives `price: null`.
3. AC34: every `fetch` call in all tests has method `GET`, no `body`, `credentials: 'omit'`, and a URL that contains only the typed hotel text or the slug (a test types a note-like text only into the bill state, never into the API, and asserts no call contained it; a source scan finds no `POST`, `sendBeacon` and no `localStorage`).
4. AC32: calling `loadRooms` twice for one slug makes one request; after a rejected request a second call makes a new request.
5. Debounce and abort: three quick `request()` calls within `delayMs` make one fetch with the last text; a new request while one is pending aborts the first (its `signal.aborted` is true) and only the latest result reaches `onResult`.
6. Safety: an empty or whitespace `q` makes no request; `q` of 100 characters is sent as 60; a 500 response rejects and the suggester calls `onError` once; malformed items are dropped; extra fields such as `base_price` are not copied into the result.
7. English page: with `lang: 'en'` both URLs carry `lang=en`.

## Unit tests to write
In `test/client/bill-api.spec.ts` (fake `fetch` returning `Response` objects; fake timers).
- [ ] `suggest calls the endpoint with an encoded query`: covers AC1
- [ ] `rooms come with final prices or null`: covers AC2
- [ ] `only plain GET requests without bill data are made`: covers AC3
- [ ] `room lists are cached and failures are retried`: covers AC4
- [ ] `suggester debounces and aborts older requests`: covers AC5
- [ ] `empty, long, failed and malformed cases are handled`: covers AC6
- [ ] `english page sends lang=en`: covers AC7

## Files this task may touch
- `sheet-rag/src/client/bill/api.ts` (new)
- `sheet-rag/test/client/bill-api.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- 7/7 tests in test/client/bill-api.spec.ts pass; full unit suite: 8 failures in test/web/app.spec.tsx and test/web/pages/bill-page.spec.tsx (other tasks, no import of client/bill/api).
- Fetch is called through a local reference (not as a method of the injected object) and the init is a non-literal object, because the Workers RequestInit type has no `credentials` field.
- Malformed envelope (non-OK, or no `items`/`rooms` array) rejects; malformed entries are dropped.
- Timers in tests are manual fakes passed through the `timers` dependency, not vitest fake timers.

## Review
**Verdict: approve** (lead, 2026-11-18). Full unit run: 36 files, 234 tests, all pass. Only the two listed files are involved; imports are only the `RoomOption` type from `./state`.

Checked against the ACs: every request is `GET` with init keys exactly `method`, `signal`, `credentials: 'omit'`, no body or headers; URLs carry only the trimmed text (cut to 60, URI-encoded) or the encoded slug plus `limit` and `lang`; the source scan test finds no POST, sendBeacon or localStorage. Prices read only `price.amount` (finite integer >= 0, else null), extra fields such as `base_price` are not copied, malformed entries and envelopes are handled. `loadRooms` caches the promise per slug and evicts a failed load (identity check avoids evicting a newer entry). The suggester debounces with an injected timer, aborts the previous controller, drops results of superseded or aborted requests (sequence id plus `signal.aborted`), and does not call `onError` for AbortError. `cancel()` also invalidates in-flight results. All 7 ACs map to a named test.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
