import type { MiddlewareHandler } from "hono";

export const CSP =
	"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": CSP,
	"X-Frame-Options": "DENY",
};

/**
 * Sets the baseline security headers on every response. Runs after the rest
 * of the chain (`await next()`), so it also covers 404s and errors turned into
 * responses by `app.onError`. Handler-set headers are kept, except the five
 * security headers below, which are always set.
 */
export function securityHeaders(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			c.res.headers.set(name, value);
		}
	};
}

/** Sets `X-Robots-Tag: noindex, nofollow` on every response it wraps. */
export function noindex(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		c.res.headers.set("X-Robots-Tag", "noindex, nofollow");
	};
}
