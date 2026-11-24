# Team config

Detection result: one project, `sheet-rag/` (Cloudflare Worker, TypeScript, vitest with `@cloudflare/vitest-plugin`). **Run every command from `sheet-rag/`** (`cd sheet-rag`). Replace any remaining `TODO`; agents must stop and ask if they hit one.

## Commands

| Purpose | Command |
|---|---|
| Install | `npm install` |
| Build / type-check | `npx tsc --noEmit` |
| Unit tests (all) | `npx vitest run` |
| Unit tests (single file or filter) | `npx vitest run test/lookup/<name>.spec.ts` (filter by name: `npx vitest run -t "<test name>"`) |
| E2E / automation tests (all) | `npx playwright test` (Playwright is not installed yet: the first qa task adds it; it runs against `npx wrangler dev`) |
| E2E / automation tests (single file) | `npx playwright test tests/e2e/<file>` |

## Local model (local-dev agent)

| Setting | Value |
|---|---|
| Script | `scripts/local-dev.ps1` (run with `pwsh -File`; falls back to `powershell -File` on Windows) |
| Ollama endpoint | `http://localhost:11434` (script auto-starts `ollama serve` from `%LOCALAPPDATA%\Programs\Ollama`) |
| Model | `mimo-v2.6:9b-q4_K_M` (script default; `TODO: confirm it is pulled: ollama list`) |
| Context / max output | 8192 / 2000 tokens (script defaults) |
| Runs on | the user's Windows machine only; not available in cloud sessions |

## Where tests live

- Unit tests: `sheet-rag/test/`, mirroring `sheet-rag/src/` (e.g. `src/lookup/price.ts` -> `test/lookup/price.spec.ts`)
- Automation (e2e) tests: `sheet-rag/tests/e2e/`
- Naming convention for automation tests: `TC-<n>.spec.ts`

## Stack notes

- Frontend: server-rendered HTML from the Worker (no framework, no build step); state in the URL query string; language in `localStorage["hd.lang"]` (see TASK-19)
- Backend: Cloudflare Workers, TypeScript (ESM), Workers AI + Vectorize bindings; optional KV `DIRECTORY_KV` for the directory snapshot
- Database: none yet (directory data comes from a JSON snapshot in KV written by the Sheets import, STORY-2)
- Windows runs: use `npx.cmd` if PowerShell blocks `npx`
