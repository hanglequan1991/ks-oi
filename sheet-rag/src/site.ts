// Entry of the `hotel-dictionary` Worker (TASK-42): the Version 1 site (billing
// page and JSON API) on its own D1 database. It does not use the `sheet-rag`
// bindings (AI, Vectorize, SHEET_CSV_URL) and must not import the generated
// `Env` type, which describes those bindings.
//
// Static files (/app.css, /bill.css, /bill.js, /lang.js) are normally served
// from the assets directory before this Worker runs. The branch below is a safe
// fallback that sends them to the ASSETS binding. `run_worker_first` is not set,
// so static requests are not billed as Worker requests.
//
// Sheet sync (TASK-56): the `scheduled` handler (hourly cron) and POST
// /internal/sync run the same folder sync. A missing, placeholder or invalid
// DRIVE_FOLDER_ID or SKIP_TABS skips the run and logs why; nothing throws out of
// the handler.
//
// Rate limits: the in-memory limiter (createApp default) is per isolate, so the
// limits are approximate. A Cloudflare rate-limit binding is a later hardening.
// The limiter keys on CF-Connecting-IP, so the Cloudflare edge must be in front
// of the Worker.

import type { Hono } from "hono";
import { getSettings } from "./db/settings";
import { mountApi } from "./web/api";
import { createApp, type WebEnv } from "./web/app";
import { registerBillRoutes } from "./web/routes/bill";
import { registerInternalSyncRoute } from "./web/routes/internalSync";
import { createPublicGoogleSource, parseSkipTabs } from "./sync/publicGoogleSource";
import { runSync, type SyncDeps } from "./sync/runSync";
import { SheetConfigError } from "./sync/sheetSource";
import { parseSheetRows } from "./sync/rowParser";

export interface SiteEnv {
	DB: D1Database;
	ASSETS: Fetcher;
	/** Public Drive folder id (a vars value, not a secret). Unset or the placeholder skips the sync. */
	DRIVE_FOLDER_ID?: string;
	/** JSON array of "File name/Tab name" to skip. Unset means none. */
	SKIP_TABS?: string;
	/** Bearer token for POST /internal/sync (a secret). Unset makes the route 404. */
	SYNC_TOKEN?: string;
	/** Optional AI binding. Not used by the site; typed so the env stays honest. */
	AI?: unknown;
}

const STATIC_PATHS = new Set(["/app.css", "/bill.css", "/bill.js", "/lang.js"]);

/** The value shipped in wrangler.hotel.jsonc. It is not a real folder id. */
const PLACEHOLDER_FOLDER_ID = "REPLACE_WITH_DRIVE_FOLDER_ID";

/**
 * Builds the sync dependencies from the env. Throws SheetConfigError when the
 * folder id is unset, blank or the placeholder, or when SKIP_TABS is malformed.
 */
function syncDepsFor(db: D1Database, env: SiteEnv): SyncDeps {
	const folderId = (env.DRIVE_FOLDER_ID ?? "").trim();
	if (folderId === "" || folderId === PLACEHOLDER_FOLDER_ID) {
		throw new SheetConfigError("DRIVE_FOLDER_ID is not configured");
	}
	const source = createPublicGoogleSource({
		folderId,
		skipTabs: parseSkipTabs(env.SKIP_TABS),
	});
	return {
		db,
		source,
		parse: parseSheetRows,
		now: () => new Date().toISOString(),
	};
}

// One app per database binding and isolate, so the in-memory limiter keeps its
// counters between requests. Keyed on env.DB, which is stable for the isolate.
const apps = new WeakMap<object, Hono<WebEnv>>();

function appFor(env: SiteEnv): Hono<WebEnv> {
	const cached = apps.get(env.DB);
	if (cached) return cached;

	const db = env.DB;
	const loadSettings = () => getSettings(db);
	const api = mountApi({ db, getSettings: loadSettings });

	const app = createApp({
		getSettings: loadSettings,
		mount: (a) => {
			api(a);
			registerBillRoutes(a, { getSettings: loadSettings });
			registerInternalSyncRoute(a, {
				getToken: () => env.SYNC_TOKEN,
				runSync: ({ force }) => runSync(syncDepsFor(db, env), { force, kind: "manual" }),
			});
		},
	});
	apps.set(db, app);
	return app;
}

export default {
	async fetch(request: Request, env: SiteEnv, _ctx: ExecutionContext): Promise<Response> {
		const isRead = request.method === "GET" || request.method === "HEAD";
		if (isRead && STATIC_PATHS.has(new URL(request.url).pathname)) {
			return env.ASSETS.fetch(request);
		}
		return appFor(env).fetch(request);
	},

	scheduled(_controller: ScheduledController, env: SiteEnv, ctx: ExecutionContext): void {
		let deps: SyncDeps;
		try {
			deps = syncDepsFor(env.DB, env);
		} catch (err) {
			console.error("scheduled sync skipped", err instanceof Error ? err.message : "unknown");
			return;
		}
		ctx.waitUntil(
			runSync(deps, { kind: "scheduled" }).then(
				() => undefined,
				(err: unknown) => {
					console.error("scheduled sync failed", err);
				},
			),
		);
	},
};
