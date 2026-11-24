# TASK-9: Paging (12 per page) and empty-state decision

- id: TASK-9
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC19, AC20 (restart = pagesShown back to 1, enforced by TASK-16/21), AC21, AC22 (state decision).
1. AC19: only `pagesShown * 12` first items are visible; "Load more" shown only while more remain.
2. AC21: no match -> "no-match" state (no load more).
3. AC22: no hotels at all -> "no-data" state.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/paging.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export const PAGE_SIZE = 12;
export function visibleCount(total: number, pagesShown: number, pageSize: number = PAGE_SIZE): number
export function hasMore(total: number, pagesShown: number, pageSize: number = PAGE_SIZE): boolean
export function pageItems<T>(items: T[], pagesShown: number, pageSize: number = PAGE_SIZE): T[]
export type ListState = "no-data" | "no-match" | "list";
export function listState(totalHotels: number, matchedHotels: number): ListState
```
- `pagesShown` that is not a finite number or `< 1` counts as 1; non-integer is floored. `total < 0` or non-finite counts as 0.
- `visibleCount` = `Math.min(total, pages * pageSize)`. `hasMore` = `visibleCount(...) < total`. `pageItems` = `items.slice(0, visibleCount(items.length, ...))` (new array).
- `listState`: `totalHotels <= 0` -> "no-data"; else `matchedHotels <= 0` -> "no-match"; else "list".
- Examples: visibleCount(30,1)=12; visibleCount(30,2)=24; visibleCount(30,3)=30; visibleCount(5,1)=5; visibleCount(0,1)=0; visibleCount(30,0)=12; visibleCount(30,NaN)=12; hasMore(30,2)=true; hasMore(30,3)=false; hasMore(12,1)=false; hasMore(13,1)=true; hasMore(0,1)=false; listState(0,0)="no-data"; listState(10,0)="no-match"; listState(10,3)="list".

## Unit tests to write
- [ ] `PAGE_SIZE is 12 and visibleCount grows per page`: covers AC19
- [ ] `hasMore true until all shown`: covers AC19
- [ ] `pageItems returns first page then more, new array`: covers AC19
- [ ] `invalid pagesShown falls back to 1`: covers AC20
- [ ] `listState no-data / no-match / list`: covers AC21, AC22

## Files this task may touch
- `sheet-rag/src/lookup/paging.ts`
- `sheet-rag/test/lookup/paging.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/paging.spec.ts`

## Dev notes

## Review

## Questions
