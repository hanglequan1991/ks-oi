# TASK-4: Domain pricing (finalPrice and fee setting parsing)

- id: TASK-4
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-1 (test runner only; no file overlap with TASK-2 or TASK-3, so it can run in parallel with them)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Pure, I/O-free domain code from technical-design.html section 9 that turns the stored setting strings into the values the application uses. TASK-5 imports it. `src/domain/` may import nothing outside itself (section 3.4). The billing and API stories reuse `finalPrice`.

Required exports in `sheet-rag/src/domain/pricing.ts`:
- `DEFAULT_FEE_PERCENT = 10`
- `finalPrice(base: number, feePercent: number): number` exactly as in section 9 (clamp fee to 0..100, round to nearest 1,000 VND).
- `parseFeePercent(raw: string | null | undefined): { percent: number; warning?: string }`: a finite numeric string gives that number clamped to 0..100; missing, empty or non-numeric gives `DEFAULT_FEE_PERCENT` plus a `warning` message (the caller logs it; this function does not log).
- `parseBoolSetting(raw: string | null | undefined, fallback: boolean): boolean`: `'true'` and `'1'` give true, `'false'` and `'0'` give false (case-insensitive, trimmed), anything else gives `fallback`.

## Acceptance criteria
Supports STORY-13 AC3 and AC10 (the application receives a valid fee percentage and fee-note flag from the stored strings).
1. AC-P1: `finalPrice(1_250_000, 10) === 1_375_000`; `finalPrice(1_000_000, 0) === 1_000_000`; rounding to the nearest 1,000: `finalPrice(1_234_000, 10) === 1_357_000` (1,357,400 rounds down) and `finalPrice(1_235_000, 10) === 1_359_000` (1,358,500 rounds up).
2. AC-P2: A fee above 100 behaves as 100; a negative fee behaves as 0.
3. AC-P3 (AC3, AC10): `parseFeePercent('10')` gives 10 with no warning; `'12.5'` gives 12.5; `' 15 '` gives 15; `'150'` gives 100; `'-5'` gives 0.
4. AC-P4 (AC10): `parseFeePercent('abc')`, `''`, `null` and `undefined` give 10 and a non-empty `warning`.
5. AC-P5 (AC3, AC10): `parseBoolSetting` handles `'true'`, `'TRUE'`, `' true '`, `'1'` as true; `'false'`, `'0'` as false; `'maybe'`, `''`, `null` return the fallback.

## Unit tests to write
All in `test/domain/pricing.spec.ts`.
- [ ] `finalPrice adds 10 percent and rounds to the nearest 1000`: covers AC-P1
- [ ] `finalPrice with zero fee returns the base rounded`: covers AC-P1
- [ ] `finalPrice clamps fee to 0..100`: covers AC-P2
- [ ] `parseFeePercent parses and clamps numeric strings`: covers AC-P3
- [ ] `parseFeePercent falls back to 10 with a warning on bad input`: covers AC-P4
- [ ] `parseBoolSetting accepts true/false variants and uses the fallback otherwise`: covers AC-P5

## Files this task may touch
- `sheet-rag/src/domain/pricing.ts` (new)
- `sheet-rag/test/domain/pricing.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Implemented `src/domain/pricing.ts` (finalPrice, parseFeePercent, parseBoolSetting, DEFAULT_FEE_PERCENT) and `test/domain/pricing.spec.ts` (6 tests, one per unit test in the list, AC-P1..P5 covered).
- `pricing.spec.ts`: 6/6 pass. Red run failed on missing module before implementation.
- Full unit run: `test/web/smoke.spec.tsx` fails to load (outside this task's files, not touched by dev TASK-4).
- Status left as `in-progress` for pm to set `review`.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
