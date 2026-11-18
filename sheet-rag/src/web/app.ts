// Hono app composition (TASK-14). Wires the guards in front of the routes and
// lets later stories mount their routes through `mount`. Everything it needs
// comes in through WebDeps, so it runs under plain Vitest with fakes.
// Does not import the Worker entry (src/index.ts) or any Cloudflare binding.

import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SiteSettings } from "../db/settings";
import { DEFAULT_LANG, langFromPath, t, type Lang } from "./i18n/t";
import { CHAT_MAX_CHARS, SEARCH_MAX_CHARS, inputLimit } from "./middleware/inputLimit";
import { createMemoryLimiter, rateLimit, type RateLimiter } from "./middleware/rateLimit";
import { noindex, securityHeaders } from "./middleware/security";

export interface WebDeps {
	/** Production: `() => getSettings(env.DB)` from src/db/settings.ts. */
	getSettings(): Promise<SiteSettings>;
	/** Optional; a memory limiter with RATE_LIMITS defaults is created when missing. */
	limiters?: {
		search?: RateLimiter;
		chat?: RateLimiter;
		suggest?: RateLimiter;
		data?: RateLimiter;
	};
	/** Later stories register their routes here (after the guards). */
	mount?: (app: Hono<WebEnv>) => void;
}

export type WebEnv = { Variables: { lang: Lang; settings: SiteSettings } };

/** Fixed-window limits per route group, per client IP. */
export const RATE_LIMITS = {
	search: { limit: 20, windowMs: 60_000 },
	chat: { limit: 20, windowMs: 60_000 },
	suggest: { limit: 120, windowMs: 60_000 },
	data: { limit: 60, windowMs: 60_000 },
};

// Query and body fields checked for length. The real field name varies, so
// every candidate is covered. Body fields are passed on every route so the
// JSON body check runs on POST routes.
const QUERY_FIELDS = ["q", "query"];
const BODY_FIELDS = ["q", "query", "message", "text"];

// Request-scoped settings loaders, keyed by the Hono context. The language
// middleware registers one memoized loader per request, so getSettings runs
// at most once and only when a page asks for settings.
const settingsLoaders = new WeakMap<Context<WebEnv>, () => Promise<SiteSettings>>();

/**
 * Returns the site settings for this request. Reads the database on first
 * use only; later calls in the same request reuse the result.
 */
export async function getSiteSettings(c: Context<WebEnv>): Promise<SiteSettings> {
	const cached = c.get("settings");
	if (cached !== undefined) return cached;
	const load = settingsLoaders.get(c);
	if (!load) throw new Error("getSiteSettings: context was not created by createApp");
	const settings = await load();
	c.set("settings", settings);
	return settings;
}

function langOf(c: Context<WebEnv>): Lang {
	return c.get("lang") ?? DEFAULT_LANG;
}

export function createApp(deps: WebDeps): Hono<WebEnv> {
	const app = new Hono<WebEnv>();

	const limiters = {
		search: deps.limiters?.search ?? createMemoryLimiter(RATE_LIMITS.search),
		chat: deps.limiters?.chat ?? createMemoryLimiter(RATE_LIMITS.chat),
		suggest: deps.limiters?.suggest ?? createMemoryLimiter(RATE_LIMITS.suggest),
		data: deps.limiters?.data ?? createMemoryLimiter(RATE_LIMITS.data),
	};

	// Global guards, in order: security headers and noindex wrap every response
	// (including 404s and errors), then the language and lazy settings loader.
	app.use("*", securityHeaders());
	app.use("*", noindex());
	app.use("*", async (c, next) => {
		c.set("lang", langFromPath(c.req.path));
		let pending: Promise<SiteSettings> | undefined;
		settingsLoaders.set(c, () => (pending ??= (async () => deps.getSettings())()));
		await next();
	});

	// Route-group guards: rate limit first, then the input cap, then the handler.
	// Refused requests never reach the handler (and so never reach the AI service).
	app.use(
		"/search",
		rateLimit({ limiter: limiters.search, keyPrefix: "search" }),
		inputLimit({ queryFields: QUERY_FIELDS, bodyFields: BODY_FIELDS, maxChars: SEARCH_MAX_CHARS }),
	);
	app.use(
		"/chat",
		rateLimit({ limiter: limiters.chat, keyPrefix: "chat" }),
		inputLimit({ queryFields: QUERY_FIELDS, bodyFields: BODY_FIELDS, maxChars: CHAT_MAX_CHARS }),
	);
	app.use(
		"/api/suggest",
		rateLimit({ limiter: limiters.suggest, keyPrefix: "suggest" }),
		inputLimit({ queryFields: ["q"], bodyFields: ["q"], maxChars: SEARCH_MAX_CHARS }),
	);
	// One `use` per path: this Hono version does not accept an array of paths.
	// "/api/hotels/*" also matches the bare "/api/hotels", so it is not listed
	// twice (a second guard would count each request twice).
	const dataLimit = rateLimit({ limiter: limiters.data, keyPrefix: "data" });
	app.use("/api/hotels/*", dataLimit);
	app.use("/api/cities", dataLimit);
	app.use("/api/config", dataLimit);

	// Later stories register their routes here.
	deps.mount?.(app);

	app.notFound((c) => {
		const lang = langOf(c);
		if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
		return c.text(t(lang, "errors.notFound"), 404);
	});

	app.onError((err, c) => {
		if (err instanceof HTTPException) return err.getResponse();
		console.error(err);
		return c.text(t(langOf(c), "errors.generic"), 500);
	});

	return app;
}
