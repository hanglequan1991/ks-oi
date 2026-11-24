# TASK-20: Hotel to list item (final "From" price)

- id: TASK-20
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-2, TASK-3, TASK-4, TASK-15
- size: fits ~8k tokens with context (one small module)

## Acceptance criteria
Covers STORY-11: AC23, AC24, AC25 (+ AC26: the base price is never exposed).
1. AC23/AC24: `fromPrice` = lowest final price over the hotel's rooms, final = base x (1 + applicable fees%) rounded to 1,000.
2. AC25: no valid room price (or no rooms) -> `fromPrice` null; the hotel is still returned.
3. AC26: the returned object has no base price or fee fields.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/cards.ts`. Imports (all exist after earlier tasks):
```ts
import type { Hotel } from "./data";           // Hotel { id,name,city,area,stars:number|null,facilities:string[],rooms:{basePrice:number|null}[], ... }
import type { Fee } from "./fees";
import { totalFeePercent } from "./fees";      // totalFeePercent(fees: Fee[], hotelId: string, today: string): number
import { computeFinalPrice } from "./price";   // computeFinalPrice(base: number|null|undefined, pct?: number|null): number|null
import { lowestPrice } from "./rooms";         // lowestPrice(prices: Array<number|null|undefined>): number|null
```
Exports exactly:
```ts
export interface ListHotel { id: string; name: string; city: string; area: string; stars: number | null; facilities: string[]; fromPrice: number | null }
export function toListHotel(hotel: Hotel, fees: Fee[], today: string): ListHotel
```
- `pct = totalFeePercent(fees, hotel.id, today)`; `fromPrice = lowestPrice(hotel.rooms.map(r => computeFinalPrice(r.basePrice, pct)))`; other fields copied (`facilities` copied as a new array). Return exactly these 7 keys.
- Examples: rooms base [1000000, 1234000], fees [{percent:10,active:true}] -> fromPrice 1100000; rooms base [1234000], fee 5% -> 1296000; rooms [] -> null; rooms [{basePrice:null}] -> null; hotel-limited fee for another hotel id -> not applied; result `Object.keys` equal `["id","name","city","area","stars","facilities","fromPrice"]` (no "basePrice", no "rooms").

## Unit tests to write
- [ ] `fromPrice is the cheapest room final price including fees`: covers AC23, AC24
- [ ] `rounds to nearest 1000`: covers AC23
- [ ] `no rooms or invalid prices give null and hotel is still returned`: covers AC25
- [ ] `result exposes no base price, rooms or fee fields`: covers AC26
- [ ] `fee limited to another hotel is not applied`: covers AC23

## Files this task may touch
- `sheet-rag/src/lookup/cards.ts`
- `sheet-rag/test/lookup/cards.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/cards.spec.ts`

## Dev notes

## Review

## Questions
