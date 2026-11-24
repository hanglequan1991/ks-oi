# TASK-15: Directory data types and defensive parser

- id: TASK-15
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-4 (type `Fee` from `./fees`)
- size: fits ~8k tokens with context (one module, types + one pure function)

## Acceptance criteria
Covers STORY-11: AC22 (no hotels / bad data -> empty data, no error), AC43 (invalid/skipped rows never appear), AC32/AC33/AC34 (optional fields become empty values, never required).
1. AC43: a hotel without id or name is dropped; a room without type is dropped; the rest still load.
2. AC22: non-object / null / garbage input gives `EMPTY_DATA`-equivalent, never throws.
3. Optional STORY-2 AC14 fields (furniture, floors, roomCount, yearBuilt, beachDistanceM, facilities) may be missing; they parse to ""/null/[].

Data contract note: the JSON shape below is what the STORY-2 import must store (key `directory:v1`, see TASK-17). The Worker KV binding is created by STORY-2 (out of scope here).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/data.ts`. Imports only `import type { Fee } from "./fees";` (Fee = `{percent:number; active:boolean; hotelIds?:string[]|null; validFrom?:string|null; validTo?:string|null}`). Exports exactly:
```ts
export interface Room { id: string; type: string; furniture: string | null; maxGuests: number | null; basePrice: number | null }
export interface Hotel { id: string; name: string; city: string; area: string; address: string; description: string; stars: number | null; facilities: string[]; images: string[]; floors: number | null; roomCount: number | null; yearBuilt: number | null; beachDistanceM: number | null; rooms: Room[] }
export interface Contact { phone: string; zalo: string }
export interface DirectoryData { hotels: Hotel[]; fees: Fee[]; contact: Contact | null }
export const EMPTY_DATA: DirectoryData   // { hotels: [], fees: [], contact: null }
export function parseDirectoryData(raw: unknown): DirectoryData
```
Rules (private helpers `str(v)`, `num(v)`, `strList(v)` recommended):
- `str(v)`: string -> trimmed; number -> `String(v)`; else "". `num(v)`: finite number -> v else null. `strList(v)`: array -> items that are strings, trimmed, non-empty; else [].
- `raw` not a non-null object, or `raw.hotels` not an array -> return `{ hotels: [], fees: [], contact: null }` (a fresh object; fees/contact still parsed if present and valid).
- Hotel kept only when `str(h.id) !== ""` and `str(h.name) !== ""`; first occurrence of a duplicate id wins. Fields: `city`, `area`, `address`, `description` = `str`; `stars` = integer 1..5 else null; `facilities`, `images` = `strList`; `floors`, `roomCount`, `yearBuilt`, `beachDistanceM` = `num`; `rooms`: array items that are objects with `str(r.type) !== ""`; room `id` = `str(r.id)` or `` `${hotelId}-${index}` ``; `furniture` = `str(r.furniture) || null`; `maxGuests` = finite number `>= 1` else null; `basePrice` = finite number `> 0` else null (the room is KEPT with null price, shown later as "price unavailable").
- `fees`: array items that are objects with finite `percent >= 0` and `active === true || active === false`; `hotelIds` = `strList` if an array else null; `validFrom`/`validTo` = `str(...) || null`. Others dropped.
- `contact`: object with `phone`/`zalo` via `str`; if both empty -> `null`.
- Example: `parseDirectoryData({hotels:[{id:"1",name:"A",stars:4,facilities:["Pool"," "],rooms:[{type:"Deluxe",basePrice:1000000,furniture:""},{basePrice:5}]},{id:"",name:"X"},{id:"2"}]})` -> one hotel: id "1", stars 4, facilities ["Pool"], rooms [{id:"1-0",type:"Deluxe",furniture:null,maxGuests:null,basePrice:1000000}], city "" , floors null; fees []; contact null. `parseDirectoryData(null)`, `("x")`, `({})`, `({hotels:"x"})` -> empty data. Room with basePrice "abc" -> basePrice null but room kept. stars 7 or 3.5 -> null.

## Unit tests to write
- [ ] `drops hotels without id or name and duplicate ids, keeps the rest`: covers AC43
- [ ] `drops rooms without type but keeps rooms with invalid price as null`: covers AC43
- [ ] `garbage input returns empty data without throwing`: covers AC22
- [ ] `optional fields missing parse to empty values`: covers AC32, AC33, AC34
- [ ] `stars must be integer 1..5`: covers AC32
- [ ] `fees and contact are parsed, invalid ones dropped, empty contact is null`: covers AC23, AC35

## Files this task may touch
- `sheet-rag/src/lookup/data.ts`
- `sheet-rag/test/lookup/data.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/data.spec.ts`

## Dev notes

## Review

## Questions
