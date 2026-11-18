# TASK-1: Credential-free test tooling (vitest config and fake D1)

- id: TASK-1
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: none
- size: fits a 100k-token context (few files, one behaviour)

## Why
The existing `sheet-rag/vitest.config.mts` loads `@cloudflare/vitest-plugin` with `wrangler.jsonc`, which has the AI and Vectorize bindings and needs `CLOUDFLARE_API_TOKEN`. The database layer must be tested without credentials (technical-design.html section 15). This task adds a second, plain Node Vitest config and a small fake of the D1 API backed by `node:sqlite` (built into Node 22; already verified to load under Vitest 5 here; it prints an ExperimentalWarning, which is acceptable). The old `vitest.config.mts`, `src/index.ts` and `test/index.spec.ts` must NOT be edited (the real deployed source will replace them later).

## Acceptance criteria
Supports STORY-13 AC1, AC2, AC5, AC9 and AC10 (they all need a local database that runs without Cloudflare credentials).
1. AC-T1: `npm test -- --run` runs the new unit tests with no `CLOUDFLARE_API_TOKEN` set and without contacting Cloudflare. It only collects `test/db/**`, `test/domain/**`, `test/migrations/**` and `test/fakes/**` spec files, so the old `test/index.spec.ts` is not collected.
2. AC-T2: `test/fakes/d1.ts` exports `createFakeD1(): FakeD1` (in-memory `node:sqlite`, foreign keys enforced with `PRAGMA foreign_keys = ON`, as D1 does). It implements the D1 subset `prepare(sql).bind(...).first()/all()/run()`, `batch([...])` and `exec(sql)`. `all()` returns `{ results, success: true, meta }`; `run()` returns `{ success: true, meta: { changes, last_row_id } }`. A SQL error rejects the promise. `FakeD1` is assignable to `D1Database` via a documented cast (`as unknown as D1Database`).
3. AC-T3: `test/fakes/migrations.ts` exports `applyMigrations(db: FakeD1, dir?: string): Promise<void>`, which reads every `*.sql` file from `sheet-rag/migrations/` (default), sorted by file name, and runs each with `exec`. If the folder does not exist or is empty it applies nothing and does not throw. It also exports `listMigrationFiles(dir?)`.
4. AC-T4: `batch()` is atomic: if one statement fails, none of the batch is applied.

## Unit tests to write
- [ ] `test/fakes/d1.spec.ts` > `runs prepare/bind/first/all/run against an in-memory database`: covers AC-T2
- [ ] `test/fakes/d1.spec.ts` > `enforces foreign keys`: covers AC-T2
- [ ] `test/fakes/d1.spec.ts` > `rejects on invalid SQL`: covers AC-T2
- [ ] `test/fakes/d1.spec.ts` > `batch rolls back when one statement fails`: covers AC-T4
- [ ] `test/fakes/migrations.spec.ts` > `applies .sql files in name order from a temp dir`: covers AC-T3 (use a temp dir under `os.tmpdir()`, not `migrations/`)
- [ ] `test/fakes/migrations.spec.ts` > `missing or empty migrations dir is a no-op`: covers AC-T3
- [ ] `test/fakes/migrations.spec.ts` > `runs without CLOUDFLARE_API_TOKEN`: covers AC-T1 (delete the variable inside the test, then use the fake)

## Files this task may touch
- `sheet-rag/vitest.unit.config.mts` (new: plain `vitest/config`, no cloudflare plugin, `environment: node`, include globs as in AC-T1)
- `sheet-rag/package.json` (only change the `test` script to `vitest --config vitest.unit.config.mts`; no other change; do not add dependencies)
- `sheet-rag/test/fakes/d1.ts`
- `sheet-rag/test/fakes/migrations.ts`
- `sheet-rag/test/fakes/d1.spec.ts`
- `sheet-rag/test/fakes/migrations.spec.ts`

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
