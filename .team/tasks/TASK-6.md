# TASK-6: Web test and build setup (Hono dependency, JSX, test globs)

- id: TASK-6
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: review
- assignee: dev
- rework count: 0
- depends on: TASK-1 (edits the `vitest.unit.config.mts` that TASK-1 creates)
- size: fits a 100k-token context (few files, one behaviour)

## Why
STORY-16 code is Hono JSX under `src/web/` and `src/client`-style scripts under `public/`. Today `hono` is not installed, `tsconfig.json` does not compile `.tsx` or use `hono/jsx`, and TASK-1's unit config only collects `test/db`, `test/domain`, `test/migrations`, `test/fakes`. This is the single setup task that every other STORY-16 task depends on, so no other task edits `package.json`, `tsconfig.json` or the unit config (this avoids shared-file conflicts). `src/index.ts`, `vitest.config.mts` and `test/index.spec.ts` must NOT be edited.

Steps:
- `npm install hono` inside `sheet-rag/` (adds a `dependencies` entry; the sandbox proxy allows npm). No other dependency (Zod arrives with STORY-15 if needed).
- `vitest.unit.config.mts`: add `test/web/**/*.spec.{ts,tsx}` and `test/client/**/*.spec.ts` to `include`; add `esbuild: { jsx: 'automatic', jsxImportSource: 'hono/jsx' }`. Keep the old globs and `environment: node`.
- `tsconfig.json`: set `"jsxImportSource": "hono/jsx"` and add `"src/**/*.tsx"` to `include`. Do not change other options.

## Acceptance criteria
Supports every STORY-16 AC (all later tasks need it).
1. AC-S1: `npm test -- --run test/web/smoke.spec.tsx` passes with no `CLOUDFLARE_API_TOKEN`: the test renders a Hono JSX element (`<p>hi</p>`) to a string and answers a request through `new Hono().get('/', c => c.text('ok'))` with `app.request('/')`.
2. AC-S2: The old globs still work: `npm test -- --run test/fakes` (TASK-1 specs) still passes.
3. AC-S3: `npx tsc --noEmit` reports no new errors caused by the `.tsx` smoke file (errors that already exist in `src/index.ts` are not this task's concern).

## Unit tests to write
- [ ] `test/web/smoke.spec.tsx` > `renders hono jsx to a string`: covers AC-S1
- [ ] `test/web/smoke.spec.tsx` > `hono app answers app.request without Cloudflare`: covers AC-S1
- [ ] `test/web/smoke.spec.tsx` > `runs with no CLOUDFLARE_API_TOKEN`: covers AC-S1 (delete the variable inside the test)
- [ ] AC-S2 and AC-S3 are checked by running the commands and recording the output in Dev notes.

## Files this task may touch
- `sheet-rag/package.json` (only add `hono` to `dependencies`)
- `sheet-rag/package-lock.json`
- `sheet-rag/vitest.unit.config.mts`
- `sheet-rag/tsconfig.json`
- `sheet-rag/test/web/smoke.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red: before setup, `test/web/smoke.spec.tsx` was not collected ("No test files found") because the unit config did not include `test/web`.
- `npm install hono` ran fine. `hono` was already in `package.json` at HEAD (added by another commit), so my install left `package.json` unchanged relative to HEAD.
- JSX: the `esbuild` option in `vitest.unit.config.mts` alone was ignored by vitest 5 / vite 8 (it still used `react/jsx-dev-runtime`). Added `oxc: { jsx: { runtime: "automatic", importSource: "hono/jsx" } }`, which fixed it. The `esbuild` block is kept as requested.
- `hono/jsx/dom/server` does not exist in the installed hono, so the smoke test renders with `(<p>hi</p>).toString()`.
- AC-S1: `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/web/smoke.spec.tsx` gives `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- AC-S2: `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/fakes` gives `Test Files 2 passed (2)`, `Tests 8 passed (8)`.
- AC-S3: `npx tsc --noEmit` shows only the pre-existing errors in `src/index.ts` (lines 46 and 57, `Ai_Cf_Baai_Bge_M3_Output` has no `data`). Nothing from `test/` or the `.tsx` file.
- Full suite note: `npm test -- --run` now also collects `test/migrations/0001_init.spec.ts`, which fails with ENOENT on `sheet-rag/migrations/0001_init.sql`. That file does not exist yet and `test/migrations/` is untracked work from another task. This is not caused by this task, but the full suite is red until that migration file lands.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
