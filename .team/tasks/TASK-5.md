# TASK-5: Database access for settings (src/db/settings.ts)

- id: TASK-5
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-3 (seeded settings) and TASK-4 (`parseFeePercent`, `parseBoolSetting`, `DEFAULT_FEE_PERCENT`); TASK-1 for the fake
- size: fits a 100k-token context (few files, one behaviour)

## Why
Lets the application read the settings (STORY-13 AC10). `src/db/` may import `src/domain/` only (section 3.4). It takes the database as a parameter (`D1Database` type, which is a global from `worker-configuration.d.ts`; do not import from `src/index.ts` or `src/env.ts`, which do not exist yet), so tests pass the fake from TASK-1.

Required exports in `sheet-rag/src/db/settings.ts`:
```ts
export type SiteSettings = {
  serviceFeePercent: number;   // 0..100
  showFeeNote: boolean;
  disclaimerVi: string;
  disclaimerEn: string;
};
export async function getSettings(db: D1Database, onWarn?: (msg: string) => void): Promise<SiteSettings>;
```
Behaviour: one query (`SELECT key, value FROM settings`), values mapped with TASK-4's parsers. Keys: `service_fee_percent`, `show_fee_note`, `disclaimer_vi`, `disclaimer_en`. A missing or invalid fee falls back to 10 and calls `onWarn` with the warning (default: `console.warn`); a missing `show_fee_note` falls back to `true`. Missing disclaimer keys give an empty string (the database seed is the source of the wording; no text is duplicated in code). Read-only: no writes (editing tool is out of scope).

## Acceptance criteria
1. AC10: Given a migrated and seeded database, `getSettings` returns `serviceFeePercent` 10, `showFeeNote` true and the Vietnamese and English disclaimer texts (equal to the agreed texts), and the test uses the local fake database, so it runs with no Cloudflare credentials.
2. AC3: after the seed, the returned fee is 10 and the fee note is true.
3. AC4: the returned disclaimer texts equal the agreed wording (literals in the test, copied from implementation-plan.html section 5).
4. AC5: after changing `service_fee_percent` to `12` and `show_fee_note` to `false`, then re-applying all migrations, `getSettings` returns 12 and false.
5. AC10 (robustness): a non-numeric fee value (`'abc'`) gives 10 and calls `onWarn` once; an empty `settings` table gives fee 10, fee note true and empty disclaimers without throwing.

## Unit tests to write
All in `test/db/settings.spec.ts`, using `createFakeD1()` and `applyMigrations()`; cast the fake to `D1Database`.
- [ ] `returns seeded fee, fee note and both disclaimers`: covers AC10, AC3, AC4
- [ ] `returns changed values after migrations are re-applied`: covers AC5
- [ ] `invalid fee falls back to 10 and warns`: covers AC10 (robustness)
- [ ] `empty settings table gives safe defaults`: covers AC10 (robustness)
- [ ] `runs with no CLOUDFLARE_API_TOKEN in the environment`: covers AC10

## Files this task may touch
- `sheet-rag/src/db/settings.ts` (new)
- `sheet-rag/test/db/settings.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
