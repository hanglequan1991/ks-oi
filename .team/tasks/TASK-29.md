# TASK-29: Draft storage in the browser (src/client/bill/storage.ts)

- id: TASK-29
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-28 (`BillRow`, `emptyRow`), TASK-26 (limits)
- size: fits a 100k-token context (one file, injected storage and timers)

## Why
Technical design 18.7. The draft lives only in `localStorage` key `hd_bill_v1`; storage can be blocked or hold corrupt data, so everything is wrapped in `try/catch` and validated field by field. The functions take the storage object and timers as parameters so tests use a fake in plain Node. This module never calls `fetch` or any network API (AC34). Imports only `./state` and `src/domain/money.ts`.

Exports of `sheet-rag/src/client/bill/storage.ts`:
```ts
export const DRAFT_KEY = 'hd_bill_v1';
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function sanitizeRows(input: unknown, makeId: () => string): BillRow[];      // never throws; see rules
export function loadDraft(storage: StorageLike | null, makeId: () => string): { rows: BillRow[]; savedAt: string } | null;
export function saveDraft(storage: StorageLike | null, rows: BillRow[], now: Date): boolean;   // false when blocked or nothing to save
export function clearDraft(storage: StorageLike | null): boolean;
export function isBlankDraft(rows: BillRow[]): boolean;     // one row, all texts empty, no price, note empty, nights 1
export function createSaver(save: () => void, delayMs: number, timers: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void }): { schedule(): void; flush(): void; cancel(): void };
```
Rules:
- Stored value is `{ "v": 1, "savedAt": ISO string, "rows": [...] }`. Other `v`, invalid JSON, non-object, missing `rows` give `null` from `loadDraft` (and the corrupt key may be removed).
- `sanitizeRows`: only the first 30 rows; each field is type-checked: strings are cut (hotel and room text 200, slug 100, id 64, note 500 as code points), numbers must be finite integers; `nights` clamped 1..365; `price` and `defaultPrice` integers 0..`MAX_PRICE` or null; `priceEdited` boolean (a row with `priceEdited` true and `price` not a valid number or null becomes false); a missing or invalid id gets `makeId()`; ids duplicated in the list are replaced; unknown extra fields are dropped; non-object entries are dropped; an empty result gives `[]` (the caller then starts with one empty row).
- Text is stored and returned as plain strings; nothing is ever interpreted as markup.
- `saveDraft` stores a blank draft as "remove the key" (returns false) so an untouched page leaves nothing behind; any exception from the storage (blocked, quota) returns false and is not thrown. `storage` null (access itself threw) is accepted everywhere.
- `defaultPrice` is stored but treated as stale: it is refreshed by `applyRooms` (TASK-28, fetched via TASK-32); `loadDraft` does not trust it beyond range checks.
- `createSaver`: `schedule()` restarts a timer (debounce); `flush()` runs `save` at once if pending; `cancel()` drops it.

## Acceptance criteria
1. AC31: a draft saved with two rows, a note and an edited price loads back equal (ids, texts, slugs, nights, price, `priceEdited`, note) and returns the `savedAt` ISO string.
2. AC32 (data part): `defaultPrice` and `hotelSlug` survive the round trip so the page can refresh them; a stored `defaultPrice` of `-5`, `1.5` or `'x'` becomes null.
3. AC33: `clearDraft` removes the key; a later `loadDraft` gives null.
4. AC34: the module contains no network call: the tests use a fake storage that records every call and assert only `getItem`, `setItem`, `removeItem` on key `hd_bill_v1` happen, and a source scan of the file finds none of `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`.
5. AC9 / AC10: a stored note of 900 characters comes back as 500; a note `<img src=x onerror=alert(1)>` comes back unchanged as a string.
6. Corrupt input: invalid JSON, `null`, `[]`, `{"v":2,...}`, a 100-row list (cut to 30), rows with wrong types, duplicate ids, a price over 1e9 do not throw and give a safe result.
7. Blocked storage: a fake whose methods throw, and `null`, give `loadDraft` null, `saveDraft` false, `clearDraft` false without throwing.
8. A blank single row is not saved (key removed), so no "draft saved" message appears for an untouched page.
9. `createSaver` with fake timers: five quick `schedule()` calls run `save` once after the delay; `flush()` runs it at once; `cancel()` prevents it.

## Unit tests to write
In `test/client/bill-storage.spec.ts` (fake storage and fake timers; no browser).
- [ ] `saved draft loads back with the same rows and savedAt`: covers AC1
- [ ] `default price and slug round trip, bad defaults become null`: covers AC2
- [ ] `clearDraft removes the stored draft`: covers AC3
- [ ] `storage module touches only the draft key and has no network calls`: covers AC4
- [ ] `long notes are cut to 500 and markup stays plain text`: covers AC5
- [ ] `corrupt, oversized and old data is cleaned or ignored`: covers AC6
- [ ] `blocked or missing storage never throws`: covers AC7
- [ ] `a blank bill is not stored`: covers AC8
- [ ] `debounced saver runs once, flush and cancel work`: covers AC9

## Files this task may touch
- `sheet-rag/src/client/bill/storage.ts` (new)
- `sheet-rag/test/client/bill-storage.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Implemented `storage.ts` and `test/client/bill-storage.spec.ts` (9 tests, all ACs covered). Full suite: 32 files, 201 tests pass.
- Text limits (hotel/room 200, slug 100, id 64) are local constants; note and row limits come from `domain/money.ts`.
- `saveDraft` sanitizes rows with a local random-id fallback, since it takes no `makeId`.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
