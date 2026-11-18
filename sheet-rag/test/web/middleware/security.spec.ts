import { describe, it, expect } from "vitest";
import { Hono, type MiddlewareHandler } from "hono";
import { CSP, noindex, securityHeaders } from "../../../src/web/middleware/security";

const FIVE = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": CSP,
	"X-Frame-Options": "DENY",
};

function buildApp(middleware: MiddlewareHandler[] = []) {
	const app = new Hono();
	for (const mw of middleware) app.use("*", mw);
	app.get("/html", (c) => c.html("<h1>hi</h1>"));
	app.get("/json", (c) => c.json({ ok: true }));
	app.get("/boom", () => {
		throw new Error("kaboom");
	});
	app.onError((_err, c) => c.text("server error", 500));
	return app;
}

describe("security middleware (TASK-11)", () => {
	it("noindex header on html, json and 404", async () => {
		const app = buildApp([noindex()]);

		for (const path of ["/html", "/json", "/missing"]) {
			const res = await app.request(path);
			expect(res.headers.get("X-Robots-Tag"), path).toBe("noindex, nofollow");
		}
	});

	it("security headers on html, json, 404 and 500", async () => {
		const app = buildApp([securityHeaders()]);

		for (const path of ["/html", "/json", "/missing", "/boom"]) {
			const res = await app.request(path);
			for (const [name, value] of Object.entries(FIVE)) {
				expect(res.headers.get(name), `${path} ${name}`).toBe(value);
			}
		}
	});

	it("csp allows only self scripts and styles and https images", () => {
		expect(CSP).toContain("script-src 'self'");
		expect(CSP).toContain("style-src 'self'");
		expect(CSP).toContain("img-src 'self' https:");
		expect(CSP).not.toContain("unsafe-inline");
		expect(CSP).not.toContain("unsafe-eval");
	});

	it("existing headers, status and body are unchanged", async () => {
		const app = new Hono();
		app.use("*", securityHeaders());
		app.use("*", noindex());
		app.get("/cached", (c) => {
			c.header("Cache-Control", "private, max-age=60");
			return c.text("body text", 201);
		});

		const res = await app.request("/cached");
		expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
		expect(res.status).toBe(201);
		expect(await res.text()).toBe("body text");
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		for (const [name, value] of Object.entries(FIVE)) {
			expect(res.headers.get(name), name).toBe(value);
		}

		const notFound = await buildApp([securityHeaders()]).request("/missing");
		expect(notFound.status).toBe(404);
		expect(await notFound.text()).toBe("404 Not Found");

		const boom = await buildApp([securityHeaders()]).request("/boom");
		expect(boom.status).toBe(500);
		expect(await boom.text()).toBe("server error");
	});
});
