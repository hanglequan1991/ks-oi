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
// Rate limits: the in-memory limiter (createApp default) is per isolate, so the
// limits are approximate. A Cloudflare rate-limit binding is a later hardening.
// The limiter keys on CF-Connecting-IP, so the Cloudflare edge must be in front
// of the Worker.

import type { Hono } from "hono";
import { getSettings } from "./db/settings";
import { mountApi } from "./web/api";
import { createApp, type WebEnv } from "./web/app";
import { registerBillRoutes } from "./web/routes/bill";

export interface SiteEnv {
	DB: D1Database;
	ASSETS: Fetcher;
}

const STATIC_PATHS = new Set(["/app.css", "/bill.css", "/bill.js", "/lang.js"]);

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
};
