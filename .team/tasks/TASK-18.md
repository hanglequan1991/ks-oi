# TASK-18: Bilingual interface strings (vi / en)

- id: TASK-18
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14 (`escapeHtml` from `./escape`)
- size: fits ~8k tokens with context (one data module with a tiny function)

## Acceptance criteria
Covers STORY-11: AC38 (every interface text exists in Vietnamese and English; the page switches by CSS, see TASK-19), AC25 (price-unavailable text), AC26 (no fee wording anywhere in the dictionary), AC27 (disclaimer), AC40 (hotel content is NOT in the dictionary: it is never translated).
1. AC38: every key has non-empty `vi` and `en`.
2. AC26: no string contains "%" or the words "fee"/"phí" (case-insensitive).
3. AC27: `disclaimer` exists; there is no key for any booking button.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/i18n.ts`. Imports only `import { escapeHtml } from "./escape";` (`escapeHtml(value: unknown): string`). Exports exactly:
```ts
export const STRINGS = { /* key: { vi: string; en: string } ... exactly the keys below */ };
export type StringKey = keyof typeof STRINGS;
export function bi(key: StringKey): string
```
`bi(key)` returns `<span class="vi">${escapeHtml(vi)}</span><span class="en">${escapeHtml(en)}</span>` (no spaces/newlines between the spans). Example: `bi("loadMore")` = `<span class="vi">Xem thêm khách sạn</span><span class="en">Load more hotels</span>`.

STRINGS (key | vi | en), copy exactly (UTF-8, Vietnamese diacritics kept):
- siteTitle | Từ điển khách sạn | Hotel Dictionary
- searchLabel | Tên khách sạn hoặc khu vực | Hotel name or area
- cityLabel | Thành phố | City
- allCities | Tất cả thành phố | All cities
- minStarsLabel | Số sao tối thiểu | Minimum stars
- starsAny | Bất kỳ | Any
- stars3 | 3 sao trở lên | 3+ stars
- stars4 | 4 sao trở lên | 4+ stars
- stars5 | 5 sao | 5 stars
- searchButton | Tìm kiếm | Search
- facilitiesLabel | Tiện nghi | Facilities
- filtersToggle | Bộ lọc | Filters
- clearFilters | Xóa bộ lọc | Clear filters
- sortLabel | Sắp xếp | Sort by
- sortName | Tên A đến Z | Name A to Z
- sortPrice | Giá thấp đến cao | Price low to high
- sortStars | Số sao cao đến thấp | Stars high to low
- all | Tất cả | All
- loadMore | Xem thêm khách sạn | Load more hotels
- fromPrice | Từ | From
- perNight | / đêm | / night
- priceUnavailable | Chưa có giá / vui lòng liên hệ | Price unavailable / contact us
- disclaimer | Giá chỉ mang tính tham khảo; tình trạng phòng được xác nhận qua điện thoại. | Prices are indicative; availability is confirmed by phone.
- details | Xem chi tiết | View details
- noHotels | Không tìm thấy khách sạn phù hợp. | No hotels found.
- noData | Hiện chưa có khách sạn nào. | There are no hotels yet.
- backToDirectory | Quay lại danh sách | Back to directory
- notFoundTitle | Không tìm thấy khách sạn | Hotel not found
- noImage | Chưa có hình ảnh | No image available
- addressLabel | Địa chỉ | Address
- descriptionLabel | Giới thiệu | About
- facilitiesTitle | Tiện nghi | Facilities
- roomsTitle | Loại phòng và giá | Rooms and prices
- roomType | Loại phòng | Room type
- maxGuests | Số khách tối đa | Max guests
- pricePerNight | Giá mỗi đêm | Price per night
- buildingTitle | Thông tin tòa nhà | Building info
- floorsLabel | Số tầng | Floors
- roomCountLabel | Số phòng | Rooms
- yearBuiltLabel | Năm xây dựng | Year built
- beachLabel | Cách biển | Distance to beach
- unitFloors | tầng | floors
- unitRooms | phòng | rooms
- contactTitle | Liên hệ đặt phòng | Contact to book
- callLabel | Gọi điện | Call
- zaloLabel | Zalo | Zalo
- moreInCity | Khách sạn khác tại thành phố này | More hotels in this city

## Unit tests to write
- [ ] `every key has non-empty vi and en`: covers AC38
- [ ] `no string contains %, "fee" or "phí"`: covers AC26
- [ ] `disclaimer and priceUnavailable texts exist`: covers AC25, AC27
- [ ] `bi renders both language spans in order and escapes`: covers AC38
- [ ] `has the required key list (spot check loadMore, fromPrice, details, noHotels, noData)`: covers AC38

## Files this task may touch
- `sheet-rag/src/lookup/i18n.ts`
- `sheet-rag/test/lookup/i18n.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/i18n.spec.ts`

## Dev notes

## Review

## Questions
