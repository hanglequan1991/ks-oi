# TASK-26: Hotel detail view model

- id: TASK-26
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-2, TASK-3, TASK-4, TASK-7, TASK-11, TASK-12, TASK-14, TASK-15, TASK-20
- size: fits ~8k tokens with context (one composing module, signatures only as context)

## Acceptance criteria
Covers STORY-11: AC23, AC25, AC26 (no base price in the model), AC30 (only safe image URLs), AC32 (empty fields omitted: represented as ""/[]/null), AC33 (rooms sorted by final price asc, furniture null when empty), AC34, AC35, AC36.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/detailModel.ts`. Imports (signatures from earlier tasks):
```ts
import type { DirectoryData } from "./data";             // { hotels: Hotel[]; fees: Fee[]; contact: {phone:string; zalo:string} | null }; Hotel { id,name,city,area,address,description:string; stars:number|null; facilities:string[]; images:string[]; floors,roomCount,yearBuilt,beachDistanceM: number|null; rooms: {id,type:string; furniture:string|null; maxGuests:number|null; basePrice:number|null}[] }
import { totalFeePercent } from "./fees";                // (fees, hotelId, today) => number
import { computeFinalPrice, formatVnd } from "./price";  // (base, pct) => number|null ; (n) => "1.100.000 ₫"
import { sortRoomsByPrice } from "./rooms";              // <T extends {finalPrice:number|null}>(rooms: T[]) => T[]  (asc, null last)
import { buildingItems } from "./building";              // (info) => {key,display}[]; info = {floors,roomCount,yearBuilt,beachDistanceM}
import type { BuildingItem } from "./building";
import { toListHotel } from "./cards";                   // (hotel, fees, today) => ListHotel {id,name,city,area,stars,facilities,fromPrice}
import { sortHotels } from "./sort";                     // (hotels, "name") => sorted copy
import { moreInCity } from "./related";                  // (hotels, current:{id,city}, max=4) => hotels in same city, not current
import { safeUrl } from "./escape";                      // (v) => string|null
```
Exports exactly:
```ts
export interface RoomRow { type: string; furniture: string | null; maxGuests: number | null; priceText: string | null }
export interface RelatedCard { id: string; name: string; city: string; stars: number | null; priceText: string | null }
export interface ContactModel { phoneText: string | null; telHref: string | null; zaloHref: string | null }
export interface DetailModel { id: string; name: string; stars: number | null; city: string; area: string; address: string; description: string; facilities: string[]; images: string[]; rooms: RoomRow[]; building: BuildingItem[]; contact: ContactModel | null; more: RelatedCard[] }
export function buildDetailModel(data: DirectoryData, hotelId: string, today: string): DetailModel | null
```
Algorithm:
1. `hotel = data.hotels.find(h => h.id === hotelId)`; not found -> `null`.
2. `pct = totalFeePercent(data.fees, hotel.id, today)`. `rooms = sortRoomsByPrice(hotel.rooms.map(r => ({ type: r.type, furniture: r.furniture, maxGuests: r.maxGuests, finalPrice: computeFinalPrice(r.basePrice, pct) })))` then map to `RoomRow` with `priceText = finalPrice === null ? null : formatVnd(finalPrice)` (drop `finalPrice`, never expose base price).
3. `images = hotel.images.map(safeUrl)` keeping non-null only. `facilities` = copy of all facilities.
4. `building = buildingItems({ floors: hotel.floors, roomCount: hotel.roomCount, yearBuilt: hotel.yearBuilt, beachDistanceM: hotel.beachDistanceM })`.
5. `contact`: from `data.contact` (null -> null). `phoneText = phone || null`. `telHref`: `digits = phone.replace(/[^\d+]/g, "")`; if `/\d/.test(digits)` then `"tel:" + digits` else null. `zaloHref`: `safeUrl(zalo)` if not null; else `z = zalo.replace(/[^\d]/g, "")`; if `z !== ""` and `zalo` has no letters -> `"https://zalo.me/" + z`; else null. If all three are null -> `contact = null`.
6. `more`: `all = sortHotels(data.hotels.map(h => toListHotel(h, data.fees, today)), "name")`; `moreInCity(all, { id: hotel.id, city: hotel.city })` mapped to `RelatedCard` (`priceText` from `fromPrice` via formatVnd or null).
7. Return `{ id, name, stars, city, area, address, description, facilities, images, rooms, building, contact, more }` copied from the hotel.
- Examples (today "2026-11-24", fee 10% global): rooms base [2000000, 1000000, null] -> rows priceText ["1.100.000 ₫","2.200.000 ₫",null] in that order; furniture "" parsed earlier as null stays null; images ["https://a/x.jpg","javascript:1","data:x"] -> ["https://a/x.jpg"]; hotel with all building fields null -> `building` []; contact {phone:"0901 234 567", zalo:"0901234567"} -> phoneText "0901 234 567", telHref "tel:0901234567", zaloHref "https://zalo.me/0901234567"; contact {phone:"", zalo:""} or null -> `contact` null; contact zalo "https://zalo.me/abc" -> that URL; hotel with 6 other hotels in same city -> `more` length 4, never contains the current id; unknown id -> null; model never has `basePrice`.

## Unit tests to write
- [ ] `unknown hotel id returns null`: covers AC37 (data side)
- [ ] `room prices include fees, sorted ascending, no price when invalid`: covers AC23, AC25, AC33
- [ ] `model exposes no base price or fee data`: covers AC26
- [ ] `only safe image URLs kept`: covers AC30
- [ ] `empty optional fields are empty values`: covers AC32
- [ ] `building items only for present fields`: covers AC34
- [ ] `contact links built from global contact; null when empty`: covers AC35
- [ ] `more hotels: same city, not current, max 4, with price text`: covers AC36

## Files this task may touch
- `sheet-rag/src/lookup/detailModel.ts`
- `sheet-rag/test/lookup/detailModel.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/detailModel.spec.ts`

## Dev notes

## Review

## Questions
