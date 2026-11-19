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
3. Optional: set `SKIP_TABS` in `vars` to a JSON array of `"File name/Tab name"` strings to leave out. The default `"[]"` skips nothing.
4. Set the secret that guards the manual trigger (not stored in the file):
   ```sh
   npx wrangler secret put SYNC_TOKEN
   ```
   Without `SYNC_TOKEN`, `POST /internal/sync` answers 404. With it, send `Authorization: Bearer <token>`.
5. Deploy with `npx wrangler deploy -c wrangler.hotel.jsonc` (or `npm run deploy:hotel`). The cron `0 * * * *` runs the sync every hour. This is one string in `triggers.crons`; change it there if you want a different schedule (for example daily).
6. After the first run, check the file and tab counts against the Drive folder. The sync reports counts and failure codes only (no sheet content).

Until the row parser is in place, every tab is reported with `parser_not_configured` and nothing is published. This is expected for this release.
