# TASK-22: Hotel card markup

- id: TASK-22
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-18, TASK-21 (type `CardModel`)
- size: fits ~8k tokens with context (one small render function)

## Acceptance criteria
Covers STORY-11: AC24, AC25, AC26, AC27, AC28, AC29, AC40.
1. AC28: card shows city, name, stars, area, facility tags, price line, disclaimer, details link.
2. AC24: price line "From <price> / night". AC25: no price -> "price unavailable / contact us".
3. AC26: no fee note or percentage anywhere; AC27: disclaimer shown, no booking button (no `<button>`).
4. AC29: first tags plus "+N" when `extraTags > 0`.
5. AC40: sheet text is escaped, not translated.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/card.ts`. Imports: `import type { CardModel } from "../directoryModel";` (`CardModel = { id; name; city; area; stars: number|null; tags: string[]; extraTags: number; priceText: string|null }`), `import { escapeHtml } from "../escape";` (`escapeHtml(v: unknown): string`), `import { bi } from "../i18n";` (`bi(key): string` bilingual spans; keys used here: `fromPrice`, `perNight`, `priceUnavailable`, `disclaimer`, `details`). Exports exactly:
```ts
export function renderCard(card: CardModel): string
```
Output = the following parts concatenated with no separator, in this order (`e` = escapeHtml):
1. `<article class="card">`
2. `<p class="city">${e(city)}</p>` (omit when city is empty)
3. `<h3 class="name">${e(name)}</h3>`
4. stars: when `stars` is not null: `<p class="stars" aria-label="${stars} stars">${"★".repeat(stars)}</p>`; else nothing
5. `<p class="area">${e(area)}</p>` (omit when area is empty)
6. tags: when `tags.length > 0 || extraTags > 0`: `<ul class="tags">` + each `<li>${e(tag)}</li>` + (when `extraTags > 0`: `<li class="more">+${extraTags}</li>`) + `</ul>`
7. price: when `priceText !== null`: `<p class="price">${bi("fromPrice")} <strong>${e(priceText)}</strong> ${bi("perNight")}</p>`; else `<p class="price unavailable">${bi("priceUnavailable")}</p>`
8. `<p class="disclaimer">${bi("disclaimer")}</p>`
9. `<a class="details" href="/hotels/${encodeURIComponent(id)}">${bi("details")}</a>`
10. `</article>`
- Example: card {id:"a/1",name:"Hotel <X>",city:"Đà Nẵng",area:"Mỹ Khê",stars:4,tags:["Pool"],extraTags:2,priceText:"1.100.000 ₫"} -> contains `<h3 class="name">Hotel &lt;X&gt;</h3>`, `★★★★`, `<li>Pool</li>`, `<li class="more">+2</li>`, `<strong>1.100.000 ₫</strong>`, `href="/hotels/a%2F1"`; with priceText null -> contains `class="price unavailable"` and no `<strong>`; stars null -> no `class="stars"`; output never contains `<button`.

## Unit tests to write
- [ ] `shows city, name, stars, area, tags, price, disclaimer and details link`: covers AC28
- [ ] `price line uses From and per night, formatted text`: covers AC24
- [ ] `missing price shows price unavailable and no strong`: covers AC25
- [ ] `no "%", fee wording or button in output`: covers AC26, AC27
- [ ] `+N indicator only when extraTags > 0`: covers AC29
- [ ] `hotel text is escaped, id is URL-encoded in the link`: covers AC40

## Files this task may touch
- `sheet-rag/src/lookup/view/card.ts`
- `sheet-rag/test/lookup/view/card.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/card.spec.ts`

## Dev notes

## Review

## Questions
