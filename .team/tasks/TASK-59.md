# TASK-59: Add test/sync to the unit test include list

- id: TASK-59
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- rework count: 0
- depends on: none (MUST RUN FIRST: every STORY-14 task with specs under `sheet-rag/test/sync/` depends on it)
- size: fits a 100k-token context (one config line, one test)

## Acceptance criteria
1. AC1: `sheet-rag/vitest.unit.config.mts` `test.include` also contains `"test/sync/**/*.spec.ts"`; the existing entries are unchanged.
2. AC2: this is the ONLY task allowed to touch `vitest.unit.config.mts`; no other STORY-14 task edits it.

## Unit tests to write
- [ ] `unit config includes test/sync specs`: covers AC1 (imports the config, asserts `test.include` contains `test/sync/**/*.spec.ts` and still contains the six existing globs)

## Files this task may touch
- `sheet-rag/vitest.unit.config.mts`
- `sheet-rag/test/client/vitest-config.spec.ts` (new)

## Dev notes

## Review

Verdict: approve (2026-11-19). AC1 and AC2 met: one include line added, six existing globs unchanged, test/client/vitest-config.spec.ts asserts all seven. Only the two listed files changed.

## Questions
