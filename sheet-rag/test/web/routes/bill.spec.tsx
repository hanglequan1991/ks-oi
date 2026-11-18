import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import { createApp, type WebEnv } from "../../../src/web/app";
import { registerBillRoutes } from "../../../src/web/routes/bill";
import { renderPage } from "../../../src/web/render";
import { Layout } from "../../../src/web/pages/Layout";
import { CSP } from "../../../src/web/middleware/security";
import { t } from "../../../src/web/i18n/t";
import type { SiteSettings } from "../../../src/db/settings";

const SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Thông báo VI",
	disclaimerEn: "En notice",
};

const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": CSP,
	"X-Frame-Options": "DENY",
};

function expectSecurityHeaders(res: Response) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		expect(res.headers.get(name), name).toBe(value);
	}
}

// Escapes the characters Hono's JSX escapes, so a dictionary label can be
// searched for in the rendered HTML.
function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function makeApp(getSettings: () => Promise<SiteSettings>, routes: string[] = []) {
	const app = createApp({
		getSettings,
		mount: (a) => {
			const before = a.routes.length;
			registerBillRoutes(a as Hono<WebEnv>, { getSettings });
			for (const r of a.routes.slice(before)) routes.push(`${r.method} ${r.path}`);
		},
	});
	return app;
}

function sampleApp(getSettings: () => Promise<SiteSettings>) {
	const app = makeApp(getSettings);
	// A second page built with Layout, mounted in the same app, for the link check.
	app.get("/sample", (c) =>
		renderPage(
			c,
			<Layout
				lang={c.get("lang")}
				path={c.req.path}
				origin={new URL(c.req.url).origin}
				title="Sample"
				settings={SETTINGS}
				showsPrice={false}
			>
				<p>hello</p>
			</Layout>,
		),
	);
	return app;
}

describe("registerBillRoutes", () => {
	it("bill page is Vietnamese without any sign-in or cookie", async () => {
		const app = makeApp(async () => SETTINGS);
		const res = await app.request("/bill");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain('<html lang="vi"');
		expect(html).toContain(esc(t("vi", "bill.title")));
		expect(res.headers.get("set-cookie")).toBeNull();

		const req = await app.request("/bill", {
			headers: { Authorization: "Bearer nope", Cookie: "session=abc" },
		});
		expect(req.status).toBe(200);
		expect(req.headers.get("set-cookie")).toBeNull();
	});

	it("en bill page is English with disclaimer and fee note", async () => {
		const app = makeApp(async () => SETTINGS);
		const res = await app.request("/en/bill");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<html lang="en"');
		expect(html).toContain(esc(t("en", "bill.title")));
		expect(html).toContain("En notice");
		expect(html).toContain("Includes 10% service fee");
	});

	it("no page links to the billing page", async () => {
		const app = sampleApp(async () => SETTINGS);
		const billVi = await (await app.request("/bill")).text();
		const billEn = await (await app.request("/en/bill")).text();
		const sample = await (await app.request("/sample")).text();

		// The billing page may only link to its own language twin (Layout toggle),
		// and to canonical or alternate tags. No <a href> points to a bill URL.
		for (const [html, twin] of [
			[billVi, "/en/bill"],
			[billEn, "/bill"],
		] as const) {
			const anchors = [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
			const billAnchors = anchors.filter((h) => /^(\/en)?\/bill\/?(\?|#|$)/.test(h));
			expect(billAnchors).toEqual([twin]);
		}

		// The sample page (header, footer, toggle) never links to a bill URL.
		const sampleHrefs = [...sample.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
		expect(sampleHrefs.filter((h) => /bill/.test(h))).toEqual([]);
	});

	it("sitemap and robots do not mention the billing page", async () => {
		const app = makeApp(async () => SETTINGS);
		for (const path of ["/sitemap.xml", "/robots.txt"]) {
			const res = await app.request(path);
			expect(res.status, path).toBe(404);
			expect(await res.text(), path).not.toMatch(/bill/i);
		}

		const source = readFileSync(
			new URL("../../../src/web/routes/bill.ts", import.meta.url),
			"utf8",
		);
		expect(source).not.toMatch(/sitemap|robots/i);
	});

	it("bill pages are noindex in header and meta", async () => {
		const app = makeApp(async () => SETTINGS);
		for (const path of ["/bill", "/en/bill"]) {
			const res = await app.request(path);
			expect(res.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
			const html = await res.text();
			// Hono may print the void element as <meta ... /> or <meta ...>.
			expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"\s*\/?>/);
		}
	});

	it("no admin link, no cookie, only the two bill routes", async () => {
		const routes: string[] = [];
		const app = makeApp(async () => SETTINGS, routes);
		for (const path of ["/bill", "/en/bill"]) {
			const res = await app.request(path);
			const html = await res.text();
			expect(html, path).not.toContain("/admin");
			expect(res.headers.get("set-cookie"), path).toBeNull();
		}
		const billRoutes = routes.filter((r) => /bill/.test(r));
		expect(billRoutes.sort()).toEqual(["GET /bill", "GET /en/bill"]);
		expect(routes.filter((r) => /admin/.test(r))).toEqual([]);
	});

	it("post is not accepted and nothing is echoed", async () => {
		const app = makeApp(async () => SETTINGS);
		const note = "secret-note-text-42";
		for (const path of ["/bill", "/en/bill"]) {
			const res = await app.request(path, {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: note,
			});
			expect([404, 405], path).toContain(res.status);
			expect(await res.text(), path).not.toContain(note);
		}
	});

	it("edge cache header and settings change", async () => {
		let settings: SiteSettings = SETTINGS;
		let calls = 0;
		const app = makeApp(async () => {
			calls += 1;
			return settings;
		});

		const first = await app.request("/en/bill");
		expect(first.status).toBe(200);
		expect(first.headers.get("cache-control")).toBe(CACHE_CONTROL);
		const firstHtml = await first.text();
		expect(firstHtml).toContain("Includes 10% service fee");
		expect(calls).toBe(1);

		settings = { ...SETTINGS, serviceFeePercent: 12.5, disclaimerEn: "Changed notice" };
		const second = await app.request("/en/bill");
		expect(second.headers.get("cache-control")).toBe(CACHE_CONTROL);
		const secondHtml = await second.text();
		expect(secondHtml).toContain("Includes 12.5% service fee");
		expect(secondHtml).toContain("Changed notice");
		expect(secondHtml).not.toContain("Includes 10% service fee");
		expect(calls).toBe(2);
	});

	it("settings failure gives a safe 500", async () => {
		const app = makeApp(async () => {
			throw new Error("db down");
		});
		const res = await app.request("/bill");
		expect(res.status).toBe(500);
		expectSecurityHeaders(res);
		expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
		const body = await res.text();
		expect(body).not.toContain("db down");
	});
});
