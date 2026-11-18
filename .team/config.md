# Team config

Filled on 2026-11-18 with the values approved by the user (they match section 3.3 of `technical-design.html`). The application lives in `sheet-rag/`; all commands below run inside that folder.

## Commands

| Purpose | Command |
|---|---|
| Build | `npx wrangler deploy --dry-run` |
| Unit tests (all) | `npm test -- --run` |
| Unit tests (single file or filter) | `npm test -- --run <file>` |
| E2E / automation tests (all) | `npx playwright test` |
| E2E / automation tests (single file) | `npx playwright test e2e/<file>` |

## Where tests live

- Unit and integration tests: `sheet-rag/test/`, mirroring `sheet-rag/src/` (`*.spec.ts`). Fixtures in `sheet-rag/test/fixtures/`, fakes in `sheet-rag/test/fakes/`.
- Automation (e2e) tests: `sheet-rag/e2e/`
- Naming convention for automation tests: `TC-<n>.e2e.ts`

## Stack notes

- Frontend: server-rendered Hono JSX plus small vanilla TypeScript bundles (`sheet-rag/src/client/`).
- Backend: Cloudflare Worker in TypeScript (Hono for routes, plus `scheduled` and `queue` handlers).
- Database: Cloudflare D1 (SQLite) for website data; Vectorize for the existing chat and semantic search.

## Constraints for agents

- Playwright is not installed yet; adding it is part of the first tasks.
- The AI and Vectorize bindings run against real Cloudflare and need credentials, so unit and integration tests must use fakes passed in through a small dependencies interface.
- The sandbox cannot reach Cloudflare or Google Sheets. Deploying, creating the real D1 database and running remote database commands are done by the owner on their own machine.
- Folder import rules are in `technical-design.html` section 3.4.
