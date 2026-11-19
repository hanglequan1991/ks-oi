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
