# TASK-8: Shared Disclaimer, FeeNote and PriceBlock components

- id: TASK-8
- story: [STORY-16](../stories/STORY-16.md)
- type: frontend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-7 (`t`, `format`, `Lang`), TASK-5 (`SiteSettings` type), TASK-6 (JSX setup)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Section 11.5 lists `Disclaimer` and `PriceBlock` components; decision 2026-11-18: every price shows the call-to-confirm disclaimer (vi/en) and the fee note is switchable. These are the only components that print a price, so other pages cannot forget them. `web/` may import `domain/` and `db/` (read); import only the type `SiteSettings` from `src/db/settings.ts`.

Components (Hono JSX, default-free named exports, no inline scripts or `style` attributes because the CSP forbids inline styles):
- `Disclaimer({ lang, settings })`: `<p class="disclaimer" data-disclaimer role="note">` with `settings.disclaimerVi` or `settings.disclaimerEn` by language; if the chosen text is empty it falls back to the other language's text; if both are empty it throws `Error('disclaimer text missing')` so a broken seed is noticed rather than silently dropping the notice.
- `FeeNote({ lang, settings })`: renders `<small class="fee-note" data-fee-note>` with `format(t(lang,'price.feeNote'), {percent: settings.serviceFeePercent})` when `settings.showFeeNote` is true, otherwise renders nothing.
- `PriceBlock({ lang, settings, amount, edited? })`: `<span class="price" data-price>` with the amount formatted for VND (`vi`: `1.375.000 ₫`, `en`: `1,375,000 VND`; produce it with `Intl.NumberFormat` and the `price.currencyUnit` key, no hard-coded separators), followed by `<FeeNote>`. It does NOT print the disclaimer itself (a page prints it once; TASK-9 enforces it). When `amount` is `null` it prints nothing (unpriced room).
- Export `formatPrice(amount, lang)` from `PriceBlock.tsx` for tests and for STORY-11 to reuse.

## Acceptance criteria
1. AC7: `Disclaimer` renders the Vietnamese text for `vi` and the English text for `en`, taken from settings (test uses distinct sample strings, not the production seed), and contains `data-disclaimer`.
2. AC7 (safety): empty chosen-language text falls back to the other language; both empty throws.
3. AC8: With `showFeeNote` true and fee 10, `PriceBlock` output in English contains `Includes 10% service fee`; in Vietnamese contains `10%` and the Vietnamese fee note; with `showFeeNote` false it contains neither; the percentage follows `settings.serviceFeePercent` (test 12.5 shows `12.5%`).
4. AC8: `PriceBlock` always contains `data-price`; with `amount = null` it renders an empty string.
5. AC1 / AC2: formatting follows the page language (`formatPrice(1375000,'vi')` contains `1.375.000`; `'en'` contains `1,375,000`).
6. Output escapes text: a disclaimer containing `<b>` is rendered escaped, not as HTML.

## Unit tests to write
All in `test/web/pages/components.spec.tsx`.
- [ ] `Disclaimer shows the text of the page language`: covers AC7
- [ ] `Disclaimer falls back to the other language and throws when both are empty`: covers AC7 (safety)
- [ ] `Disclaimer escapes html`: covers AC6 (escaping)
- [ ] `FeeNote appears only when the flag is on and uses the percentage`: covers AC8
- [ ] `PriceBlock includes the formatted amount, data-price and the fee note`: covers AC8, AC4
- [ ] `PriceBlock renders nothing for a null amount`: covers AC4
- [ ] `formatPrice follows the language`: covers AC5

## Files this task may touch
- `sheet-rag/src/web/pages/components/Disclaimer.tsx` (new)
- `sheet-rag/src/web/pages/components/FeeNote.tsx` (new)
- `sheet-rag/src/web/pages/components/PriceBlock.tsx` (new)
- `sheet-rag/test/web/pages/components.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
