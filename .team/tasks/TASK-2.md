# TASK-2: Final price calculation and VND formatting

- id: TASK-2
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC23, AC24 (formatting), AC25 (invalid price -> null).
1. AC23: final = base x (1 + p/100) rounded to the nearest 1,000 VND (1,000,000 @10% -> 1,100,000; 1,234,000 @5% -> 1,296,000).
2. AC24: amounts are formatted in VND with dot thousands separators.
3. AC25: a missing / non-numeric / non-positive base price gives no price (null).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/price.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export function computeFinalPrice(basePrice: number | null | undefined, totalFeePercent?: number | null): number | null
export function formatVnd(amount: number): string
```
- `computeFinalPrice`: return `null` if `basePrice` is not a finite number or is `<= 0`. `totalFeePercent` null/undefined = 0; if it is not finite or `< 0` return `null`. Else `raw = basePrice * (100 + p) / 100`; `rounded = Math.round(raw / 1000) * 1000` (halves round up); if `rounded <= 0` return `null`; else return `rounded`. Examples: (1000000, 10) -> 1100000; (1234000, 5) -> 1296000; (1000000) -> 1000000; (1000000, 0) -> 1000000; (1500, 0) -> 2000; (1499, 0) -> 1000; (400, 0) -> null; (0) -> null; (-5) -> null; (NaN) -> null; (null) -> null; (1000000, -1) -> null.
- `formatVnd(amount)`: `Math.round(amount)` as digits, thousands separated by "." then a normal space (U+0020) then "₫" (U+20AB). Use `String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")`. Examples: 1100000 -> "1.100.000 ₫"; 500 -> "500 ₫"; 0 -> "0 ₫"; 12345678 -> "12.345.678 ₫".
- The module never shows or returns the base price separately; no other exports.

## Unit tests to write
- [ ] `computeFinalPrice applies percent and rounds to 1000`: covers AC23 (both examples)
- [ ] `computeFinalPrice with no fee returns rounded base`: covers AC23
- [ ] `computeFinalPrice rounds half up at 1000 boundary`: covers AC23
- [ ] `computeFinalPrice returns null for invalid base or percent`: covers AC25
- [ ] `formatVnd uses dot separators and trailing space + ₫`: covers AC24

## Files this task may touch
- `sheet-rag/src/lookup/price.ts`
- `sheet-rag/test/lookup/price.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/price.spec.ts`

## Dev notes

## Review

## Questions
