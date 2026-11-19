// Internal sync trigger (STORY-14, TASK-55). Registers POST /internal/sync on the
// app passed in. Guards, in order: the route answers 404 (same as an unknown
// route) when the secret is unset or empty; then the rate limit (per client IP,
// before the token check, so guessing is throttled); then the bearer token,
// compared in constant time. Only the Authorization header is read; a token in
// the query string is ignored. The route is hidden: noindex and no-store on
// every response, and no links, sitemap entries or pages point to it.
// The sync itself is injected as runSync, so this file has no Cloudflare binding.

import type { Context, Hono, MiddlewareHandler } from "hono";
import type { WebEnv } from "../app";
import { createMemoryLimiter, rateLimit, type RateLimiter } from "../middleware/rateLimit";
import { noindex } from "../middleware/security";

export interface InternalSyncDeps {
	/** Production: `() => env.SYNC_TOKEN`. Unset or empty disables the route (404). */
	getToken: () => string | undefined;
	/** Production: the folder sync. `force` comes from `?force=1`. */
	runSync: (opts: { force: boolean }) => Promise<unknown>;
	/** Optional; defaults to 5 requests per minute per client IP. */
	limiter?: RateLimiter;
}

/** Per client IP, before the token check. */
export const SYNC_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

const enc = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/**
 * Compares two strings in constant time. Both sides are hashed with SHA-256
 * first, so the comparison always runs over 32 bytes whatever the lengths,
 * and every byte is XORed (no early return).
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
	const ha = await sha256(a);
	const hb = await sha256(b);
	let diff = 0;
	for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
	return diff === 0;
}

/** Returns the token from `Authorization: Bearer <token>`, or undefined. */
function bearerToken(c: Context<WebEnv>): string | undefined {
	const match = /^Bearer ([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
	return match?.[1];
}

const noStore: MiddlewareHandler = async (c, next) => {
	await next();
	c.res.headers.set("Cache-Control", "no-store");
};

export function registerInternalSyncRoute(app: Hono<WebEnv>, deps: InternalSyncDeps): void {
	const path = "/internal/sync";
	const limiter = deps.limiter ?? createMemoryLimiter(SYNC_RATE_LIMIT);

	app.use(path, noindex(), noStore);

	// Secret gate: with no secret the route does not exist. c.notFound() returns
	// the same response as an unknown route.
	const secretGate: MiddlewareHandler<WebEnv> = async (c, next) => {
		const secret = deps.getToken();
		if (!secret) return c.notFound();
		return next();
	};

	const tokenCheck = async (c: Context<WebEnv>) => {
		const secret = deps.getToken() ?? "";
		const presented = bearerToken(c);
		if (!presented || !(await constantTimeEqual(presented, secret))) {
			return c.json({ error: "unauthorized" }, 401);
		}
		try {
			const summary = await deps.runSync({ force: c.req.query("force") === "1" });
			return c.json(summary as object, 200);
		} catch (err) {
			console.error("internal sync failed", err);
			return c.json({ error: "sync_failed" }, 500);
		}
	};

	app.post(path, secretGate, rateLimit({ limiter, keyPrefix: "sync" }), tokenCheck);
}
