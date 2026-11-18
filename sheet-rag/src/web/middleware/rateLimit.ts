import type { Context, MiddlewareHandler } from "hono";

/**
 * Matches the Workers Rate Limiting binding (`env.X.limit({ key })`), so the
 * real binding can be passed in without changes (TASK-15).
 */
export interface RateLimiter {
	limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface MemoryLimiterOptions {
	/** Maximum requests per key within one window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
	/** Clock in milliseconds; defaults to Date.now. */
	now?: () => number;
}

export interface MemoryLimiter extends RateLimiter {
	/** Number of keys currently held (for tests and diagnostics). */
	size(): number;
}

const PURGE_THRESHOLD = 10_000;

/**
 * Fixed-window limiter kept in memory. Each key gets a window that starts at
 * its first request. Expired keys are purged when the map grows past
 * PURGE_THRESHOLD, so memory stays bounded by live traffic.
 */
export function createMemoryLimiter(opts: MemoryLimiterOptions): MemoryLimiter {
	const now = opts.now ?? Date.now;
	const store = new Map<string, { count: number; resetAt: number }>();

	const purge = (t: number) => {
		for (const [key, entry] of store) {
			if (entry.resetAt <= t) store.delete(key);
		}
	};

	return {
		async limit({ key }) {
			const t = now();
			let entry = store.get(key);
			if (!entry || t >= entry.resetAt) {
				if (!entry && store.size >= PURGE_THRESHOLD) purge(t);
				entry = { count: 0, resetAt: t + opts.windowMs };
				store.set(key, entry);
			}
			entry.count++;
			return { success: entry.count <= opts.limit };
		},
		size: () => store.size,
	};
}

export interface RateLimitOptions {
	/** A limiter, or a resolver that finds one per request (undefined = fail open). */
	limiter: RateLimiter | ((c: Context) => RateLimiter | undefined);
	/** Separates counters per route group, e.g. "search" and "chat". */
	keyPrefix: string;
	/** Value of the `error` field in the 429 body. Default "too_many_requests". */
	message?: string;
	/** Client identifier; default is CF-Connecting-IP, then X-Forwarded-For, then "unknown". */
	clientKey?: (c: Context) => string;
	/** Value of the Retry-After header in seconds. Default 60. */
	retryAfterSeconds?: number;
}

function defaultClientKey(c: Context): string {
	const cf = c.req.header("CF-Connecting-IP")?.trim();
	if (cf) return cf;
	const xff = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
	if (xff) return xff;
	return "unknown";
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
	const clientKey = opts.clientKey ?? defaultClientKey;
	const message = opts.message ?? "too_many_requests";
	const retryAfter = String(opts.retryAfterSeconds ?? 60);

	return async (c, next) => {
		// Fail open: a missing or broken limiter must not take the site down.
		let allowed = true;
		try {
			const limiter =
				typeof opts.limiter === "function" ? opts.limiter(c) : opts.limiter;
			if (limiter) {
				({ success: allowed } = await limiter.limit({
					key: `${opts.keyPrefix}:${clientKey(c)}`,
				}));
			} else {
				console.warn("rateLimit: no limiter available, failing open");
			}
		} catch (err) {
			console.warn("rateLimit: limiter failed, failing open", err);
		}

		if (allowed) return next();

		c.header("Retry-After", retryAfter);
		return c.json({ error: message }, 429);
	};
}
