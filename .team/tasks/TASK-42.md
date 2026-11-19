# TASK-42: Deploy the Version 1 site as a separate Worker `hotel-dictionary` (entry, wrangler config, scripts, docs)

- id: TASK-42
- story: [STORY-16](../stories/STORY-16.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-14, TASK-25, TASK-38, TASK-36, TASK-34 (all done)
- size: fits a 100k-token context (4 new files, one small edit to package.json)

## Why
Decision by the user on 2026-11-19: the Version 1 site (billing page and JSON API) is deployed as its own Cloudflare Worker `hotel-dictionary` with its own D1 database; the Phase 2 sheet sync will later write to that D1. The existing `sheet-rag` Worker is NOT changed. `sheet-rag/wrangler.jsonc` and `sheet-rag/src/index.ts` must not be edited.

## Design (read before coding)
- `src/web/app.ts`: `createApp(deps: WebDeps)` applies the guards (security headers, noindex, language, rate limits) and calls `deps.mount(app)`. If `limiters` is omitted it creates in-memory limiters per app instance. `src/web/api/index.ts`: `mountApi({ db, getSettings })` returns a `mount` function (hotels, cities, suggest, config). `src/web/routes/bill.ts`: `registerBillRoutes(app, { getSettings })` registers `/bill` and `/en/bill` (so both languages are covered; the API routes are language-less).
- Pages link `/app.css`, `/lang.js` (Layout) and `/bill.js` (Bill page); `bill.css` is also in `public/`. These four files are served from `public/` by the ASSETS binding.
- `src/site.ts` has its own small env type (do not use the generated `Env`, which describes the `sheet-rag` bindings): `interface SiteEnv { DB: D1Database; ASSETS: Fetcher }`.
- Build the app lazily and cache it per isolate (for example a `WeakMap<SiteEnv, Hono>` or a module variable keyed on `env.DB`), so the in-memory limiter keeps its counters between requests of one isolate. In-memory limiter is accepted for now: it is per isolate, so limits are approximate. A Cloudflare rate-limit binding is a later hardening (put this in a comment in `site.ts` and in the docs).
- Static files: in `fetch`, if the request is `GET`/`HEAD` and the path is one of `/app.css`, `/bill.css`, `/bill.js`, `/lang.js`, return `env.ASSETS.fetch(request)` directly. Everything else goes to the Hono app. In production Cloudflare serves matching files from the assets directory before the Worker runs (default behaviour, no `run_worker_first`), so this branch is mainly a safe fallback and what the unit test exercises. Do NOT set `run_worker_first` (it would send every static request through the Worker and bill it). `html_handling` stays at its default: there are no `.html` files in `public/`, and `/bill` has no matching asset file, so the Worker answers it.
- `getSettings` passed to `createApp`, `mountApi` and `registerBillRoutes` is `() => getSettings(env.DB)` from `src/db/settings.ts` (the real one).
- No `/search`, `/chat`, `/en/search`, `/en/chat` routes exist in this worker, so no guards or stubs for them are needed (the guards in `createApp` are harmless when no handler is mounted; a request to them gets the normal 404).
- Not needed or not allowed here: AI binding, Vectorize binding, `SHEET_CSV_URL` var, `scheduled` or `queue` handlers.

## Acceptance criteria
1. AC1: `src/site.ts` default-exports `{ fetch(request, env, ctx) }`. `GET /bill` returns 200 HTML in Vietnamese and `GET /en/bill` returns 200 HTML in English, both with the five security headers and `X-Robots-Tag: noindex, nofollow` (settings are read through the real `getSettings` from the fake D1 seeded by the migrations; the disclaimer from the seed appears).
2. AC2: `GET /api/config` returns 200 JSON with the settings from the database; `GET /api/hotels` returns 200 JSON with an empty list on an empty database (and a seeded hotel when the test inserts one); `GET /api/cities` returns 200 JSON.
3. AC3: `GET /lang.js` (and `/app.css`, `/bill.js`, `/bill.css`) is answered by `env.ASSETS.fetch` (fake fetcher records the call and its body is returned unchanged); a `/bill` request does not call ASSETS.
4. AC4: An unknown path (`/nope`) returns 404 with the five security headers and noindex; an unknown `/api/nope` returns 404 JSON `{ "error": "not_found" }`; `/search`, `/chat`, `/en/search` and `/en/chat` return 404 (they do not exist in this worker).
5. AC5: Two requests through the same `env` share one app (and limiter): the 61st request in a minute to `/api/config` from one `CF-Connecting-IP` returns 429 with security headers.
6. AC6: `wrangler.hotel.jsonc` parses after stripping comments and has: `name` `hotel-dictionary`; `main` `src/site.ts`; `compatibility_date` equal to the one in `wrangler.jsonc`; `observability.enabled` true; `d1_databases` with binding `DB`, `database_name` `hotel-dictionary`, `database_id` `REPLACE_WITH_D1_ID`, `migrations_dir` `migrations`; `assets` with `directory` `./public` and `binding` `ASSETS` and no `run_worker_first`; `build.command` `npm run build:client`; no `ai`, no `vectorize`; the text `sheet-rag` does not appear anywhere in the file.
7. AC7: `package.json` has the new scripts `deploy:hotel` = `wrangler deploy -c wrangler.hotel.jsonc` and `dry-run:hotel` = `wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel`; all existing scripts and dependencies are unchanged; `wrangler.jsonc` and `src/index.ts` are unchanged (`git diff --stat` shows neither).
8. AC8: `DEPLOY-hotel-dictionary.md` lists, in order, the owner commands (run in `sheet-rag/`): `npx wrangler d1 create hotel-dictionary`; paste the printed `database_id` into `wrangler.hotel.jsonc`; `npx wrangler d1 migrations apply hotel-dictionary --remote -c wrangler.hotel.jsonc`; `npm run build:client`; `npx wrangler deploy -c wrangler.hotel.jsonc` (or `npm run deploy:hotel`); smoke URLs `/bill`, `/en/bill`, `/api/config`, `/api/hotels`, `/api/cities` with the expected result of each; notes that the hotel list is empty until the Phase 2 sync fills the database, that the Cloudflare edge must be in front of the Worker because the rate limiter keys on `CF-Connecting-IP`, and that the limiter is in-memory per isolate (rate-limit binding is a later hardening); plus the dry-run command.

## Unit tests to write
- [ ] `site: GET /bill is Vietnamese with security headers and noindex`: covers AC1
- [ ] `site: GET /en/bill is English with security headers and noindex`: covers AC1
- [ ] `site: /api/config returns database settings`: covers AC2
- [ ] `site: /api/hotels is empty on an empty database and lists a seeded hotel`: covers AC2
- [ ] `site: /api/cities returns 200 JSON`: covers AC2
- [ ] `site: static files go to ASSETS and /bill does not`: covers AC3
- [ ] `site: unknown paths and the absent /search and /chat routes return 404 with headers`: covers AC4
- [ ] `site: the app and limiter are shared per env (429 on the 61st /api/config request)`: covers AC5
- [ ] `wrangler.hotel.jsonc: parses and has the expected fields`: covers AC6
- [ ] `wrangler.hotel.jsonc: does not mention sheet-rag and has no AI or Vectorize`: covers AC6
- [ ] `package.json: has deploy:hotel and dry-run:hotel and keeps the existing scripts`: covers AC7
- [ ] `DEPLOY-hotel-dictionary.md: contains the required commands and URLs`: covers AC8 (simple string checks)

Test setup: `test/web/site.spec.tsx` creates `createFakeD1()` and `applyMigrations(db)` from `test/fakes/`, builds `env = { DB: db as unknown as D1Database, ASSETS: { fetch: vi.fn(...) } as unknown as Fetcher }`, calls `site.fetch(new Request("https://example.test/bill", { headers: { "CF-Connecting-IP": "1.2.3.4" } }), env, ctx)` with a stub `ExecutionContext`. Check `test/web/routes/bill.spec.tsx` and `test/web/api/api.integration.spec.ts` for how existing tests seed hotels and read the CSP constant. For the wrangler test, read the file with `node:fs` and strip `//` and `/* */` comments with a small regex that does not break `https://` inside strings (the file should contain no URLs, so a simple strip is fine); the package.json and docs checks can live in the same spec file (the same folder) or in `test/web/site.spec.tsx`. Put the wrangler/package/docs tests in a second file `test/web/site-config.spec.ts`.

## Manual verification (for the dev, not a unit test)
Run `npx wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel` (or `npm run dry-run:hotel`) inside `sheet-rag/`. Expected: bundle succeeds and lists the `DB` and `ASSETS` bindings. It runs the `build.command` first. If the sandbox has no network or wrangler wants to log in, say so in Dev notes and report the exact message; do not work around it by editing `wrangler.jsonc`. If this wrangler version rejects the top-level `build` key, drop it and instead add `npm run build:client &&` in front of the commands in the two package scripts and in the docs; record that in Dev notes. Also run `npx tsc --noEmit` if the repo has it working (note `src/site.ts` must not import `Env` from the generated types).

## Files this task may touch
- `sheet-rag/src/site.ts` (new)
- `sheet-rag/wrangler.hotel.jsonc` (new)
- `sheet-rag/package.json` (scripts `deploy:hotel` and `dry-run:hotel` only; do not touch `package-lock.json`)
- `sheet-rag/DEPLOY-hotel-dictionary.md` (new)
- `sheet-rag/test/web/site.spec.tsx` (new)
- `sheet-rag/test/web/site-config.spec.ts` (new)

Must NOT touch: `sheet-rag/wrangler.jsonc`, `sheet-rag/src/index.ts`, `worker-configuration.d.ts`, `.gitignore` (if `.wrangler/` is not ignored, say so in Dev notes; pm will raise it).

Shared files: `package.json` (nothing else is in flight on it; TASK-39/40 are done). No other open task touches these files.

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Files: `sheet-rag/src/site.ts` (new), `sheet-rag/wrangler.hotel.jsonc` (new), `sheet-rag/package.json` (two scripts added), `sheet-rag/DEPLOY-hotel-dictionary.md` (new), `sheet-rag/test/web/site.spec.tsx` (new), `sheet-rag/test/web/site-config.spec.ts` (new). Task file updated (Dev notes only).
- TDD: red run failed on missing `src/site`, `wrangler.hotel.jsonc`, the scripts and the docs; green: 12 new tests pass; full unit suite 45 files / 309 tests pass.
- Cache key: the app is cached in a WeakMap keyed on `env.DB` (stable per isolate), as allowed by the design.
- Dry run `npx wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel` exit 0 with wrangler 4.160.1: `build` key accepted (no fallback needed), `[custom build] npm run build:client` ran, bindings listed `env.DB (hotel-dictionary)` and `env.ASSETS`. No network or login needed. The build rewrote `public/bill.js` with identical git content (no diff).
- `.wrangler/` is in `.gitignore` (line 167), so no `.gitignore` change is needed.
- `npx tsc --noEmit`: no errors in the new files; existing errors elsewhere (src/index.ts, src/client, src/web/routes/bill.ts JSX typing) were already there and are not touched.
- Process note: once I ran `git stash` in `sheet-rag/` by mistake and popped it at once. The stash held only my `package.json` edit; the tree is restored, the stash list is empty, and `wrangler.jsonc` and `src/index.ts` are unchanged.

## Review
<!-- Written by lead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
