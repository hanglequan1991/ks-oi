# TASK-34: Client bundle build (esbuild script, no extra tooling)

- id: TASK-34
- story: [STORY-11](../stories/STORY-11.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- assignee: dev
- rework count: 0
- depends on: TASK-6 (it also edits `package.json` and `package-lock.json`: run **after** TASK-6, never in parallel with TASK-6 or TASK-39), TASK-1 (`test` script), TASK-26 (creates `src/domain/money.ts` with `parseVnd`, imported by the AC-B1/B2 test entry; this task does not touch it)
- size: fits a 100k-token context (one small script, one test, three config lines)

## Why
Technical design 18.11: `src/client/bill/main.ts` is bundled to `public/bill.js`. Decision: use **esbuild** called from a 20-line Node script. It is already installed in `node_modules` as a dependency of wrangler and vitest (version 0.28.x), so no new heavy tool; the task only declares it explicitly as a devDependency. No Cloudflare credentials, no network at build time. The bundle is a **build output**, not committed (added to `.gitignore`); it is rebuilt by `npm run build:client`, which runs automatically before `npm run deploy` and `npm run dev` through npm `pre` hooks. (Making `wrangler deploy` itself run it, via `build.command` in `wrangler.jsonc`, belongs to TASK-15 which owns that file; note it there.) Serving `public/` through the assets binding is also TASK-15.

`sheet-rag/scripts/build-client.mjs`:
```js
export async function buildClient(o = {})   // { entry='src/client/bill/main.ts', outfile='public/bill.js', minify=true, cwd=process.cwd() } -> { outfile, bytes }
// esbuild.build({ entryPoints:[entry], outfile, bundle:true, format:'iife', target:'es2022', platform:'browser', minify, sourcemap:false, legalComments:'none', logLevel:'silent' })
// when run directly (node scripts/build-client.mjs) it builds with defaults and prints "built public/bill.js (N bytes)"; exit code 1 on error.
```
`package.json` changes (only these): `devDependencies.esbuild` (same minor as installed, `^0.28.2`), scripts `"build:client": "node scripts/build-client.mjs"`, `"predeploy": "npm run build:client"`, `"predev": "npm run build:client"`. Do not touch the existing `test`, `deploy`, `dev` lines (TASK-1 owns `test`).
`sheet-rag/.gitignore`: add `public/bill.js`, `test-results/`, `playwright-report/`.

## Acceptance criteria
1. AC-B1: `buildClient({ entry, outfile })` on a temporary TypeScript entry (written to the OS temp folder by the test) that imports `src/domain/money.ts` produces a single-file browser bundle with no `import`/`require` left, wrapped as an IIFE, and returns its size.
2. AC-B2: With `minify: false` the output still contains the bundled `parseVnd` code, showing that imports from `src/domain/` are bundled (the client may import only `domain/`).
3. AC-B3: A syntax error in the entry makes `buildClient` reject (the build never silently produces an empty file).
4. AC-B4: The script runs with no `CLOUDFLARE_*` variables set and makes no network request.
5. AC-B5: `package.json` has the three scripts and the devDependency; `.gitignore` ignores `public/bill.js` (checked by reading both files in the test).

## Unit tests to write
In `test/client/build.spec.ts` (outputs go to a temp folder, never into `public/`).
- [ ] `builds a ts entry that imports the domain into one iife`: covers AC-B1, AC-B2
- [ ] `a broken entry fails the build`: covers AC-B3
- [ ] `build runs without Cloudflare variables`: covers AC-B4
- [ ] `package scripts and gitignore are in place`: covers AC-B5

## Files this task may touch
- `sheet-rag/scripts/build-client.mjs` (new)
- `sheet-rag/package.json` (only the three scripts and `esbuild` in `devDependencies`)
- `sheet-rag/package-lock.json`
- `sheet-rag/.gitignore`
- `sheet-rag/test/client/build.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
Q (dev, technical, to lead): AC-B1 and AC-B2 and the first unit test require the temp entry to import `src/domain/money.ts` and the bundled output to contain `parseVnd`. Neither exists: `sheet-rag/src/domain/` has only `fold.ts` and `pricing.ts`, and `parseVnd` is not defined anywhere in `sheet-rag/src` or `sheet-rag/test`. TASK-34 does not list `money.ts` as a file it may touch. Options: (a) another task creates `src/domain/money.ts` with `parseVnd` first and TASK-34 depends on it; (b) the test imports an existing domain module instead (e.g. `src/domain/pricing.ts` `finalPrice`) and AC-B2 checks for that function name. Which one should dev use? No code or package.json changes made yet.

A: Use option (a). `src/domain/money.ts` with `parseVnd` is created by TASK-26 (STORY-11 limits and money), which is being implemented now. TASK-34 now declares `depends on: TASK-26`. Do not create or edit `money.ts` here and do not switch to `pricing.ts`; the AC text stays as written. Scope and file list of TASK-34 are unchanged. Start only after TASK-26 is `done` (and TASK-6 per the existing dependency).
