# TASK-31: Display helpers (src/client/bill/format.ts)

- id: TASK-31
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-26 (`parseVnd`, `formatVnd`, `parseNights`, `MAX_PRICE_DIGITS`), TASK-6 (test glob)
- size: fits a 100k-token context (one small pure file)

## Why
The input boxes must show thousand separators while the visitor types without moving the caret to the end, and the page needs a few text helpers. The client may not import `src/web/i18n` (design 3.4), so the template filler lives here. Pure functions, no DOM.

Exports of `sheet-rag/src/client/bill/format.ts`:
```ts
export type Lang = 'vi' | 'en';
export const separatorFor = (lang: Lang): string => (lang === 'en' ? ',' : '.');
export function reformatPriceInput(raw: string, caret: number, lang: Lang): { text: string; caret: number; value: number | null };
// value = parseVnd(raw); text = value === null ? '' : formatVnd(value, sep); caret keeps its position counted in digits
// (the number of digits left of the caret stays the same; caret clamps to text length). 11th digit typed: ignored, caret stays.
export function totalLabel(total: number | null, lang: Lang): string;   // null -> '—' (em dash); else formatVnd(total, sep)
export function priceLabel(price: number | null, lang: Lang): string;   // null -> ''; else formatVnd
export function fillTemplate(template: string, vars: Record<string, string | number>): string;  // replaces {name}; unknown placeholders stay; values are inserted literally (no recursion, `$&` and `$1` have no special meaning)
export function dateLabel(date: Date, lang: Lang): string;              // vi: dd/mm/yyyy, en: yyyy-mm-dd; uses local date parts; no Intl dependency
export function nightsText(raw: string): { text: string; value: number | null };  // digits only, at most 3, from parseNights
```

## Acceptance criteria
1. AC20: typing `1375000` gives text `1.375.000` (vi) and `1,375,000` (en); typing `12a3` gives `123`; an 11-digit paste gives a value capped to 1,000,000,000 and the text `1.000.000.000`.
2. AC20 (caret): with raw `1.3750` and caret 5 (after the 4th digit) the new caret is after the same 4th digit in `13.750` (position 6); deleting everything gives text `''`, value null, caret 0.
3. AC18: `totalLabel(null,'vi')` is `—`; `totalLabel(0,'vi')` is `0`; `totalLabel(2750000,'en')` is `2,750,000`.
4. AC19: `nightsText('abc')` gives text `''` and value null; only ASCII digits count, leading zeros are removed (`'0012'` gives `12`), at most 3 digits are read (`'1234'` gives `123`), the value stays inside 1..365 (`'999'` gives value 365 and text `365`); empty input gives text `''` and null (the wiring restores 1 on blur).
5. AC36: `dateLabel(new Date(2026, 10, 18), 'vi')` is `18/11/2026`; `'en'` gives `2026-11-18`.
6. AC10: `fillTemplate('Hotel, row {n}', {n: 3})` is `Hotel, row 3`; a value containing `<b>` or `$&` is inserted literally (escaping for markup is not needed here because the wiring uses `textContent`); a missing variable leaves `{n}` unchanged.

## Unit tests to write
In `test/client/bill-format.spec.ts`.
- [ ] `price input shows separators for each language and caps length`: covers AC1
- [ ] `caret stays after the same digit`: covers AC2
- [ ] `total label shows a dash only when there is no price`: covers AC3
- [ ] `nights text keeps up to 3 digits within 1 to 365`: covers AC4
- [ ] `date label per language`: covers AC5
- [ ] `fillTemplate inserts values literally`: covers AC6

## Files this task may touch
- `sheet-rag/src/client/bill/format.ts` (new)
- `sheet-rag/test/client/bill-format.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
