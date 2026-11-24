# Board

Owned by `pm`. One table per story. Statuses: todo, in-progress, review, rework, done, blocked.

Table format (copy for each story; test cases go in the same table with Type `qa`):

## STORY-<n>: <title>

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|

## STORY-11: Hotel Dictionary lookup (search, filter, sort, browse, detail)

Serial dispatch order (one local-dev at a time). Paths are under `sheet-rag/`; each task = one production file + one test file.

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| TASK-1 | backend | src/lookup/normalize.ts, test/lookup/normalize.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-2 | backend | src/lookup/price.ts, test/lookup/price.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-3 | backend | src/lookup/rooms.ts, test/lookup/rooms.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-4 | backend | src/lookup/fees.ts, test/lookup/fees.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-5 | backend | src/lookup/options.ts, test/lookup/options.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-1 |
| TASK-6 | backend | src/lookup/filter.ts, test/lookup/filter.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-1 |
| TASK-7 | backend | src/lookup/sort.ts, test/lookup/sort.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-1 |
| TASK-8 | backend | src/lookup/browse.ts, test/lookup/browse.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-9 | backend | src/lookup/paging.ts, test/lookup/paging.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-10 | backend | src/lookup/tags.ts, test/lookup/tags.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-11 | backend | src/lookup/building.ts, test/lookup/building.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-12 | backend | src/lookup/related.ts, test/lookup/related.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-13 | backend | src/lookup/language.ts, test/lookup/language.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-14 | backend | src/lookup/escape.ts, test/lookup/escape.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-16 | backend | src/lookup/query.ts, test/lookup/query.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: none |
| TASK-15 | backend | src/lookup/data.ts, test/lookup/data.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-4 |
| TASK-17 | backend | src/lookup/store.ts, test/lookup/store.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-15 |
| TASK-18 | frontend | src/lookup/i18n.ts, test/lookup/i18n.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14 |
| TASK-19 | frontend | src/lookup/layout.ts, test/lookup/layout.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-18, TASK-13 |
| TASK-20 | backend | src/lookup/cards.ts, test/lookup/cards.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-2, TASK-3, TASK-4, TASK-15 |
| TASK-21 | backend | src/lookup/directoryModel.ts, test/lookup/directoryModel.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-5, TASK-6, TASK-7, TASK-8, TASK-9, TASK-10, TASK-2, TASK-16, TASK-20 |
| TASK-22 | frontend | src/lookup/view/card.ts, test/lookup/view/card.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-18, TASK-21 |
| TASK-23 | frontend | src/lookup/view/filters.ts, test/lookup/view/filters.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-18, TASK-21 |
| TASK-24 | frontend | src/lookup/view/nav.ts, test/lookup/view/nav.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-16, TASK-18, TASK-21 |
| TASK-25 | frontend | src/lookup/view/directoryPage.ts, test/lookup/view/directoryPage.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-19, TASK-21, TASK-22, TASK-23, TASK-24, TASK-16, TASK-18 |
| TASK-26 | backend | src/lookup/detailModel.ts, test/lookup/detailModel.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-2, TASK-3, TASK-4, TASK-7, TASK-11, TASK-12, TASK-14, TASK-15, TASK-20 |
| TASK-27 | frontend | src/lookup/view/gallery.ts, test/lookup/view/gallery.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-18 |
| TASK-28 | frontend | src/lookup/view/rooms.ts, test/lookup/view/rooms.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-14, TASK-18, TASK-26 |
| TASK-29 | frontend | src/lookup/view/info.ts, test/lookup/view/info.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-11, TASK-14, TASK-18, TASK-26 |
| TASK-30 | frontend | src/lookup/view/detailPage.ts, test/lookup/view/detailPage.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-19, TASK-26, TASK-27, TASK-28, TASK-29, TASK-14, TASK-18 |
| TASK-31 | backend | src/lookup/router.ts, test/lookup/router.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-16, TASK-17, TASK-20, TASK-21, TASK-25, TASK-26, TASK-30 |
| TASK-32 | backend | src/index.ts, test/index.spec.ts | local-dev | todo | 0 | executor: local-dev; depends: TASK-31, TASK-17 |
