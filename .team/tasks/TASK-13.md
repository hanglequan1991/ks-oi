# TASK-13: Language preference get/set (injectable storage)

- id: TASK-13
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC38 (default vi; saved choice applied; storage = localStorage injected by the caller), AC39 (missing/invalid -> vi).
1. AC38: no saved value -> "vi"; after `setLanguage(storage,"en")` -> `getLanguage` returns "en".
2. AC39: missing, invalid, or storage that throws/is unavailable -> "vi".

Note: the browser inline script in TASK-19 mirrors this logic (same key `hd.lang`, same values); keep them identical.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/language.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export type Lang = "vi" | "en";
export const DEFAULT_LANG: Lang = "vi";
export const LANG_STORAGE_KEY = "hd.lang";
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function getLanguage(storage: StorageLike | null | undefined): Lang
export function setLanguage(storage: StorageLike | null | undefined, lang: string): boolean
export function createMemoryStorage(): StorageLike
```
- `getLanguage`: null/undefined storage -> "vi". Else `try { v = storage.getItem(LANG_STORAGE_KEY) } catch { return "vi" }`; `v === "en"` -> "en"; `v === "vi"` -> "vi"; anything else (null, "EN", "fr", "") -> "vi" (exact, case-sensitive match).
- `setLanguage`: returns `true` only when `lang` is exactly "vi" or "en", storage is present and `setItem(LANG_STORAGE_KEY, lang)` did not throw; otherwise `false` and nothing is written for an invalid `lang`.
- `createMemoryStorage`: in-memory `StorageLike` backed by a `Map<string,string>` (getItem returns null when missing) - the fallback when real localStorage is unavailable.
- Examples: empty memory storage -> "vi"; after setLanguage(s,"en") -> "en"; setLanguage(s,"fr") -> false and getLanguage still "vi"; storage whose getItem throws -> "vi"; storage whose setItem throws -> setLanguage returns false; storage holding "xx" -> "vi".

## Unit tests to write
- [ ] `default language is vi when nothing saved or storage null`: covers AC38
- [ ] `setLanguage en then getLanguage returns en; vi round trip`: covers AC38
- [ ] `invalid saved value falls back to vi`: covers AC39
- [ ] `throwing storage falls back to vi and set returns false`: covers AC39
- [ ] `setLanguage rejects invalid lang without writing`: covers AC39
- [ ] `createMemoryStorage get/set behaviour`: covers AC38

## Files this task may touch
- `sheet-rag/src/lookup/language.ts`
- `sheet-rag/test/lookup/language.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/language.spec.ts`

## Dev notes

## Review

## Questions
