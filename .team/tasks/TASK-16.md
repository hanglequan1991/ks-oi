# TASK-16: Shared sample data for the hotel API tests (test fixture)

- id: TASK-16
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-2 (schema), TASK-3 (seeded settings), TASK-1 (fake D1)
- size: fits a 100k-token context (few files, one behaviour)

## Why
STORY-15 says tests use prepared sample data until STORY-14 fills the database. Every later STORY-15 task (db queries, routes, end-to-end sweep) needs the same data, so it is built once here. It is test-only code (no `src/` file).

`sheet-rag/test/fixtures/apiSample.ts` exports:
```ts
export const BASE_PRICE_DELUXE = 1250000;   // Mong Hotel, room "Deluxe"  -> final 1375000 at 10 percent
export const BASE_PRICE_SAO = 980000;       // Sao Ha Noi, room "Superior" -> final 1078000
export async function seedApiSample(db: D1Database): Promise<void>;   // applies nothing; caller ran applyMigrations() first
export const SAMPLE_BASE_PRICE_STRINGS: string[];  // ['1250000','980000','1,250,000','980,000', plus every other base price seeded], used by the "no base price anywhere" assertions
```
Data to insert (use only `INSERT`, values are fixed so later tests can hard-code expectations):
- `cities`: `da-nang` (`Đà Nẵng` / `Da Nang`), `ha-noi` (`Hà Nội`, name_en NULL), `hue` (`Huế` / `Hue`, has no published hotel).
- `facility_catalog`: `pool` (Hồ bơi / Swimming pool), `parking` (Chỗ đậu xe / Parking), `elevator` (Thang máy / Elevator), category `facility`.
- Hotels (all need the NOT NULL source columns and `synced_at = '2026-11-18T03:00:00Z'`):
  - `mong-hotel` (id `h1`): published, da-nang, 4 stars, name `Mộng Hotel`, name_search `mong hotel`, description_vi and description_en set, address set. Facilities: pool (confirmed 1), parking (confirmed 0). Two images (positions 0 and 1, alt_vi set on the first). Rooms: `Deluxe` base 1250000 (position 0, with a room-level rule), `Standard` base NULL (position 1). Hotel-level rule with raw_text `Nhận phòng 14:00\n  Trả phòng 12:00 (có dấu cách thừa) ` (keeps newline and spaces), synced_at `2026-11-17T02:00:00Z`. Room-level rule for Deluxe with different text and synced_at `2026-11-16T02:00:00Z`.
  - `sao-hotel` (id `h2`): published, ha-noi, 3 stars, name `Sao Hà Nội`, name_search `sao ha noi`, facility parking, one room `Superior` base 980000, no rules.
  - `dong-do-hotel` (id `h3`): published, da-nang, 5 stars, name `Đông Đô`, name_search `dong do`, facility pool and elevator, no rooms, no images.
  - `mong-review` (id `h4`): status `review`, da-nang, name `Mộng Review`, name_search `mong review`, one room base 555000.
  - `mong-hidden` (id `h5`): status `hidden`, hue, name `Mộng Hidden`, name_search `mong hidden`, one room base 444000.
  Plus a helper `seedManyPublished(db, n)` that inserts `n` extra published hotels `bulk-1..bulk-n` in `ha-noi` (3 stars, name `Bulk <i>`, name_search `bulk <i>`, no rooms) for paging tests.

## Acceptance criteria
1. AC-F1: after `applyMigrations` then `seedApiSample`, the database holds exactly 5 hotels (3 published, 1 review, 1 hidden), 3 cities, the rooms, rules, facilities and images above, and the seeded settings from TASK-3 are untouched.
2. AC-F2: the helper `seedManyPublished(db, 60)` adds 60 published hotels without violating any constraint; calling `seedApiSample` twice throws no unexpected error only if documented (state in a code comment that it is meant to run once per fresh database).
3. AC-F3: `SAMPLE_BASE_PRICE_STRINGS` lists every base price inserted, so later tests can assert none appears in a response.
4. AC-F4: the fixture runs with the fake D1 and no Cloudflare credentials.

## Unit tests to write
In `test/fixtures/apiSample.spec.ts` (must be inside the unit test globs from TASK-1; if the glob does not cover `test/fixtures/**`, name it `test/db/apiSample.spec.ts` instead and say so in Dev notes).
- [ ] `seeds 5 hotels with the expected statuses, cities, rooms and rules`: covers AC-F1
- [ ] `keeps the default settings from the migration`: covers AC-F1
- [ ] `seedManyPublished adds 60 published hotels`: covers AC-F2
- [ ] `price string list contains every seeded base price`: covers AC-F3
- [ ] `runs with no CLOUDFLARE_API_TOKEN`: covers AC-F4

## Files this task may touch
- `sheet-rag/test/fixtures/apiSample.ts` (new)
- `sheet-rag/test/fixtures/apiSample.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Spec placed at `sheet-rag/test/db/apiSample.spec.ts`, not `test/fixtures/apiSample.spec.ts`: `vitest.unit.config.mts` includes `test/db/**`, `test/domain/**`, `test/migrations/**`, `test/fakes/**`, `test/web/**`, `test/client/**` only, so `test/fixtures/**` is not collected. Fallback named in the task. The fixture itself is `test/fixtures/apiSample.ts`.
- `seedApiSample` and `seedManyPublished` insert in one `db.batch` (transactional). Both are documented as once-per-fresh-database.
- `SAMPLE_BASE_PRICE_STRINGS` has plain and comma forms for all four prices (1250000, 980000, 555000, 444000). The spec asserts every seeded price is in the list.
- Spec reads `CLOUDFLARE_API_TOKEN` via `globalThis` because `test/tsconfig.json` has no Node types.
- Results: apiSample spec 5/5 pass; full unit suite 17 files, 93 tests pass.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
