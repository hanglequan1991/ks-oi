# TASK-14: HTML escaping and safe URLs

- id: TASK-14
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC40 (sheet content shown as imported, i.e. escaped text, not translated and not interpreted as HTML), AC30 (image URLs from the sheet: only safe http(s) URLs are used), AC35 (contact links).
1. AC40: `escapeHtml` makes any sheet text safe inside HTML text and quoted attributes while keeping it visually identical.
2. AC30: `safeUrl` accepts only http/https URLs; anything else yields null (the image is skipped).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/escape.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export function escapeHtml(value: unknown): string
export function safeUrl(value: unknown): string | null
```
- `escapeHtml`: null/undefined -> ""; otherwise `String(value)` with `&`->`&amp;`, `<`->`&lt;`, `>`->`&gt;`, `"`->`&quot;`, `'`->`&#39;` (replace `&` first / use one regex with a map so nothing is double-escaped). Vietnamese letters are untouched. Examples: `escapeHtml('<b>"Đà" & \'x\'</b>')` -> `&lt;b&gt;&quot;Đà&quot; &amp; &#39;x&#39;&lt;/b&gt;`; escapeHtml(null) -> ""; escapeHtml(12) -> "12"; escapeHtml("Đà Nẵng") -> "Đà Nẵng".
- `safeUrl`: non-string -> null; trim; matches `/^https?:\/\/[^\s]+$/i` -> return the trimmed string, else null. Examples: " https://x.com/a.jpg " -> "https://x.com/a.jpg"; "HTTP://a.b/c" -> "HTTP://a.b/c"; "javascript:alert(1)" -> null; "//x.com/a.jpg" -> null; "data:image/png;base64,AAA" -> null; "" -> null; "https://a b" -> null; 5 -> null.
- The caller still runs `escapeHtml` on a safe URL before putting it in an attribute.

## Unit tests to write
- [ ] `escapeHtml escapes the five special characters, no double escape`: covers AC40
- [ ] `escapeHtml handles null/undefined/number and keeps Vietnamese text`: covers AC40
- [ ] `safeUrl accepts http/https and trims`: covers AC30
- [ ] `safeUrl rejects javascript:, data:, relative, spaces and non-strings`: covers AC30, AC35

## Files this task may touch
- `sheet-rag/src/lookup/escape.ts`
- `sheet-rag/test/lookup/escape.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/escape.spec.ts`

## Dev notes

## Review

## Questions
