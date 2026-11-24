# TASK-25: Directory page (composition, load more, empty states)

- id: TASK-25
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-19, TASK-21, TASK-22, TASK-23, TASK-24 (and TASK-16, TASK-18)
- size: fits ~8k tokens with context (composition only)

## Acceptance criteria
Covers STORY-11: AC10 (clear link in empty state), AC19 (Load more link only while more remain), AC20 (load more link only changes `page`), AC21 (no-match message + clear link, no Load more), AC22 (no-data message, page does not error), AC27 (no booking button), AC26 (no fee text).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/directoryPage.ts`. Imports:
```ts
import type { DirectoryModel } from "../directoryModel";   // { query, state: "no-data"|"no-match"|"list", cards: CardModel[], hasMore: boolean, ... }
import { renderPage } from "../layout";                     // renderPage({title, body}): string (full HTML document)
import { renderFilters } from "./filters";                  // (model) => string
import { renderCityTabs, renderLetterBar } from "./nav";    // (model) => string
import { renderCard } from "./card";                        // (card) => string
import { buildQueryString } from "../query";                // buildQueryString(query, overrides?): "" | "?..."
import { escapeHtml } from "../escape";
import { bi } from "../i18n";                               // keys: siteTitle, noHotels, noData, clearFilters, loadMore
```
Exports exactly:
```ts
export function renderDirectoryPage(model: DirectoryModel): string
```
- `head = "<h1>" + bi("siteTitle") + "</h1>"`.
- state "no-data": `body = head + '<p class="empty">' + bi("noData") + "</p>"` (no filters, tabs, letters, load more).
- state "no-match": `body = head + renderFilters(model) + renderCityTabs(model) + renderLetterBar(model) + '<div class="empty"><p>' + bi("noHotels") + '</p><a class="clear" href="/hotels">' + bi("clearFilters") + "</a></div>"` (no load more).
- state "list": `body = head + renderFilters(model) + renderCityTabs(model) + renderLetterBar(model) + '<section class="cards">' + model.cards.map(renderCard).join("") + "</section>"` + (when `model.hasMore`: `<p class="more"><a class="load-more" href="${escapeHtml("/hotels" + buildQueryString(model.query, { pages: model.query.pages + 1 }))}">${bi("loadMore")}</a></p>`, else nothing).
- Return `renderPage({ title: "Hotel Dictionary", body })`.
- Examples: state "no-data" -> contains `class="empty"` and Vietnamese `Hiện chưa có khách sạn nào.`, no `<form`; state "no-match" -> contains `Không tìm thấy khách sạn phù hợp.`, `href="/hotels"`, no `load-more`; list with hasMore and query.pages 1 -> contains `href="/hotels?page=2"`; with query.sort "price", pages 2 -> `href="/hotels?sort=price&amp;page=3"`; hasMore false -> no `load-more`; output never contains `<button type="button"`-style booking buttons (only the filter submit button exists) and starts with `<!doctype html>`. Tests may build a minimal `DirectoryModel` by hand (cards may be 1-2 fake CardModels).

## Unit tests to write
- [ ] `list state renders filters, tabs, letter bar and cards`: covers AC19
- [ ] `load more link appears only when hasMore and only changes page`: covers AC19, AC20
- [ ] `no-match shows message, clear link and no load more`: covers AC21, AC10
- [ ] `no-data shows message and no form, no error`: covers AC22
- [ ] `page has no booking button and no fee wording`: covers AC26, AC27

## Files this task may touch
- `sheet-rag/src/lookup/view/directoryPage.ts`
- `sheet-rag/test/lookup/view/directoryPage.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/directoryPage.spec.ts`

## Dev notes

## Review

## Questions
