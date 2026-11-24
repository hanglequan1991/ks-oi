# TASK-3: "From" price and room ordering

- id: TASK-3
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC24 (From = cheapest room final price), AC25 (no valid price -> null), AC33 (rooms ordered by final price ascending).
1. AC24: `lowestPrice` returns the lowest valid final price among a hotel's rooms.
2. AC25: with no valid price it returns `null`.
3. AC33: `sortRoomsByPrice` orders rooms by final price ascending; rooms without a valid price last.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/rooms.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export function lowestPrice(prices: Array<number | null | undefined>): number | null
export function sortRoomsByPrice<T extends { finalPrice: number | null }>(rooms: T[]): T[]
```
- A price is valid when `typeof p === "number"`, finite and `> 0`.
- `lowestPrice`: min of valid prices, `null` if none (also for empty array). Examples: [1300000, 900000, null] -> 900000; [null, undefined, 0, NaN] -> null; [] -> null.
- `sortRoomsByPrice`: returns a NEW array (input not mutated), valid prices ascending, invalid last, stable for equal prices. Example: finalPrice [3, null, 1, 2] -> [1, 2, 3, null]; equal prices keep input order.

## Unit tests to write
- [ ] `lowestPrice picks cheapest valid`: covers AC24
- [ ] `lowestPrice returns null when none valid or empty`: covers AC25
- [ ] `sortRoomsByPrice ascending, invalid last, stable, no mutation`: covers AC33

## Files this task may touch
- `sheet-rag/src/lookup/rooms.ts`
- `sheet-rag/test/lookup/rooms.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/rooms.spec.ts`

## Dev notes

## Review

## Questions
