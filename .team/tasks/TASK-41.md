# TASK-41: Pick the preinstalled Chromium once in the node Playwright config

- id: TASK-41
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-40 (done)
- size: fits a 100k-token context (one config, one spec)

## Why
Playwright 1.65.1 expects a Chromium revision that is not in `/opt/pw-browsers`. The directory holds `chromium-1243/chrome-linux64/chrome` (full Chromium), `chromium_headless_shell-1243/chrome-headless-shell-linux64/` (headless shell), `chromium/` and `ffmpeg-1011/`. Browser TCs fail unless each sets `launchOptions.executablePath`; qa did this inline in `e2e/TC-11.e2e.ts` (lines 117-122). Do it once in `playwright.node.config.ts`. Do NOT edit `e2e/TC-11.e2e.ts` or `package.json`; the inline workaround stays harmless (qa may remove it later).

Design: export a helper `resolveChromiumPath(env = process.env, exists = existsSync, defaultPath = () => chromium.executablePath(), globRoot = "/opt/pw-browsers"): string | undefined` (injectable so it is unit-testable without touching the disk), and `launchArgs(isRoot)`. Order:
1. `env.PW_CHROMIUM_PATH` if set and non-empty (returned as is, no existence check).
2. If Playwright's own default (`chromium.executablePath()` from `@playwright/test`) exists, return `undefined` (normal machine with `npx playwright install` is unaffected).
3. Else the first existing (name-sorted, `chromium-*` directories only) `<root>/chromium-*/chrome-linux64/chrome`; if none, the first existing `<root>/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`.
4. Else `undefined`.
`use.launchOptions` for both the `chromium` and `mobile` projects is `{ executablePath, args }`, where `executablePath` is omitted when undefined and `args: ["--no-sandbox"]` only when `process.getuid?.() === 0` (otherwise no `args`). Keep all other config (testDir, testMatch, testIgnore, no webServer, devices) as is.

## Acceptance criteria
1. AC1: `resolveChromiumPath` returns `PW_CHROMIUM_PATH` when set and non-empty, even if Playwright's default exists.
2. AC2: With no env override and Playwright's default browser existing, it returns `undefined`.
3. AC3: With no env override and the default missing, it returns the first existing `chromium-*/chrome-linux64/chrome` under the root; falls back to `chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`; returns `undefined` when neither exists.
4. AC4: `launchArgs(true)` is `["--no-sandbox"]`; `launchArgs(false)` is `[]` and the project `launchOptions` carries no `args` when not root.
5. AC5: Both the `chromium` and `mobile` projects of the config default export use the same `launchOptions` (executablePath only when resolved, `--no-sandbox` only when root); `webServer` is still undefined and `testIgnore` unchanged.
6. AC6: On this machine `npx playwright test -c playwright.node.config.ts --list` still exits 0 (existing test) and `e2e/TC-11.e2e.ts` can launch a browser without its inline override (dev checks manually; not a unit test).

## Unit tests to write
In `test/client/playwright-node-config.spec.ts` (add to the existing file, keep existing tests green; use injected fakes for `env`, `exists`, `defaultPath`, and a temp dir for the glob root):
- [ ] `PW_CHROMIUM_PATH wins over everything`: covers AC1
- [ ] `returns undefined when the default browser exists`: covers AC2
- [ ] `picks the first chromium-* chrome when default is missing`: covers AC3
- [ ] `falls back to headless shell, then undefined`: covers AC3
- [ ] `launchArgs adds --no-sandbox only for root`: covers AC4
- [ ] `chromium and mobile projects share the resolved launchOptions`: covers AC5 (expected value computed with the same helper and `process.getuid`)

## Files this task may touch
- `sheet-rag/playwright.node.config.ts`
- `sheet-rag/test/client/playwright-node-config.spec.ts`

Shared files: none besides TASK-40's (done).

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
