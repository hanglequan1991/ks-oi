# TASK-10: Facility tag truncation ("+N")

- id: TASK-10
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC29.
1. AC29: card shows the first few tags and an extra count "+N"; the detail page shows all (it simply does not call this function).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/tags.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export const CARD_TAG_LIMIT = 4;
export function splitTags(tags: Array<string | null | undefined> | null | undefined, max: number = CARD_TAG_LIMIT): { shown: string[]; extra: number }
```
- Trim each tag; drop null/undefined/empty. No dedupe, order kept. `max` not a finite number or `< 0` -> `CARD_TAG_LIMIT`; non-integer is floored.
- `shown` = first `max` tags; `extra` = remaining count (>= 0).
- Examples: splitTags(["Pool","Parking","Gym"]) -> {shown:["Pool","Parking","Gym"], extra:0}; 6 tags t1..t6 -> {shown:[t1..t4], extra:2}; splitTags([" Pool ","", null]) -> {shown:["Pool"],extra:0}; splitTags(null) -> {shown:[],extra:0}; splitTags(["a","b","c"],2) -> {shown:["a","b"],extra:1}; splitTags(["a"],NaN) -> {shown:["a"],extra:0}.

## Unit tests to write
- [ ] `splitTags shows all when within limit, extra 0`: covers AC29
- [ ] `splitTags returns first 4 and extra count`: covers AC29
- [ ] `splitTags trims, drops empty/null, handles null input, custom/invalid max`: covers AC29

## Files this task may touch
- `sheet-rag/src/lookup/tags.ts`
- `sheet-rag/test/lookup/tags.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/tags.spec.ts`

## Dev notes

## Review

## Questions
