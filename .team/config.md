# Team config

Detection result: the repository was empty when the team was set up (no manifests, no source), so **nothing could be detected**. Replace every `TODO` below. Agents must stop and ask if they hit a `TODO`.

## Commands

| Purpose | Command |
|---|---|
| Build | `TODO: e.g. dotnet build / npm run build` |
| Unit tests (all) | `TODO: e.g. dotnet test / npm test` |
| Unit tests (single file or filter) | `TODO: e.g. dotnet test --filter "FullyQualifiedName~X" / npm test -- <file>` |
| E2E / automation tests (all) | `TODO: e.g. npx playwright test` |
| E2E / automation tests (single file) | `TODO: e.g. npx playwright test tests/e2e/<file>` |

## Local model (local-dev agent)

| Setting | Value |
|---|---|
| Script | `scripts/local-dev.ps1` (run with `pwsh -File`; falls back to `powershell -File` on Windows) |
| Ollama endpoint | `http://localhost:11434` (script auto-starts `ollama serve` from `%LOCALAPPDATA%\Programs\Ollama`) |
| Model | `mimo-v2.6:9b-q4_K_M` (script default; `TODO: confirm it is pulled: ollama list`) |
| Context / max output | 8192 / 2000 tokens (script defaults) |
| Runs on | the user's Windows machine only; not available in cloud sessions |

## Where tests live

- Unit tests: `TODO: e.g. next to the code, or tests/unit/, or <Project>.Tests/`
- Automation (e2e) tests: `TODO: e.g. tests/e2e/`
- Naming convention for automation tests: `TODO: e.g. TC-<n>.spec.ts`

## Stack notes (optional)

- Frontend: `TODO`
- Backend: `TODO`
- Database: `TODO`
