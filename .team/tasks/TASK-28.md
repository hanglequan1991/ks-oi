# TASK-28: Bill state reducer and store (src/client/bill/state.ts)

- id: TASK-28
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-26 (limits and `clampNights`, `lineTotal`), TASK-6 (test glob `test/client/**`)
- size: fits a 100k-token context (one pure file)

## Why
Technical design 18.5. All page rules live in a pure reducer so they are unit tested without a browser. `src/client/` may import only `src/domain/` (design 3.4): import `money.ts` and nothing else. No DOM, no `fetch`, no `localStorage`, no random ids inside the reducer (ids come from the action so tests are deterministic).

Exports of `sheet-rag/src/client/bill/state.ts`:
```ts
export interface BillRow { id: string; hotelText: string; hotelSlug: string | null; roomText: string; roomId: string | null;
  defaultPrice: number | null; price: number | null; priceEdited: boolean; nights: number; note: string }
export interface RoomOption { id: string; name: string; price: number | null }   // price = final price from the API
export interface BillState { rows: BillRow[]; open: { rowId: string; cell: 'hotel' | 'room' } | null }
export type BillAction =
  | { type: 'addRow'; id: string } | { type: 'removeRow'; rowId: string } | { type: 'clearAll'; id: string }
  | { type: 'setHotelText'; rowId: string; text: string } | { type: 'pickHotel'; rowId: string; slug: string; name: string }
  | { type: 'setRoomText'; rowId: string; text: string } | { type: 'pickRoom'; rowId: string; roomId: string; name: string; price: number | null }
  | { type: 'setNights'; rowId: string; nights: number } | { type: 'setPrice'; rowId: string; value: number | null }
  | { type: 'resetPrice'; rowId: string } | { type: 'setNote'; rowId: string; note: string }
  | { type: 'applyRooms'; slug: string; rooms: RoomOption[] } | { type: 'hydrate'; rows: BillRow[]; fallbackId: string }
  | { type: 'openCombo'; rowId: string; cell: 'hotel' | 'room' } | { type: 'closeCombo' };
export function emptyRow(id: string): BillRow;                 // nights 1, everything else empty/null/false
export function createInitialState(id: string): BillState;     // exactly one empty row
export function reduce(state: BillState, action: BillAction): BillState;   // never mutates the input
export function effectivePrice(row: BillRow): number;          // priceEdited ? (price ?? 0) : (defaultPrice ?? 0)
export function rowTotal(row: BillRow): number | null;         // null (shown as a dash) when the price is missing: edited ? price === null : defaultPrice === null; otherwise lineTotal(nights, effectivePrice)
export function billTotal(state: BillState): number;           // sum of rowTotal, null counts 0 (grandTotal)
export function canAddRow(s: BillState): boolean;              // rows < MAX_ROWS
export function canRemoveRow(s: BillState): boolean;           // rows > 1
export function createStore(initial: BillState): { get(): BillState; dispatch(a: BillAction): void; subscribe(fn: (s: BillState) => void): () => void };
```
Rules:
- `setHotelText`: updates `hotelText` and sets `hotelSlug` to null (free text). If the row had a `hotelSlug` before, the room fields (`roomText`, `roomId`, `defaultPrice`) are cleared too (rooms belong to that hotel); with no previous slug the room is left alone.
- `pickHotel`: sets text and slug; if the slug differs from the current one, clears the room fields (AC16); picking the same hotel again changes nothing else. An edited price is kept; an unedited price follows the cleared default (empty).
- `setRoomText`: free text; sets `roomId` and `defaultPrice` to null.
- `pickRoom`: sets `roomText`, `roomId`, `defaultPrice`; never touches `price` or `priceEdited` (AC23).
- `setPrice`: `value` equal to `defaultPrice` gives `priceEdited` false and `price` null; a different non-null value gives edited true; `null` with a default present gives edited true and `price` null; `null` with no default gives edited false. Value is capped at `MAX_PRICE`.
- `resetPrice`: `priceEdited` false, `price` null.
- `setNights`: `clampNights` but never below `MIN_NIGHTS` (1..365).
- `setNote`: keeps the first 500 characters counted as code points (`Array.from`), no trimming.
- `addRow` does nothing at 30 rows; `removeRow` does nothing with one row or an unknown id; `clearAll` gives exactly one empty row with the given id and `open: null`.
- `applyRooms` (AC32): for every row whose `hotelSlug` equals `slug`: if its `roomId` is in `rooms`, set `defaultPrice` to that room's price; if not found, set `roomId` and `defaultPrice` to null (keep `roomText`). Never changes `price`, `priceEdited` or rows of other hotels.
- `hydrate`: replaces the rows (at most 30; empty list gives one empty row with `fallbackId`) and sets `open: null`.
- Removing a row closes the dropdown if it belonged to that row.

## Acceptance criteria
1. AC7: `createInitialState('a')` has exactly one row with `nights` 1, empty texts and no price.
2. AC9 / AC10: a note of 600 characters is cut to 500; a note with `<b>` and `&` is stored unchanged as plain text (no escaping or change in state).
3. AC13 / AC15: `setHotelText` keeps the typed text and leaves `hotelSlug` null; a row with no slug can still take free room text.
4. AC16: picking a different hotel clears the room text, id and default price; picking the same hotel keeps the room.
5. AC17 / AC18: after `pickRoom` with price 1375000 the effective price is 1375000 and `rowTotal` for 2 nights is 2750000; after `pickRoom` with price null `rowTotal` is null.
6. AC21 / AC22 / AC23: typing a different price sets `priceEdited`; typing the default again clears it; `resetPrice` returns to the default; `pickRoom` on another room keeps the edited price.
7. AC24 / AC25: `rowTotal` is nights x effective price; `billTotal` sums rows and counts a null total as 0.
8. AC26 / AC27 / AC28 / AC29: add appends a numbered-in-order empty row until 30 and then does nothing (`canAddRow` false); remove keeps order, does nothing at one row (`canRemoveRow` false).
9. AC30: `clearAll` leaves one empty row.
10. AC19: `setNights` with 0, 1000 or 12.7 gives 1, 365 and 12.
11. AC32: `applyRooms` refreshes the default of unedited rows, keeps an edited price, nulls a vanished room and leaves other hotels alone.
12. Reducer never mutates its input (frozen state objects do not throw) and `createStore` notifies subscribers after dispatch, stops after unsubscribe.

## Unit tests to write
In `test/client/bill-state.spec.ts`.
- [ ] `starts with one empty row`: covers AC1
- [ ] `note is capped at 500 and kept as plain text`: covers AC2
- [ ] `free text hotel and room are kept`: covers AC3
- [ ] `changing the hotel clears the room, same hotel keeps it`: covers AC4
- [ ] `picked room sets the default price and totals; no price gives no total`: covers AC5
- [ ] `edited price, reset, and room change keep the rules`: covers AC6
- [ ] `row total and bill total`: covers AC7
- [ ] `add and remove rows respect 30 and 1`: covers AC8
- [ ] `clear all leaves one empty row`: covers AC9
- [ ] `nights are clamped to 1 to 365`: covers AC10
- [ ] `applyRooms refreshes defaults only for unedited rows of that hotel`: covers AC11
- [ ] `reducer is pure and store notifies subscribers`: covers AC12

## Files this task may touch
- `sheet-rag/src/client/bill/state.ts` (new)
- `sheet-rag/test/client/bill-state.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red: spec failed with module not found. Green: 12/12 in test/client/bill-state.spec.ts. Full suite: 19 files, 111 tests passed.
- Limits and money helpers imported from src/domain/money.ts only. setPrice caps value at MAX_PRICE before comparing with the default.

## Review
Verdict: approve

- Tests: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` gives 118 tests passing, 20 files passing. The only failing suite is `test/client/bill-format.spec.ts` (missing `src/client/bill/format`), which belongs to another task and is ignored. All 12 tests in `bill-state.spec.ts` pass.
- Coverage: every AC 1 to 12 has a matching named test with meaningful assertions (30 row cap, min one row, order kept, unknown id, edited marker, default retyped, reset, pickRoom keeps edited price, null total counts 0, clamp 0/1000/12.7, applyRooms unedited/edited/vanished/other hotel, frozen input, store unsubscribe).
- Code vs task: reducer matches every rule in the task. setPrice caps at MAX_PRICE before comparing with the default. Only `money.ts` is imported from the domain. The file stays pure (no DOM, fetch or random ids). Only the two listed files belong to this task; the git status shows no other changes from it.
- Non-blocking gaps, not required for approval: no test for the 500 cap counted in code points (emoji), for `removeRow` closing the open dropdown, or for `hydrate` (30 cap, empty gives fallback row). A later task may add them.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
