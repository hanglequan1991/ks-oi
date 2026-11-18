// Billing page routes (STORY-11). Registers GET /bill (Vietnamese) and
// GET /en/bill (English) on the app passed in, through the app's `mount` hook.
// Language comes from the URL path, so each page is registered at both paths.
// The page is hidden: noindex comes from createApp, and this module adds no
// links, cookies or other endpoints. Only GET is registered.

import type { Context, Hono } from "hono";
import type { SiteSettings } from "../../db/settings";
import type { Lang } from "../i18n/t";
import type { WebEnv } from "../app";
import { renderPage } from "../render";
import { BillPage } from "../pages/Bill";

export interface BillRouteDeps {
	getSettings(): Promise<SiteSettings>;
}

// Shell has no personal data, so it may be cached at the edge.
const BILL_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

export function registerBillRoutes(app: Hono<WebEnv>, deps: BillRouteDeps): void {
	const render = (lang: Lang) => async (c: Context<WebEnv>) => {
		// Read once per request. The route does not memoise between requests.
		const settings = await deps.getSettings();
		c.header("Cache-Control", BILL_CACHE_CONTROL);
		// Called as a function (not as JSX) because this file is .ts.
		return renderPage(
			c,
			BillPage({
				lang,
				path: c.req.path,
				origin: new URL(c.req.url).origin,
				settings,
			}),
		);
	};

	app.get("/bill", render("vi"));
	app.get("/en/bill", render("en"));
}
