# TASK-30: Hotel detail page and "not found" page

- id: TASK-30
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-19, TASK-26, TASK-27, TASK-28, TASK-29 (and TASK-14, TASK-18)
- size: fits ~8k tokens with context (composition only)

## Acceptance criteria
Covers STORY-11: AC26 (no fee text), AC27 (disclaimer, no booking button), AC29 (all facilities on the detail page), AC32 (name, stars, city, area, address, description, all facilities; empty fields omitted), AC36 (more hotels in this city, hidden when none, links to detail pages), AC37 (not-found page with link back), AC40 (hotel text escaped, not translated).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/detailPage.ts`. Imports:
```ts
import type { DetailModel } from "../detailModel";   // see TASK-26: { id,name,stars:number|null,city,area,address,description:string; facilities:string[]; images:string[]; rooms: RoomRow[]; building: BuildingItem[]; contact: ContactModel|null; more: {id,name,city,stars,priceText:string|null}[] }
import { renderPage } from "../layout";               // renderPage({title, body}): string
import { renderGallery } from "./gallery";            // (images: string[], name: string) => string
import { renderRoomTable } from "./rooms";            // (rows) => string ("" when no rows)
import { renderBuilding, renderContact } from "./info"; // (items) => string ; (contact) => string ("" when nothing)
import { escapeHtml } from "../escape";
import { bi } from "../i18n";                         // keys: backToDirectory, addressLabel, descriptionLabel, facilitiesTitle, roomsTitle, disclaimer, moreInCity, fromPrice, perNight, notFoundTitle
```
Exports exactly:
```ts
export function renderDetailPage(model: DetailModel): string
export function renderNotFoundPage(): string
```
`renderDetailPage` body = concatenation (`e` = escapeHtml), parts marked "(omit)" are `""` when empty:
1. `<p><a class="back" href="/hotels">${bi("backToDirectory")}</a></p>`
2. `<h1>${e(name)}</h1>`
3. (omit when stars null) `<p class="stars" aria-label="${stars} stars">${"★".repeat(stars)}</p>`
4. (omit when both empty) `<p class="loc">${[city, area].filter(x => x !== "").map(e).join(" · ")}</p>`
5. (omit when address empty) `<p class="address"><strong>${bi("addressLabel")}:</strong> ${e(address)}</p>`
6. `renderGallery(images, name)` (always; it renders its own placeholder)
7. (omit when description empty) `<section class="desc"><h2>${bi("descriptionLabel")}</h2><p style="white-space:pre-line">${e(description)}</p></section>`
8. (omit when no facilities) `<section class="facilities"><h2>${bi("facilitiesTitle")}</h2><ul class="tags">` + each `<li>${e(f)}</li>` (ALL, no "+N") + `</ul></section>`
9. (omit when `rooms.length === 0`) `<section class="rooms"><h2>${bi("roomsTitle")}</h2>${renderRoomTable(rooms)}</section>`
10. `<p class="disclaimer">${bi("disclaimer")}</p>`
11. `renderBuilding(building)`
12. `renderContact(contact)`
13. (omit when `more.length === 0`) `<section class="more"><h2>${bi("moreInCity")}</h2><ul>` + each `<li><a href="/hotels/${encodeURIComponent(m.id)}">${e(m.name)}</a>${m.priceText ? ` — ${bi("fromPrice")} ${e(m.priceText)} ${bi("perNight")}` : ""}</li>` + `</ul></section>`
Return `renderPage({ title: name, body })`.
`renderNotFoundPage()`: `renderPage({ title: "Hotel not found", body: '<h1>' + bi("notFoundTitle") + '</h1><p><a class="back" href="/hotels">' + bi("backToDirectory") + "</a></p>" })`.
- Examples: model with name "Hotel <X>", empty address/description, no facilities, no rooms, no more -> contains `<h1>Hotel &lt;X&gt;</h1>`, `class="disclaimer"`, `class="gallery placeholder"` (no images), and does NOT contain `class="address"`, `class="desc"`, `class="facilities"`, `class="rooms"`, `class="more"`, `<button`; 7 facilities -> 7 `<li>` and no `class="more"` `+N` text; more [{id:"b 1",name:"B",priceText:"900.000 ₫"}] -> `href="/hotels/b%201"` and `900.000 ₫`; not-found page contains `Không tìm thấy khách sạn` and `href="/hotels"`.

## Unit tests to write
- [ ] `shows name, stars, city/area, address, description and all facilities`: covers AC32, AC29
- [ ] `empty fields are omitted`: covers AC32
- [ ] `disclaimer present and no booking button or fee wording`: covers AC26, AC27
- [ ] `more hotels section lists links, hidden when none`: covers AC36
- [ ] `gallery placeholder used when no images`: covers AC31
- [ ] `rooms, building and contact sections included only when they have content`: covers AC33, AC34, AC35
- [ ] `not-found page has message and link back to /hotels`: covers AC37
- [ ] `hotel text is escaped and not translated`: covers AC40

## Files this task may touch
- `sheet-rag/src/lookup/view/detailPage.ts`
- `sheet-rag/test/lookup/view/detailPage.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/detailPage.spec.ts`

## Dev notes

## Review

## Questions
