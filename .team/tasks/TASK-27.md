# TASK-27: Billing page dictionary group (`bill` in vi.ts and en.ts)

- id: TASK-27
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-7 (creates `vi.ts`, `en.ts`, `t.ts` and the key-parity test). Shared files: this is the only STORY-11 task that edits `vi.ts` and `en.ts`; do not run in parallel with any other task that edits them.
- size: fits a 100k-token context (two dictionary edits and one small test)

## Why
Technical design 18.9: labels live in the shared dictionaries under a `bill` group, and the existing parity test (TASK-7) covers them. Decision Q2 (recorded in STORY-11): the note label is only "NOTE" / "GHI CHÚ" with **no row number**, on desktop, mobile and print. Keys are fixed here because the page (TASK-37) and the client (TASK-35, TASK-36) rely on the exact names. Placeholders use `{n}` (row number), `{max}` (row limit), `{date}`. No phone, Zalo or call wording anywhere. The disclaimer is not a key (it comes from settings).

Add a `bill` group to both files with these keys (real Vietnamese with diacritics, natural English):
`title`, `intro`, `privacyNote` (the draft and notes stay only in this browser and are never sent to the server), `noscript` (JavaScript is required), `colIndex` (`#`), `colHotel`, `colRoom`, `colNight`, `colPricing`, `colTotal`, `noteLabel` (en `NOTE`, vi `GHI CHÚ`, no placeholder), `notePlaceholder`, `hotelPlaceholder`, `roomPlaceholder`, `pricePlaceholder`, `hotelAria` (`Hotel, row {n}`), `roomAria`, `nightAria`, `priceAria`, `noteAria` (`Note, row {n}`), `totalAria`, `rowLabel` (`Row {n}`, used on mobile cards), `removeRow`, `removeRowAria` (`Remove row {n}`), `addRow`, `addRowLimit` (`Maximum {max} rows`), `clearAll`, `clearConfirm`, `clearDraft`, `draftSaved`, `draftRestored` (restored, prices may have changed), `edited`, `useDefault` (`Use default price`), `enterPrice`, `grandTotal`, `print` (`Print / Save PDF`), `printTitle`, `printDate` (`Date: {date}`), `noResults`, `loadFailed` (could not load, type it freely), `listboxHotel`, `listboxRoom`.

## Acceptance criteria
1. AC1 / AC2: Every key above exists in both languages with the same `{placeholders}` (the TASK-7 parity test still passes) and no empty value; Vietnamese strings contain diacritics where the word needs them (spot check: `bill.colHotel` vi is `Khách sạn`).
2. AC8: `bill.noteLabel` is exactly `NOTE` in English and `GHI CHÚ` in Vietnamese and contains no `{`.
3. AC40: `bill.noscript` in both languages mentions JavaScript.
4. AC35 / Version 1 scope: no string in the `bill` group (either language) contains `phone`, `zalo`, `call`, `gọi`, `điện thoại` or a digit sequence that looks like a phone number.
5. AC26 / AC27: `bill.addRowLimit` contains `{max}` and `bill.removeRowAria` contains `{n}` in both languages.

## Unit tests to write
In `test/web/i18n/bill-keys.spec.ts` (the TASK-7 parity test is not edited; run it as well).
- [ ] `every bill key exists in both languages`: covers AC1
- [ ] `note label has no row number`: covers AC8
- [ ] `noscript text mentions JavaScript in both languages`: covers AC40
- [ ] `no phone, zalo or call wording in bill texts`: covers AC4
- [ ] `limit and row placeholders are present`: covers AC5

## Files this task may touch
- `sheet-rag/src/web/i18n/vi.ts`
- `sheet-rag/src/web/i18n/en.ts`
- `sheet-rag/test/web/i18n/bill-keys.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Added `bill` group (all 45 keys from the list) to `vi.ts` and `en.ts`. Keys are the exact names listed above.
- New spec `test/web/i18n/bill-keys.spec.ts` (5 tests, one per AC). Red before the dictionary edit (4 failed), green after.
- Full suite: 25 files, 154 tests passed. TASK-7 parity test untouched and passing.
- Placeholder strings use `{n}`, `{max}`, `{date}` only. No phone, Zalo or call wording.

## Review
Verdict: approve

- Tests: full unit suite passes (28 files, 182 tests), including the TASK-7 parity test and the 5 new tests in `bill-keys.spec.ts`.
- Checked `vi.ts` and `en.ts` by eye: all 42 listed keys exist in both languages with the same `{n}`, `{max}`, `{date}` placeholders; `noteLabel` is exactly `NOTE` / `GHI CHÚ` with no placeholder; `colHotel` vi is `Khách sạn`; both `noscript` texts mention JavaScript; no phone, Zalo or call wording.
- Minor, no action: dev notes say 45 keys, the list has 42 (the spec checks the 42).
- Only the three listed files changed.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
