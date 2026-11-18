# TASK-26: Money and limits (src/domain/money.ts)

- id: TASK-26
- story: [STORY-11](../stories/STORY-11.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-1 (test runner only)
- size: fits a 100k-token context (one pure file)

## Why
Technical design 18.6: one pure module, imported by the browser bundle and by tests, with whole-number arithmetic and hard upper bounds. Imports nothing (no `web/`, no `db/`). Every other STORY-11 task takes its limits from here, so nobody hard-codes 30, 365, 500 or 1e9.

Required exports in `sheet-rag/src/domain/money.ts`:
```ts
export const MAX_ROWS = 30, MAX_NIGHTS = 365, MIN_NIGHTS = 1, MAX_NOTE = 500,
             MAX_PRICE = 1_000_000_000, MAX_PRICE_DIGITS = 10;
export function parseVnd(input: string): number | null;   // keeps digits only, first 10 digits, min(value, MAX_PRICE); no digits -> null; "0" -> 0
export function formatVnd(n: number, sep = '.'): string;  // whole number, groups of 3 with `sep`; negative or non-finite -> 0
export function clampNights(n: number): number;           // trunc, NaN -> 0, range 0..MAX_NIGHTS (as in the design)
export function parseNights(input: string): number | null;// digits only, first 3 digits, then clamp to MIN_NIGHTS..MAX_NIGHTS; no digits -> null
export function lineTotal(nights: number, price: number): number;   // clampNights(nights) * min(max(price,0), MAX_PRICE)
export function grandTotal(rows: { nights: number; price: number }[]): number;
```
`sep` is `.` on `/bill` and `,` on `/en/bill` (chosen by the caller). The largest possible total (30 x 365 x 1e9) must stay below `Number.MAX_SAFE_INTEGER` (assert it in a test).

## Acceptance criteria
1. AC19: `parseNights('abc')` is null; `'12a'` gives 12; `'0'` gives 1; `'999'` gives 365; `'1000'` is read as its first three digits `100`; `'-5'` gives 5 (no sign accepted); clamping never returns below 1 or above 365.
2. AC20: `parseVnd('1.375.000')`, `'1,375,000'` and `'1375000'` all give 1375000; `'abc'` and `''` give null; `'0'` gives 0; a 15-digit input is cut to 10 digits and then capped at 1,000,000,000; letters, spaces and signs are ignored (`'  12 a3 '` gives 123); `formatVnd(1375000)` is `1.375.000`, with `','` is `1,375,000`; `formatVnd(0)` is `0`; `formatVnd(999)` is `999`; `formatVnd(-5)` and `formatVnd(NaN)` are `0`.
3. AC24: `lineTotal(3, 1250000)` is 3750000; `lineTotal(0, x)` is 0; nights above 365 are treated as 365; price above `MAX_PRICE` is treated as `MAX_PRICE`; negative price is 0.
4. AC25: `grandTotal` sums line totals (`[{2,1000},{1,500}]` gives 2500); an empty list gives 0; the maximum case (30 rows, 365 nights, `MAX_PRICE`) equals 10,950,000,000,000 and is a safe integer.
5. AC9 / AC26 / AC27 (limits): constants equal 30, 365, 1, 500, 1e9, 10 exactly.

## Unit tests to write
In `test/domain/money.spec.ts`.
- [ ] `parseNights keeps digits only and stays within 1 to 365`: covers AC1
- [ ] `parseVnd accepts dots, commas and plain digits and caps length and value`: covers AC2
- [ ] `formatVnd groups thousands with the given separator`: covers AC2
- [ ] `lineTotal multiplies and applies the limits`: covers AC3
- [ ] `grandTotal sums lines and the maximum stays a safe integer`: covers AC4
- [ ] `limit constants have the agreed values`: covers AC5

## Files this task may touch
- `sheet-rag/src/domain/money.ts` (new)
- `sheet-rag/test/domain/money.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Added `src/domain/money.ts` (all required exports, no imports) and `test/domain/money.spec.ts` (6 tests, all green).
- `lineTotal` and `grandTotal` also treat NaN price as 0 and truncate fractional prices (whole-number arithmetic).
- `formatVnd` truncates fractional input before grouping.
- Full suite: `test/web/i18n/t.spec.ts` (suite import failure) and one test in `test/migrations/0002_seed_settings.spec.ts` fail; both are outside this task's files.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
