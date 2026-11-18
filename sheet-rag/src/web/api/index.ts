// Entry point of the JSON API (STORY-15). The Worker entry passes the result of
// mountApi to createApp as `mount`; it registers the five public read endpoints
// and nothing else (no POST, PUT, PATCH or DELETE). Guards (rate limit, noindex,
// security headers) come from createApp. This file does not touch src/index.ts.

import type { Hono } from "hono";
import type { WebEnv } from "../app";
import { registerHotelRoutes } from "./hotels";
import { registerMetaRoutes } from "./meta";
import type { ApiDeps } from "./types";

/**
 * Returns the function to pass as WebDeps.mount. It registers the hotel routes
 * (/api/hotels, /api/hotels/:slug) and the metadata routes (/api/cities,
 * /api/suggest, /api/config).
 */
export function mountApi(deps: ApiDeps): (app: Hono<WebEnv>) => void {
	return (app) => {
		registerHotelRoutes(app, deps);
		registerMetaRoutes(app, deps);
	};
}

export { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "./types";
