# TASK-23: Search and filter form markup

- id: TASK-23
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-18, TASK-21 (type `DirectoryModel`)
- size: fits ~8k tokens with context (one render function)

## Acceptance criteria
Covers STORY-11: AC2 (search box), AC4 (city select: "All cities" first, then cities), AC5 (stars select Any/3+/4+/5), AC6/AC7 (facility chips, multi-select), AC10 (clear link), AC14 (sort select, default name), AC15 (sort inside same form keeps filters), AC41 (collapsible filters).
1. AC4: city select lists All cities then `model.cities` in the given order; the current city is selected.
2. AC5: stars select values "", "3", "4", "5" with the current one selected (minStars 0 -> "").
3. AC6/AC7: one checkbox chip per `model.facilities` named `fac`, checked when in `query.facilities`.
4. AC14/AC15: sort select values name/price/stars, current selected, in the same GET form.
5. AC10: "Clear filters" link goes to `/hotels`.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/filters.ts`. Imports: `import type { DirectoryModel } from "../directoryModel";` (uses `model.query: {q:string; city:string; minStars:0|3|4|5; facilities:string[]; letter:string|null; sort:"name"|"price"|"stars"}`, `model.cities: string[]`, `model.facilities: string[]`), `import { escapeHtml } from "../escape";`, `import { bi } from "../i18n";` (keys: `filtersToggle`, `searchLabel`, `cityLabel`, `allCities`, `minStarsLabel`, `starsAny`, `stars3`, `stars4`, `stars5`, `facilitiesLabel`, `sortLabel`, `sortName`, `sortPrice`, `sortStars`, `searchButton`, `clearFilters`). Exports exactly:
```ts
export function renderFilters(model: DirectoryModel): string
```
Output parts concatenated, in order (`e` = escapeHtml; `sel(cond)` = `cond ? " selected" : ""`; `chk(cond)` = `cond ? " checked" : ""`):
1. `<details class="filters" open><summary>${bi("filtersToggle")}</summary><form method="get" action="/hotels">`
2. `<label>${bi("searchLabel")} <input type="search" name="q" value="${e(query.q)}"></label>`
3. `<label>${bi("cityLabel")} <select name="city"><option value=""${sel(query.city === "")}>` + `${bi("allCities")}</option>` + for each city `<option value="${e(c)}"${sel(c === query.city)}>${e(c)}</option>` + `</select></label>`
4. `<label>${bi("minStarsLabel")} <select name="stars">` + `<option value=""${sel(minStars===0)}>${bi("starsAny")}</option>` + `<option value="3"${sel(minStars===3)}>${bi("stars3")}</option>` + `<option value="4"${sel(minStars===4)}>${bi("stars4")}</option>` + `<option value="5"${sel(minStars===5)}>${bi("stars5")}</option>` + `</select></label>`
5. only when `model.facilities.length > 0`: `<fieldset class="chips"><legend>${bi("facilitiesLabel")}</legend>` + for each facility `<label class="chip"><input type="checkbox" name="fac" value="${e(f)}"${chk(query.facilities.includes(f))}> ${e(f)}</label>` + `</fieldset>`
6. `<label>${bi("sortLabel")} <select name="sort">` + `<option value="name"${sel(sort==="name")}>${bi("sortName")}</option>` + `<option value="price"${sel(sort==="price")}>${bi("sortPrice")}</option>` + `<option value="stars"${sel(sort==="stars")}>${bi("sortStars")}</option>` + `</select></label>`
7. only when `query.letter !== null`: `<input type="hidden" name="letter" value="${e(query.letter)}">`
8. `<button type="submit">${bi("searchButton")}</button> <a class="clear" href="/hotels">${bi("clearFilters")}</a></form></details>`
- Example: query {q:"da nang", city:"Huế", minStars:4, facilities:["Pool"], letter:null, sort:"price"}, cities ["Đà Nẵng","Huế"], facilities ["Parking","Pool"] -> contains `name="q" value="da nang"`, `<option value="Huế" selected>`, `<option value="4" selected>`, `value="Pool" checked`, `value="Parking">` (not checked), `<option value="price" selected>`, no `name="letter"`; default query -> `<option value="" selected>` for city and stars, `<option value="name" selected>`; no facilities -> no `<fieldset`; `q` value `"><script>` is escaped.

## Unit tests to write
- [ ] `search box shows current query, escaped`: covers AC2
- [ ] `city select has All cities first then cities, current selected`: covers AC4
- [ ] `stars select options and selection`: covers AC5
- [ ] `facility chips checked state and hidden when no facilities`: covers AC6, AC7
- [ ] `sort select options with current selected, default name`: covers AC14, AC15
- [ ] `clear link points to /hotels and form is GET to /hotels`: covers AC10
- [ ] `filters are in a collapsible details element`: covers AC41
- [ ] `hidden letter input only when a letter is selected`: covers AC18

## Files this task may touch
- `sheet-rag/src/lookup/view/filters.ts`
- `sheet-rag/test/lookup/view/filters.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/filters.spec.ts`

## Dev notes

## Review

## Questions
