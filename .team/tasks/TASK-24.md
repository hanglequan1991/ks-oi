# TASK-24: City tabs and A-to-Z letter bar markup

- id: TASK-24
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-16, TASK-18, TASK-21
- size: fits ~8k tokens with context (two small render functions)

## Acceptance criteria
Covers STORY-11: AC9 (tabs: All + one per city; active tab = current city), AC17 (letters with no hotels disabled, not links; counts shown), AC18 (selecting the active letter again, or "All", removes the restriction), AC20 (links reset paging), AC15 (links keep other filters and sort).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/nav.ts`. Imports: `import type { DirectoryModel } from "../directoryModel";` (uses `model.query`, `model.cities: string[]`, `model.letters: {letter:string;count:number;enabled:boolean;selected:boolean}[]`), `import { buildQueryString } from "../query";` (`buildQueryString(query, overrides?): string` returns "" or "?a=b"; any override resets paging to page 1 and keeps other params), `import { escapeHtml } from "../escape";`, `import { bi } from "../i18n";` (key `all`). Exports exactly:
```ts
export function renderCityTabs(model: DirectoryModel): string
export function renderLetterBar(model: DirectoryModel): string
```
(`e` = escapeHtml; `href(overrides)` = `e("/hotels" + buildQueryString(model.query, overrides))`.)
- `renderCityTabs`: `<nav class="tabs">` + All tab + one tab per `model.cities` + `</nav>`. All tab: `<a class="tab${model.query.city === "" ? " active" : ""}" href="${href({city:""})}">${bi("all")}</a>`. City tab: `<a class="tab${c === model.query.city ? " active" : ""}" href="${href({city:c})}">${e(c)}</a>`.
- `renderLetterBar`: `<nav class="letters">` + All link `<a class="letter${model.query.letter === null ? " active" : ""}" href="${href({letter:null})}">${bi("all")}</a>` + for each `model.letters` entry `L`:
  - not enabled: `<span class="letter disabled" aria-disabled="true">${e(L.letter)}</span>`
  - enabled and not selected: `<a class="letter" href="${href({letter:L.letter})}">${e(L.letter)} <small>${L.count}</small></a>`
  - enabled and selected: `<a class="letter active" href="${href({letter:null})}">${e(L.letter)} <small>${L.count}</small></a>` (selecting it again removes the restriction)
  - then `</nav>`.
- Examples (default query): tabs for cities ["Đà Nẵng","Huế"] -> `<a class="tab active" href="/hotels">`, `href="/hotels?city=%C4%90%C3%A0+N%E1%BA%B5ng"`; query city "Huế", sort "price" -> Huế tab has `active`, All tab href `/hotels?sort=price`, Đà Nẵng tab href `/hotels?city=%C4%90%C3%A0+N%E1%BA%B5ng&amp;sort=price` (`e()` turns `&` into `&amp;`, as required in HTML attributes). Letters: {letter:"D",count:2,enabled:true,selected:false} -> `<a class="letter" href="/hotels?letter=D">D <small>2</small></a>`; {letter:"E",count:0,enabled:false} -> `<span class="letter disabled" aria-disabled="true">E</span>` (no `<a`); selected "D" -> `href="/hotels"` and `class="letter active"`.

## Unit tests to write
- [ ] `tabs: All plus one per city, active tab matches current city`: covers AC9
- [ ] `tab links keep sort and filters but drop paging`: covers AC15, AC20
- [ ] `disabled letters are spans, not links`: covers AC17
- [ ] `enabled letters show counts and link with letter param`: covers AC17
- [ ] `selected letter link and All link remove the restriction`: covers AC18

## Files this task may touch
- `sheet-rag/src/lookup/view/nav.ts`
- `sheet-rag/test/lookup/view/nav.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/nav.spec.ts`

## Dev notes

## Review

## Questions
