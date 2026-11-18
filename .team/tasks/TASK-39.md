# TASK-39: Playwright tooling for the later e2e test cases

- id: TASK-39
- story: [STORY-11](../stories/STORY-11.md)
- type: backend        <!-- frontend | backend -->
- status: review
- assignee: dev
- rework count: 0
- depends on: TASK-34 (both edit `package.json` and `package-lock.json`: never in parallel; run after TASK-34), TASK-6. Running the e2e tests against a real page also needs TASK-15 (Worker entry wired to the web app and `public/` served), which is blocked on the owner; this task does not.
- size: fits a 100k-token context (one config file, a dependency, one test)

## Why
`.team/config.md` says Playwright is not installed and adding it is part of the first tasks, but no earlier task does it. The e2e test cases for STORY-11 (`e2e/TC-<n>.e2e.ts`, written later by `qa` from the TCs of `qalead`; they are **not** dev unit tasks) need the tooling and a config. Browsers are downloaded on the owner's or CI machine (`npx playwright install chromium`); the unit tests below need no browser and no Cloudflare credentials.

Steps: add `@playwright/test` to `devDependencies` and a script `"e2e": "playwright test"` (nothing else in `package.json`); create `sheet-rag/playwright.config.ts`:
- `testDir: './e2e'`, `testMatch: /.*\.e2e\.ts$/`, one project `chromium` (desktop) and one `mobile` (`devices['Pixel 7']`, used for the card layout);
- `use.baseURL` from `process.env.E2E_BASE_URL` or `http://127.0.0.1:8787`;
- `webServer`: command `npm run build:client && npx wrangler dev --local --port 8787`, `url` the base URL, `reuseExistingServer: true`, `timeout: 120_000` (local mode, no Cloudflare login; when `E2E_BASE_URL` is set the web server is skipped);
- `reporter: 'list'`, `retries: 0`, `fullyParallel: true`.
The vitest unit config (TASK-1/TASK-6) must not collect `e2e/`: do not edit it; the test below checks that its `include` has no `e2e` entry.

## Acceptance criteria
1. AC-P1: `playwright.config.ts` default export has `testDir` `./e2e`, matches `*.e2e.ts` only, defines the `chromium` and `mobile` projects, the base URL fallback and a `webServer` unless `E2E_BASE_URL` is set.
2. AC-P2: `package.json` has `@playwright/test` in `devDependencies` and the `e2e` script; no other changes.
3. AC-P3: `vitest.unit.config.mts` does not include `e2e` (so `npm test -- --run` never starts a browser).
4. AC-P4: loading the config runs with no `CLOUDFLARE_API_TOKEN` and downloads nothing.

## Unit tests to write
In `test/client/playwright-config.spec.ts` (imports the config; no browser).
- [ ] `config points at the e2e folder and the two projects`: covers AC-P1
- [ ] `package has the dependency and script`: covers AC-P2
- [ ] `unit config does not collect e2e files`: covers AC-P3
- [ ] `config loads without Cloudflare variables`: covers AC-P4

## Files this task may touch
- `sheet-rag/package.json` (only `@playwright/test` in `devDependencies` and the `e2e` script)
- `sheet-rag/package-lock.json`
- `sheet-rag/playwright.config.ts` (new)
- `sheet-rag/test/client/playwright-config.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Installed `@playwright/test` ^1.65.1 with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (no browser download). package.json gained only the devDependency line and the `e2e` script; lockfile gained the @playwright/test and playwright entries only.
- Mobile project uses `devices["Pixel 7"]` (viewport 412x839 in this version); the test compares against the device object, not a hardcoded size.
- Chromium project uses `devices["Desktop Chrome"]`.
- Full unit suite: 24 files, 149 tests passing; vitest unit config untouched.

## Review
Verdict: approve
- Full suite run: 24 files, 149 tests green. The 4 listed tests exist (plus one extra on E2E_BASE_URL) and cover AC-P1 to AC-P4.
- package.json: only `@playwright/test` (^1.65.1) in devDependencies and the `e2e` script were added. package-lock.json: 46 added lines, only @playwright/test, playwright and playwright-core entries. No browser download occurred (`~/.cache/ms-playwright` does not exist). vitest.unit.config.mts untouched and has no e2e include. playwright.config.ts matches the spec.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
