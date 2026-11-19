# Deploy the `hotel-dictionary` Worker

The Version 1 site (billing page and JSON API) is deployed as its own Cloudflare
Worker, `hotel-dictionary`, with its own D1 database. The `sheet-rag` Worker is
not changed. Config: `wrangler.hotel.jsonc`. Entry: `src/site.ts`.

Run every command in `sheet-rag/`. Run the steps in this order.

## Steps (owner, on your machine)

1. Create the D1 database:

   ```sh
   npx wrangler d1 create hotel-dictionary
   ```

2. Copy the `database_id` printed by step 1 and paste it into
   `wrangler.hotel.jsonc`, replacing `REPLACE_WITH_D1_ID`.

3. Apply the migrations to the remote database:

   ```sh
   npx wrangler d1 migrations apply hotel-dictionary --remote -c wrangler.hotel.jsonc
   ```

   Migration order: apply migration `0004` only from the final version of the code. Run this step (the owner runs `wrangler d1 migrations apply`) before you deploy the Worker code in step 5, so the database and the Worker agree.

4. Build the browser bundle (`public/bill.js`):

   ```sh
   npm run build:client
   ```

5. Deploy the Worker:

   ```sh
   npx wrangler deploy -c wrangler.hotel.jsonc
   ```

   or `npm run deploy:hotel`.

## Smoke check

Replace `<your-domain>` with the host that serves the Worker. Expected result:

| URL | Expected |
|---|---|
| `https://<your-domain>/bill` | 200, Vietnamese billing page, shows the disclaimer from the seed |
| `https://<your-domain>/en/bill` | 200, English billing page, shows the English disclaimer |
| `https://<your-domain>/api/config` | 200, JSON with the settings (fee percent, fee note flag, disclaimers) |
| `https://<your-domain>/api/hotels` | 200, JSON with an empty list until the Phase 2 sync fills the database |
| `https://<your-domain>/api/cities` | 200, JSON list of cities (empty until the sync fills the database) |

## Notes

- The hotel list is empty until the Phase 2 sheet sync writes hotels into the
  `hotel-dictionary` database. An empty list is the expected result before that.
- The Cloudflare edge (a proxied route or custom domain in front of the Worker)
  must be in front of the Worker. The rate limiter keys on the `CF-Connecting-IP`
  header, which the edge sets.
- The rate limiter is in-memory and per isolate, so the limits are approximate.
  A Cloudflare rate-limit binding is a later hardening.
- Static files (`/app.css`, `/bill.css`, `/bill.js`, `/lang.js`) are served from
  `public/` by the assets binding. The Worker does not run for them.

## Dry run (no deploy)

Builds the bundle and checks the Worker without uploading it:

```sh
npx wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel
```

or `npm run dry-run:hotel`. The output lists the `DB` and `ASSETS` bindings.

## Sheet sync (folder import)

The Worker syncs hotel data from a public Google Drive folder. It reads the same public Google pages as sheet-rag (no Google credentials).

1. Share the Drive folder and every sheet in it as "Anyone with the link can view". Without this, the sync cannot read them.
2. Set the folder id in `vars` in `wrangler.hotel.jsonc`: replace `REPLACE_WITH_DRIVE_FOLDER_ID` with the public folder id. It is not a secret. Until you do, the scheduled run is skipped and logged.
3. Optional: set `SKIP_TABS` in `vars` to a JSON array of strings to leave out. The default `"[]"` skips nothing. Each entry is one of two forms:
   - `"File name/Tab name"` skips that tab in that one file (the file name has no `.xlsx`).
   - `"Tab name"` alone skips every tab with that exact name, in every file.

   Matching is case-insensitive and Unicode-normalised (NFC), so a decomposed Vietnamese name matches the composed one. Surrounding spaces in an entry are trimmed. Empty or blank entries match nothing. A tab name that contains `/` is matched by a tab-only entry equal to the whole name. The list is read at each run; the code has no built-in list of tabs to skip.

   Recommended default, owner to confirm. These ten tab names are non-hotel tabs found in the live folder. They repeat across city files, so one tab-name entry skips them everywhere. Confirm the list before you use it, then paste it into `SKIP_TABS` in `wrangler.hotel.jsonc`:

   ```json
   [
     "DS KS TOÀN QUỐC",
     "QUY TRÌNH BOOK KS",
     "Trang tính1",
     "Trang tính4",
     "Weekday Pricelist",
     "Weekend Pricelist",
     "Landtour Đà Nẵng",
     "Khách Sạn Và Vé",
     "Đầu Mối Khách Sạn",
     "DU THUYỀN ELITE OF SAIGON"
   ]
   ```

   A tab that becomes skipped is treated as removed by the next run. If its hotel had been synced before, that hotel is hidden from the site on that run.
4. Set the secret that guards the manual trigger (not stored in the file):
   ```sh
   npx wrangler secret put SYNC_TOKEN -c wrangler.hotel.jsonc
   ```
   The `-c` flag is required so the secret goes to the `hotel-dictionary` Worker.
   Without `SYNC_TOKEN`, `POST /internal/sync` answers 404. With it, send `Authorization: Bearer <token>`.
5. Deploy with `npx wrangler deploy -c wrangler.hotel.jsonc` (or `npm run deploy:hotel`). The cron `0 * * * *` runs the sync every hour. This is one string in `triggers.crons`; change it there if you want a different schedule (for example daily).
6. After the first run, check the file and tab counts against the Drive folder (see "Read the sync run log" below).

Until the row parser is in place, every tab is reported with `parser_not_configured` and nothing is published. This is expected for this release.

### Trigger a sync by hand

Keep the token out of the URL. Put it in an environment variable and send it in the header:

```sh
export SYNC_TOKEN=<the token you set in step 4>
curl -X POST https://<your-domain>/internal/sync -H "Authorization: Bearer $SYNC_TOKEN"
```

Responses:

| Status | Body | Meaning |
|---|---|---|
| 200 | JSON summary (below) | The sync ran. |
| 401 | `{"error":"unauthorized"}` | The token is missing or wrong. |
| 404 | not found | `SYNC_TOKEN` is not set on the Worker. Run step 4. |
| 429 | `{"error":"too_many_requests"}` | More than 5 requests per minute from one client IP. Wait a minute. |
| 500 | `{"error":"sync_failed"}` | The run threw an error. The Worker logs the detail; the response carries no detail. |

The optional query parameter `?force=1` re-applies only the next batch of tabs (up to `MAX_TABS_PER_RUN`), even tabs whose content did not change. It does not re-apply the whole folder in one run. Use it only when you need a re-apply. Example: `https://<your-domain>/internal/sync?force=1`.

The 200 response is a JSON summary with counts and failure codes only:

- `created`, `updated`, `failed`, `hidden`, `unchanged`: number of hotels or tabs in each state.
- `failures`: a list of `{ "tab": "<tab name or null>", "reason": "<short code>" }`. `tab` is `null` for a run-level failure. `reason` is a short lowercase code such as `parser_not_configured`; anything else is reported as `unexpected_error`.
- `failed_run: true` (only when the whole run failed).
- `skipped: "already_running"` (only when another run was still in progress).

### Read the sync run log

Each run writes one row to `sync_runs`. The columns are `id`, `kind` (`scheduled` or `manual`), `started_at`, `finished_at`, `created`, `updated`, `failed`, `hidden`, `unchanged` and `notes`. Read the latest five runs:

```sh
npx wrangler d1 execute hotel-dictionary --remote -c wrangler.hotel.jsonc --command "SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 5"
```

### Optional AI binding (off by default)

The AI binding is off. The current Worker code does not read it, and the free-text extractor is not wired into the sync yet. To enable it later, uncomment this in `wrangler.hotel.jsonc` (in the same block as the other bindings):

```jsonc
"ai": { "binding": "AI" }
```

Before you deploy with it on, check that the extractor model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is not deprecated in the Workers AI model list. If it is, the extractor code must be updated first.

## Limits

Each run has two limits, set as plain `vars` in `wrangler.hotel.jsonc`:

- `MAX_TABS_PER_RUN` (default `"25"`): the most tabs one run reads. Tabs past the limit wait for the next run.
- `SUBREQUEST_BUDGET` (default `"40"`): the most outbound requests and D1 calls one run may make. When the budget runs out, the run stops early and records `budget_exhausted`.

The values are strings. Blank or invalid values fall back to the defaults. The defaults fit the Free plan, which allows 50 subrequests per invocation. On the Paid plan (1000 subrequests) the owner may raise them, for example `"1000"` for `SUBREQUEST_BUDGET` and `"200"` for `MAX_TABS_PER_RUN`. Change the values, then redeploy.

A folder of about 450 tabs converges over several hourly runs. At 25 tabs per run that is about 18 hourly runs (about 18 hours) for the first full pass. Later runs only read changed tabs in the same batches. `?force=1` re-applies only the next batch, not the whole folder, so it does not speed up the first pass.

## Pause the sync

To stop the hourly sync without removing the Worker:

1. In `wrangler.hotel.jsonc`, comment out the `triggers.crons` line, or set it to an empty list `[]`.
2. Redeploy: `npx wrangler deploy -c wrangler.hotel.jsonc` (or `npm run deploy:hotel`).

The site keeps serving the last synced data. The manual route `POST /internal/sync` stays available with `SYNC_TOKEN`. To resume, restore the cron `"0 * * * *"` and redeploy.

## Run notes

Each run writes a `notes` value in `sync_runs` (see "Read the sync run log"). Notes use these codes. Each code has one meaning and one action.

| Code | Meaning | Action |
|---|---|---|
| `csv_subrequest_limit` | Google returned a limit error for one tab (too many requests in one invocation). | Lower `MAX_TABS_PER_RUN` or `SUBREQUEST_BUDGET`, or raise the plan limit. The tab is retried next run. |
| `csv_illegal_invocation` | The fetch call was made with the wrong receiver. A code bug, not a Google problem. | Stop the sync (see "Pause the sync") and report it to the developer. |
| `csv_timeout` | Google did not answer in time for one tab. | Usually transient. If it repeats, check the Drive sharing and try again later. |
| `csv_redirect_error` | Google redirected the tab in a way the sync does not follow. | Check that the file is shared as "Anyone with the link can view". |
| `csv_network_other` | Another network error for one tab. | Usually transient. If it repeats, report it to the developer. |
| `aborted_circuit_breaker` | The run stopped after repeated network errors (the breaker opened). | Wait for the next run. If it repeats, pause the sync and check the cause codes above. |
| `budget_exhausted` | The run used all of `SUBREQUEST_BUDGET`. | Normal during the first pass. Raise the budget on the Paid plan, or wait for later runs. |
| `deadline` | The run reached the time limit (soft 8 minutes, hard 10 minutes) and stopped. | Normal for large folders. The rest is picked up next run. |
| `abandoned` | An earlier run never finished and was closed by a later run. | Normal after a crash. Repeated cases: pause the sync and report it. |
| `listing_incomplete` | Info only. The folder listing was only partly read, and the run went on with the part it had. | Check the folder size and the limits. Nothing needs to be done if later runs read the rest. |

Failure reasons in the 200 response (`failures[].reason`) use the same `csv_` codes for tabs.

## Skip list (owner to confirm)

The recommended `SKIP_TABS` list in step 3 comes from a review of the live folder. It is a recommendation only. The owner must confirm each tab name is a non-hotel tab before using it. Once a tab is skipped, its hotels are hidden on the next run.
