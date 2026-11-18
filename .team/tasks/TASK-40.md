# TASK-40: Node-only Playwright config and CJS-loadable fakes for the self-contained e2e TCs

- id: TASK-40
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-39 (done), TASK-1 (done)
- size: fits a 100k-token context (one new config, one small edit, one script line, one test)

## Why
Two tooling blockers stop `qa` (see TC-1 QA notes): (1) `playwright.config.ts` starts `wrangler dev --local` as a webServer, which cannot start in the sandbox (workerd: `No such module "cloudflare-internal:ai-api"`) and so blocks every Node-only spec; (2) `test/fakes/migrations.ts` uses `import.meta.url`, and Playwright loads specs as CJS (`package.json` has no `"type": "module"`), so the import throws `Cannot use 'import.meta' outside a module`. Most TCs (TC-1..9, 11..22, 25..38, 40..61) wrap `createApp` with fake deps and need no live site; only TC-10, 23, 24, 39, 62 need a live deployment.

Decision (smallest change; do NOT add `"type": "module"`, it would change how vitest, scripts and wrangler load every file):
1. New `sheet-rag/playwright.node.config.ts`: same `testDir`, `testMatch`, `reporter`, `retries`, `fullyParallel` and the same `chromium` and `mobile` projects as `playwright.config.ts` (define them again with `devices`), but **no `webServer`**, no `baseURL`, and `testIgnore: /TC-(10|23|24|39|62)\.e2e\.ts$/` (the live-deployment TCs). `playwright.config.ts` stays unchanged and remains the config for a live/wrangler run (`npm run e2e`, or `E2E_BASE_URL=... npx playwright test`).
2. New script `"e2e:node": "playwright test -c playwright.node.config.ts"` in `package.json` (nothing else changes).
3. In `test/fakes/migrations.ts` remove `import.meta.url` and `fileURLToPath`: `DEFAULT_MIGRATIONS_DIR = join(process.cwd(), "migrations")`. Both vitest (`npm test`) and Playwright run with cwd `sheet-rag/`, so the default is the same folder; the optional `dir` parameter stays. No other fake uses `import.meta` (checked: `d1.ts` has none).
`e2e/TC-1.e2e.ts` already uses `__dirname` and needs no change. Command for node specs after the fix: `npm run e2e:node` or `npx playwright test -c playwright.node.config.ts e2e/TC-1.e2e.ts`.

## Acceptance criteria
1. AC1: `playwright.node.config.ts` default export has `testDir` `./e2e`, `testMatch` for `*.e2e.ts`, the `chromium` and `mobile` projects, **no `webServer`**, and a `testIgnore` that matches `TC-10`, `TC-23`, `TC-24`, `TC-39`, `TC-62` and does not match `TC-1`, `TC-11`, `TC-100`.
2. AC2: `package.json` has the script `e2e:node` (`playwright test -c playwright.node.config.ts`); the existing `e2e` script and all dependencies are unchanged.
3. AC3: `test/fakes/migrations.ts` contains no `import.meta`, and `applyMigrations(db)` with no `dir` still applies `sheet-rag/migrations/*.sql` in name order (existing `test/fakes/migrations.spec.ts` stays green).
4. AC4: Playwright can load a spec that imports `test/fakes/migrations` under the CJS loader: `npx playwright test -c playwright.node.config.ts --list` exits 0 and lists `e2e/TC-1.e2e.ts` tests, without starting any web server.
5. AC5: `playwright.config.ts` is unchanged and the full vitest suite (`npm test -- --run`) stays green.

## Unit tests to write
In `test/client/playwright-node-config.spec.ts` (no browser; vitest, may use `node:child_process` for the `--list` run, timeout 60 s):
- [ ] `node config has no webServer and ignores live TCs`: covers AC1 (also asserts the regex matches TC-10/23/24/39/62 and not TC-1/TC-11/TC-100)
- [ ] `package has the e2e:node script and keeps e2e`: covers AC2
- [ ] `migrations fake has no import.meta`: covers AC3 (reads the file text)
- [ ] `playwright --list loads the node config and TC-1 under CJS`: covers AC4 (runs `npx playwright test -c playwright.node.config.ts --list`, expects exit 0 and `TC-1.e2e.ts` in stdout)
- [ ] `main config still has its webServer`: covers AC5 (imports `playwright.config.ts`, `webServer` defined when `E2E_BASE_URL` is unset)
Add to `test/fakes/migrations.spec.ts` if it does not already cover it: `applyMigrations without dir uses the repo migrations folder`: covers AC3.

## Files this task may touch
- `sheet-rag/playwright.node.config.ts` (new)
- `sheet-rag/package.json` (only the new `e2e:node` script)
- `sheet-rag/test/fakes/migrations.ts`
- `sheet-rag/test/fakes/migrations.spec.ts` (only to add the one test above)
- `sheet-rag/test/client/playwright-node-config.spec.ts` (new)

Shared files: `package.json` (do not run in parallel with any other task touching it).

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red: 4 new tests failed as expected (node config missing, script missing, import.meta present, --list failed). Green after the change.
- Full vitest: 43 files, 290 tests passed. `npx playwright test -c playwright.node.config.ts --list` exits 0 and lists TC-1 (chromium and mobile).
- Comment in migrations.ts avoids the literal text `import.meta` (the no-import.meta test reads the file text).

## Review
Verdict: approve

- AC1-AC5 each covered by a meaningful test (config shape + regex positive/negative cases, package scripts, no import.meta, `--list` under CJS, main config webServer; plus the no-dir migrations test).
- `env -u CLOUDFLARE_API_TOKEN npm test -- --run`: 43 files, 290 tests passed.
- `npx playwright test -c playwright.node.config.ts e2e/TC-1.e2e.ts --trace off --project=chromium`: 1 passed.
- Only the 5 listed files changed; package.json diff is only the `e2e:node` line; `playwright.config.ts` unchanged; testIgnore covers TC-10/23/24/39/62.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
