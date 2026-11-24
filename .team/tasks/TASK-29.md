# TASK-29: Building info and contact markup

- id: TASK-29
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-11, TASK-14, TASK-18, TASK-26 (type `ContactModel`)
- size: fits ~8k tokens with context (two tiny render functions)

## Acceptance criteria
Covers STORY-11: AC34 (each present item with its label and unit; section hidden when none), AC35 (tappable call link, Zalo link; no per-hotel contact; section omitted when no contact).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/info.ts`. Imports: `import type { BuildingItem } from "../building";` (`BuildingItem = { key: "floors"|"roomCount"|"yearBuilt"|"beachDistance"; display: string }`), `import type { ContactModel } from "../detailModel";` (`ContactModel = { phoneText: string|null; telHref: string|null; zaloHref: string|null }`), `import { escapeHtml } from "../escape";`, `import { bi } from "../i18n";` (keys `buildingTitle`, `floorsLabel`, `roomCountLabel`, `yearBuiltLabel`, `beachLabel`, `unitFloors`, `unitRooms`, `contactTitle`, `callLabel`, `zaloLabel`). Exports exactly:
```ts
export function renderBuilding(items: BuildingItem[]): string
export function renderContact(contact: ContactModel | null): string
```
- `renderBuilding`: `items.length === 0` -> `""`. Else `<section class="building"><h2>${bi("buildingTitle")}</h2><ul>` + per item `<li><span class="label">${bi(label)}</span> <span class="value">${e(display)}</span>${unit}</li>` + `</ul></section>`. label by key: floors -> `floorsLabel`, roomCount -> `roomCountLabel`, yearBuilt -> `yearBuiltLabel`, beachDistance -> `beachLabel`. `unit` (inside the li, after the value span): floors -> ` ${bi("unitFloors")}`, roomCount -> ` ${bi("unitRooms")}`, yearBuilt and beachDistance -> `""` (the beach display already contains "m"/"km").
- `renderContact`: `null` -> `""`; also `""` when `telHref`, `zaloHref` are both null. Else `<section class="contact"><h2>${bi("contactTitle")}</h2>` + (telHref ? `<a class="call" href="${e(telHref)}">${bi("callLabel")}${phoneText ? " " + e(phoneText) : ""}</a>` : "") + (zaloHref ? ` <a class="zalo" href="${e(zaloHref)}" target="_blank" rel="noopener">${bi("zaloLabel")}</a>` : "") + `</section>`.
- Examples: `renderBuilding([{key:"floors",display:"12"},{key:"beachDistance",display:"350 m"}])` contains `<span class="value">12</span> <span class="vi">tầng</span>` and `350 m` without a unit span after it, and not the year label; `renderBuilding([])` = `""`; `renderContact({phoneText:"0901 234 567",telHref:"tel:0901234567",zaloHref:"https://zalo.me/0901234567"})` contains `href="tel:0901234567"`, `0901 234 567`, `href="https://zalo.me/0901234567"`; contact with only telHref has no `class="zalo"`; `renderContact(null)` = `""`.

## Unit tests to write
- [ ] `building: empty list renders nothing`: covers AC34
- [ ] `building: shows label, value and unit for present items only`: covers AC34
- [ ] `contact: call link is a tel: link, Zalo link opens safely`: covers AC35
- [ ] `contact: null or no links renders nothing`: covers AC35
- [ ] `contact: only existing links are rendered`: covers AC35

## Files this task may touch
- `sheet-rag/src/lookup/view/info.ts`
- `sheet-rag/test/lookup/view/info.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/info.spec.ts`

## Dev notes

## Review

## Questions
