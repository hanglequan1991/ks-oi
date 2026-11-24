# TASK-4: Applicable fee percentage for a hotel

- id: TASK-4
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC23 (the "applicable fees totalling p%" input; STORY-4 AC4-AC6 rules).
1. AC23: total percentage = sum of applicable fee percentages (no compounding, order independent).
2. AC23: a global fee applies to all hotels; a fee limited to hotels applies only to them; an inactive fee or one outside its validity period is not applied.

Note: STORY-4 / STORY-8 may later provide their own fee logic; this module is the read-only calculation the directory needs. If those stories ship an equivalent, the toListHotel (TASK-20) can be switched over; do not touch them here.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/fees.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export interface Fee {
  percent: number;
  active: boolean;
  hotelIds?: string[] | null;   // null/undefined = global; an array (even empty) = only those hotels
  validFrom?: string | null;    // "YYYY-MM-DD", inclusive, null/""/undefined = no start
  validTo?: string | null;      // "YYYY-MM-DD", inclusive, null/""/undefined = no end
}
export function totalFeePercent(fees: Fee[], hotelId: string, today: string): number
```
- A fee applies when ALL hold: `active === true`; `percent` is finite and `>= 0`; `hotelIds` is null/undefined or includes `hotelId`; `validFrom` empty or `validFrom <= today` (plain string comparison); `validTo` empty or `today <= validTo`.
- Result = sum of applying percents, rounded with `Math.round(sum * 1e6) / 1e6`. No applicable fee -> 0. Order of `fees` never matters. No cap.
- Examples (today = "2026-11-24"): [{percent:10,active:true}] -> 10; [{percent:5,active:true},{percent:2.5,active:true}] -> 7.5; [{percent:10,active:false}] -> 0; [{percent:10,active:true,hotelIds:["h2"]}] for "h1" -> 0, for "h2" -> 10; hotelIds [] -> 0 for everyone; validTo "2026-11-23" -> 0; validFrom "2026-11-25" -> 0; validFrom "2026-11-24" -> applies; percent -3 -> ignored; [] -> 0.

## Unit tests to write
- [ ] `sums all applicable percentages without compounding`: covers AC23
- [ ] `ignores inactive fees`: covers AC23
- [ ] `global vs hotel-limited fees (incl. empty hotelIds)`: covers AC23
- [ ] `respects validFrom/validTo inclusive bounds`: covers AC23
- [ ] `ignores invalid percent, empty list gives 0, order independent`: covers AC23

## Files this task may touch
- `sheet-rag/src/lookup/fees.ts`
- `sheet-rag/test/lookup/fees.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/fees.spec.ts`

## Dev notes

## Review

## Questions
