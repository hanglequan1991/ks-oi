# TASK-28: Room table markup

- id: TASK-28
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-18, TASK-26 (type `RoomRow`)
- size: fits ~8k tokens with context (one tiny render function)

## Acceptance criteria
Covers STORY-11: AC25 (room without price -> "price unavailable / contact us"), AC26 (final price only), AC33 (type, furniture, max guests, per-night final price; furniture simply absent when empty; rows already sorted by the model).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/rooms.ts`. Imports: `import type { RoomRow } from "../detailModel";` (`RoomRow = { type: string; furniture: string | null; maxGuests: number | null; priceText: string | null }`), `import { escapeHtml } from "../escape";`, `import { bi } from "../i18n";` (keys `roomType`, `maxGuests`, `pricePerNight`, `priceUnavailable`). Exports exactly:
```ts
export function renderRoomTable(rows: RoomRow[]): string
```
- `rows.length === 0` -> `""`.
- Else: `<div class="table-wrap"><table class="rooms"><thead><tr><th>${bi("roomType")}</th><th>${bi("maxGuests")}</th><th>${bi("pricePerNight")}</th></tr></thead><tbody>` + one row each + `</tbody></table></div>`.
- Row: `<tr><td>${e(type)}${furniture ? `<br><small class="furniture">${e(furniture)}</small>` : ""}</td><td>${maxGuests === null ? "" : maxGuests}</td><td>${priceText === null ? bi("priceUnavailable") : e(priceText)}</td></tr>` (`e` = escapeHtml). Furniture is shown under the room type; when null/empty NOTHING is rendered for it (no placeholder, no empty element).
- Order is kept as given. Examples: `[{type:"Deluxe",furniture:"King bed, sofa",maxGuests:2,priceText:"1.100.000 ₫"}]` -> contains `<td>Deluxe<br><small class="furniture">King bed, sofa</small></td><td>2</td><td>1.100.000 ₫</td>`; furniture null -> contains `<td>Standard</td>` and no `furniture`; maxGuests null -> `<td></td>`; priceText null -> `Chưa có giá / vui lòng liên hệ` present; `[]` -> `""`; no `%`, no "fee" in any output.

## Unit tests to write
- [ ] `empty rows render nothing`: covers AC33
- [ ] `row shows type, guests and final price`: covers AC33
- [ ] `furniture shown under type only when present, no placeholder otherwise`: covers AC33
- [ ] `missing price shows price unavailable text`: covers AC25
- [ ] `row order preserved and no fee/percent wording`: covers AC26, AC33
- [ ] `room type and furniture are escaped`: covers AC33

## Files this task may touch
- `sheet-rag/src/lookup/view/rooms.ts`
- `sheet-rag/test/lookup/view/rooms.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/rooms.spec.ts`

## Dev notes

## Review

## Questions
