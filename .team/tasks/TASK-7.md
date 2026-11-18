# TASK-7: Language dictionaries and language helpers (src/web/i18n)

- id: TASK-7
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-6 (test globs and `hono` not needed here, but the `test/web` glob is)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Technical design section 12: `vi.ts` and `en.ts` export the same typed key set, a unit test fails when a key is missing from either file, Vietnamese at `/`, English under `/en/`. Pure code, no I/O, no JSX. Later stories (billing STORY-11) add their own `bill` group to these files; this task creates the shared groups only.

Required exports:
- `src/web/i18n/vi.ts`: `export const vi = { ... } as const-shaped object` (nested groups; leaf values are strings).
- `src/web/i18n/en.ts`: `export const en: Dict` where `Dict` is the shape of `vi` with string leaves (`export type Dict = DeepStrings<typeof vi>` exported from `t.ts`), so TypeScript also fails on a missing key.
- `src/web/i18n/t.ts`: `type Lang = 'vi' | 'en'`; `LANGS`; `DEFAULT_LANG = 'vi'`; `t(lang, key)` (dot path such as `price.feeNote`; unknown key returns the key itself); `format(template, vars)` replaces `{name}` placeholders; `langFromPath(path): Lang` (`/en` and `/en/...` give `en`, everything else `vi`; `/english` is `vi`); `stripLangPrefix(path)` (`/en/bill` gives `/bill`, `/en` gives `/`); `pathForLang(path, lang)` (language-neutral or prefixed path in, matching path out: `('/bill','en')` gives `/en/bill`, `('/en/bill','vi')` gives `/bill`, `('/','en')` gives `/en/`, `('/en/','vi')` gives `/`).

Keys to create (both languages, real Vietnamese with diacritics, English natural):
- `common.siteName`, `common.langVi` ("Tiếng Việt"/"Vietnamese"), `common.langEn` ("English"/"English"), `common.switchToVi`, `common.switchToEn`, `common.skipToContent`
- `price.feeNote` with placeholder `{percent}`: en "Includes {percent}% service fee"; vi "Đã bao gồm {percent}% phí dịch vụ"; `price.currencyUnit` ("₫"/"VND"), `price.perNight`
- `errors.tooManyRequests`, `errors.inputTooLong`, `errors.notFound`, `errors.generic`

The disclaimer text is NOT a dictionary key: it comes from the `settings` table (TASK-3/TASK-5).

## Acceptance criteria
1. AC6: Every leaf key present in `vi` is present in `en` and the other way round (recursive comparison); no leaf is an empty string; both languages have the same `{placeholder}` names in each string.
2. AC1 / AC2: `langFromPath('/bill') === 'vi'`, `langFromPath('/en/bill') === 'en'`, `langFromPath('/en') === 'en'`, `langFromPath('/english') === 'vi'`.
3. AC4: `DEFAULT_LANG === 'vi'` and `langFromPath('/')` is `vi`.
4. AC8 (text part): `format(t('en','price.feeNote'), {percent: 10})` is exactly `Includes 10% service fee`; the Vietnamese version contains `10%`.
5. Path helpers `stripLangPrefix` and `pathForLang` behave as in the examples above, including query strings being left to the caller (functions take a pathname only).

## Unit tests to write
- [ ] `test/web/i18n-keys.spec.ts` > `vi and en have the same keys`: covers AC6
- [ ] `test/web/i18n-keys.spec.ts` > `no empty strings and same placeholders`: covers AC6
- [ ] `test/web/i18n/t.spec.ts` > `langFromPath detects the language prefix`: covers AC1, AC2
- [ ] `test/web/i18n/t.spec.ts` > `default language is Vietnamese`: covers AC4
- [ ] `test/web/i18n/t.spec.ts` > `fee note text formats with the percentage`: covers AC8 (text part)
- [ ] `test/web/i18n/t.spec.ts` > `t returns the key for unknown keys`: covers AC6 (safety)
- [ ] `test/web/i18n/t.spec.ts` > `stripLangPrefix and pathForLang round-trip`: covers AC5

## Files this task may touch
- `sheet-rag/src/web/i18n/vi.ts` (new)
- `sheet-rag/src/web/i18n/en.ts` (new)
- `sheet-rag/src/web/i18n/t.ts` (new)
- `sheet-rag/test/web/i18n-keys.spec.ts` (new)
- `sheet-rag/test/web/i18n/t.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
