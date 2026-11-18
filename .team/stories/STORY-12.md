# STORY-12: Recover and stabilise the sheet-rag worker

- id: STORY-12
- status: blocked        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

Blocked: waiting for the owner to commit the real deployed source to the repo.

## User need
As the project owner, I want the real source of the deployed "sheet-rag" Worker in the repository, building cleanly and covered by tests that run without Cloudflare credentials, so that the team can extend it safely without breaking the live search, chat and hourly sync.

Decisions: .team/decision.md (2026-11-18, Version 1 rows and the row on Phase 2 prerequisites). Specification: implementation-plan.html (Phase 0), technical-design.html (sections 3 and 15).

## Scope
- In:
  - The real deployed source (search, chat, hourly sheet sync with queue, admin endpoints) is present in the repo and replaces the old prototype copy.
  - The project builds and type-checks without errors using the commands in .team/config.md.
  - The deployed behaviour is kept unchanged (same routes, same responses, same sync behaviour).
  - Unit and integration tests that run with no Cloudflare credentials, using fakes for the AI and Vectorize services.
  - Playwright installed and configured so end-to-end tests can be written and run.
  - A clear written warning that deploying the old repo prototype would overwrite production and must not happen.
- Out:
  - New features, new routes or any change to deployed behaviour.
  - Deploying to Cloudflare (the owner does this on their own machine).
  - The Mytour legal check and go/no-go (recorded separately by the owner).
  - The older chatbot-era stories STORY-1 to STORY-10 are not changed; STORY-2 (sheet import) and STORY-3 (chat answers) describe behaviour that this story only preserves.
- Precondition: the owner commits the real deployed source to the repo. Until then nothing can start.

## Acceptance criteria
1. AC1: Given the real deployed source has been committed by the owner, when the repo is inspected, then the worker contains the search, chat, hourly sync with queue and admin endpoints, and the old prototype entry point no longer stands in for them.
2. AC2: Given a clean checkout, when the build command from .team/config.md runs, then it finishes with no errors.
3. AC3: Given a clean checkout, when the type check runs, then it reports no errors.
4. AC4: Given the recovered source, when its routes and sync behaviour are compared with the deployed worker, then every route, response shape and sync rule is unchanged.
5. AC5: Given a machine with no Cloudflare credentials, when the unit test command runs, then all tests run and pass without any call to real Cloudflare services.
6. AC6: Given the tests, when they exercise search, chat or the sync, then the AI and Vectorize services are replaced by fakes supplied by the test.
7. AC7: Given the existing deployed behaviours (search, chat, sync of a changed tab, skipping an unchanged tab, removing a dropped tab), when the tests run, then each behaviour is covered by at least one passing test.
8. AC8: Given a clean checkout, when the end-to-end test command runs, then Playwright starts and a minimal smoke test passes.
9. AC9: Given the project documentation, when a developer reads it, then it states in plain words that the old repo prototype must never be deployed because it would overwrite the production worker.
10. AC10: Given any change made under this story, when it is reviewed, then no deploy was performed and no production data was touched.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
