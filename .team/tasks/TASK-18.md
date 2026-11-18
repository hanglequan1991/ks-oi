# TASK-18: Public JSON shapes and serializers with final prices (src/domain/hotelView.ts)

- id: TASK-18
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: review
- assignee: dev
- rework count: 0
- depends on: TASK-4 (`finalPrice`); TASK-1 (test runner)
- size: fits a 100k-token context (few files, one behaviour)

## Why
One pure place where database rows become public JSON, so the final price is computed server-side and the base price can never leak (technical-design.html sections 9 and 11.3). No I/O, no Hono, no D1 (imports only `src/domain/`). The db tasks return the row types defined here; the route tasks call the serializers.

Required exports in `sheet-rag/src/domain/hotelView.ts`:
```ts
export type Lang = 'vi' | 'en';                        // local to the domain; same literal union as the web layer
export interface PricingOpts { feePercent: number; showFeeNote: boolean }
export interface PriceView { amount: number; currency: 'VND'; unit: 'night'; includesFeePercent?: number }
export function priceView(base: number | null | undefined, o: PricingOpts): PriceView | null;
// null when base is null/undefined (never 0). Otherwise amount = finalPrice(base, o.feePercent); includesFeePercent = o.feePercent only when o.showFeeNote is true (key absent otherwise).

// Row types (what src/db/* returns). base_price / min_base_price exist ONLY here, never in the view types.
export interface HotelListRow { slug; name; city_slug; city_name_vi; city_name_en: string|null; stars: number|null; address: string|null; area: string|null; min_base_price: number|null; image_url: string|null }
export interface HotelRow { id; slug; name; city_slug; city_name_vi; city_name_en: string|null; stars; address; area; lat: number|null; lng: number|null; description_vi: string|null; description_en: string|null; synced_at: string }
export interface RoomRow { id; name; bed_type: string|null; size_m2: number|null; max_guests: number|null; view: string|null; description: string|null; base_price: number|null; position: number }
export interface RuleRow { room_id: string|null; raw_text: string; synced_at: string }
export interface FacilityRow { code; label_vi; label_en; confirmed: number }
export interface ImageRow { url; alt_vi: string|null; position: number }

export function toHotelListItem(row: HotelListRow, lang: Lang, o: PricingOpts): HotelListItem;
// { slug, name, city: {slug, name}, stars, address, area, image: string|null, price: PriceView|null }  (price = the lowest final price, i.e. finalPrice(min_base_price))
export function toHotelDetail(input: { hotel: HotelRow; rooms: RoomRow[]; rules: RuleRow[]; facilities: FacilityRow[]; images: ImageRow[] }, lang: Lang, o: PricingOpts & { disclaimerVi: string; disclaimerEn: string }): HotelDetail;
// Shape as technical-design.html 11.3: { slug, name, city:{slug,name}, stars, address, area, lat, lng, description, images:[{url,alt}], facilities:[{code,label,confirmed:boolean}], rooms:[{id,name,bedType,sizeM2,maxGuests,view,description,price,bookingRules}], bookingRules, disclaimer, dataUpdatedAt }
export function toCityItem(row: {slug; name_vi; name_en: string|null}, lang: Lang): { slug: string; name: string; nameVi: string; nameEn: string | null };
```
Rules for the language: `name` of a city, facility label and description use the English value when `lang = 'en'` and it is not empty, otherwise the Vietnamese value. Hotel `name`, room fields and rule text are never translated. `bookingRules` is `{ text, syncedAt }` (text exactly `raw_text`, no trim, no change) or `null`. Room-level rule = the rule whose `room_id` equals the room id; hotel-level = `room_id` null. If several rules match, the one with the latest `synced_at`. Images and rooms keep the order of the input arrays. `dataUpdatedAt` = hotel `synced_at`. `disclaimer` picks by language.

## Acceptance criteria
1. AC6: a room with `base_price` 1250000 and fee 10 gives `price.amount` 1375000, currency `VND`, unit `night`.
2. AC8: a room with `base_price` null has `price: null` (not zero); a list item with `min_base_price` null has `price: null`.
3. AC7: `JSON.stringify` of every serializer output (list item, detail with several rooms, city) contains none of the keys `base_price`, `basePrice`, `min_base_price`, `base` and none of the input base price numbers (check with distinct values such as 1250000 and 980000 where the final values differ).
4. AC9: fee 150 acts as 100 and fee -5 as 0 (inherited from `finalPrice`); `feePercent` is applied as given by the caller (parsing is `src/db/settings.ts`).
5. AC10: with `showFeeNote` true the price has `includesFeePercent: 10`; with false the key is absent (`'includesFeePercent' in price` is false).
6. AC4: the detail keeps the hotel-level and room-level rule text and `syncedAt` unchanged (leading/trailing spaces and newlines preserved), returns facilities with `confirmed` as boolean, images in order with `alt`, and `dataUpdatedAt`; a room without its own rule has `bookingRules: null`, a hotel without a hotel-level rule has `bookingRules: null`.
7. AC4: `lang = 'en'` uses English description, city name and facility label when present and falls back to Vietnamese when empty or null; `disclaimer` is the English text for `en` and the Vietnamese text for `vi`.
8. AC11: `toCityItem` gives the name in the requested language with fallback to Vietnamese and always includes `nameVi` and `nameEn`.

## Unit tests to write
In `test/domain/hotelView.spec.ts` (plain objects, no database).
- [ ] `priceView adds the fee and rounds to 1000`: covers AC1
- [ ] `priceView returns null for a missing price, never zero`: covers AC2
- [ ] `serialized output never contains a base price key or value`: covers AC3
- [ ] `fee outside 0 to 100 is clamped`: covers AC4
- [ ] `fee percentage appears only when the fee note is on`: covers AC5
- [ ] `detail keeps rule text and sync dates unchanged at both levels`: covers AC6
- [ ] `english fields fall back to Vietnamese when missing`: covers AC7
- [ ] `list item carries the lowest final price or null`: covers AC1, AC2
- [ ] `city item names in both languages`: covers AC8

## Files this task may touch
- `sheet-rag/src/domain/hotelView.ts` (new)
- `sheet-rag/test/domain/hotelView.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red: spec failed on missing module. Green: 9/9 in `test/domain/hotelView.spec.ts`; full unit suite 78/78 in 14 files.
- Fee clamping is delegated to `finalPrice` (src/domain/pricing.ts); not re-implemented.
- "Empty" for English fallback means null or whitespace-only.
- Room `description` is not translated (no `description_en` on RoomRow), per the task.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
