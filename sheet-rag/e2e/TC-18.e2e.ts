// TC-18: Every page and response carries a noindex instruction (STORY-16, AC9).
// HTTP checks run through the `request` fixture; the DOM check runs in the browser.
// The harness is inline: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// No Cloudflare credentials are needed: getSettings is a fake. The browser is chosen by playwright.node.config.ts.
// The 429 check uses the data rate limit from RATE_LIMITS (TC-20 owns the limit values); the test reads the
// limit from the code instead of hard-coding it. The client IP for the 429 is 203.0.113.9 (X-Forwarded-For).
// Wording note: step 3 says "pages with an X-Forwarded-For"; the pages themselves are not needed for the 429,
// so the 429 is read from /api/hotels with that header. The unknown path for step 2 is /nope.

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createApp, RATE_LIMITS, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
import { formatPrice } from "../src/web/pages/components/PriceBlock";
import { t } from "../src/web/i18n/t";
import type { SiteSettings } from "../src/db/settings";
import type { Hono } from "hono";
import { html } from "hono/html";

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

const PUBLIC_DIR = join(__dirname, "..", "public");
const STATIC_FILES: Record<string, string> = {
	"/lang.js": "application/javascript; charset=utf-8",
	"/app.css": "text/css; charset=utf-8",
};

// Sample settings from the TC test data.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const SAMPLE_AMOUNT = 1375000;
const HTML_PAGES = ["/sample", "/en/sample", "/priced", "/en/priced"];
const NOINDEX = "noindex, nofollow";
const RATE_LIMITED_IP = "203.0.113.9";

// Sample routes: two HTML page pairs (with and without a price), one JSON route. The unknown path is left unmounted.
function samplePages(app: Hono<WebEnv>) {
	const sample: Parameters<Hono<WebEnv>["get"]>[1] = (c) => {
		const lang = c.get("lang");
		return renderPage(
			c,
			Layout({
				lang,
				path: c.req.path,
				origin: new URL(c.req.url).origin,
				title: t(lang, "bill.title"),
				settings: SAMPLE_SETTINGS,
				showsPrice: false,
				children: html`<h1>${t(lang, "common.siteName")}</h1><p>${t(lang, "common.langVi")}</p>`,
			}),
		);
	};
	const priced: Parameters<Hono<WebEnv>["get"]>[1] = (c) => {
		const lang = c.get("lang");
		const price = formatPrice(SAMPLE_AMOUNT, lang);
		return renderPage(
			c,
			Layout({
				lang,
				path: c.req.path,
				origin: new URL(c.req.url).origin,
				title: t(lang, "bill.title"),
				settings: SAMPLE_SETTINGS,
				showsPrice: true,
				children: html`<h1>${t(lang, "common.siteName")}</h1><span class="price" data-price>${price}</span>`,
			}),
		);
	};
	app.get("/sample", sample);
	app.get("/en/sample", sample);
	app.get("/priced", priced);
	app.get("/en/priced", priced);
	app.get("/api/hotels", (c) => c.json({ hotels: [] }));
}

// Converts a Node request to a Fetch API Request. GET and HEAD carry no body in this test.
function toRequest(req: IncomingMessage): Request {
	const origin = `http://${req.headers.host ?? "127.0.0.1"}`;
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
	}
	return new Request(new URL(req.url ?? "/", origin), { method: req.method ?? "GET", headers });
}

async function writeResponse(res: Response, nodeRes: ServerResponse): Promise<void> {
	const headers: Record<string, string> = {};
	res.headers.forEach((value, name) => {
		headers[name] = value;
	});
	nodeRes.writeHead(res.status, headers);
	nodeRes.end(Buffer.from(await res.arrayBuffer()));
}

function startHarness(): Promise<{ server: Server; base: string }> {
	const app = createApp({
		getSettings: async () => SAMPLE_SETTINGS,
		mount: (a) => samplePages(a),
	});

	const server = createServer((req, nodeRes) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
		const staticType = STATIC_FILES[url.pathname];
		if (staticType !== undefined) {
			const body = readFileSync(join(PUBLIC_DIR, url.pathname));
			nodeRes.writeHead(200, { "Content-Type": staticType });
			nodeRes.end(body);
			return;
		}
		app
			.fetch(toRequest(req))
			.then((res) => writeResponse(res, nodeRes))
			.catch((err: unknown) => {
				nodeRes.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
				nodeRes.end(String(err));
			});
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			resolve({ server, base: `http://127.0.0.1:${port}` });
		});
	});
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((err) => (err ? reject(err) : resolve()));
	});
}

// Returns the content of every <meta name="robots"> tag in an HTML string, in document order.
function robotsMetaContents(body: string): string[] {
	const tags = body.match(/<meta\b[^>]*>/gi) ?? [];
	return tags
		.filter((tag) => /\sname="robots"/.test(tag))
		.map((tag) => /\scontent="([^"]*)"/.exec(tag)?.[1] ?? "");
}

// Returns every href that points at the billing page or an admin path.
function hrefsToHiddenPaths(body: string): string[] {
	const hrefs = [...body.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1] ?? "");
	return hrefs.filter((href) => /(^|\/)(bill|admin)(\/|\?|#|$)/i.test(href));
}

test.describe("TC-18: every page and response carries a noindex instruction", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	// Step 1 and expected 1: every HTML page has the header and the meta, and links nothing hidden (expected 5).
	test("step 1: HTML pages send X-Robots-Tag and the robots meta", async ({ request }) => {
		for (const path of HTML_PAGES) {
			const res = await request.get(`${base}${path}`);
			expect(res.status(), path).toBe(200);
			expect(res.headers()["content-type"], path).toContain("text/html");
			expect(res.headers()["x-robots-tag"], path).toBe(NOINDEX);

			const body = await res.text();
			expect(robotsMetaContents(body), path).toEqual([NOINDEX]);
			expect(body, path).toContain(`<meta name="robots" content="${NOINDEX}"`);
			expect(hrefsToHiddenPaths(body), path).toEqual([]);
		}
	});

	// Step 2 and expected 2: the JSON route and the 404 carry the header.
	test("step 2: JSON and 404 responses send X-Robots-Tag", async ({ request }) => {
		const json = await request.get(`${base}/api/hotels`);
		expect(json.status()).toBe(200);
		expect(json.headers()["content-type"]).toContain("application/json");
		expect(json.headers()["x-robots-tag"]).toBe(NOINDEX);

		const notFound = await request.get(`${base}/nope`);
		expect(notFound.status()).toBe(404);
		expect(notFound.headers()["x-robots-tag"]).toBe(NOINDEX);
	});

	// Step 3 and expected 3: the 429 carries the header. The limit is read from RATE_LIMITS.data.
	test("step 3: the 429 response sends X-Robots-Tag", async ({ request }) => {
		const headers = { "X-Forwarded-For": RATE_LIMITED_IP };
		const limit = RATE_LIMITS.data.limit;

		// Requests up to the limit pass for this client IP.
		for (let i = 0; i < limit; i++) {
			const ok = await request.get(`${base}/api/hotels`, { headers });
			expect(ok.status(), `request ${i + 1} of ${limit}`).toBe(200);
		}

		// The next request from the same IP is refused.
		const limited = await request.get(`${base}/api/hotels`, { headers });
		expect(limited.status()).toBe(429);
		expect(limited.headers()["content-type"]).toContain("application/json");
		expect(limited.headers()["retry-after"]).toBeDefined();
		expect(limited.headers()["x-robots-tag"]).toBe(NOINDEX);
		expect(await limited.json()).toEqual({ error: "too_many_requests" });
	});

	// Step 4 and expected 4: the browser DOM has the robots meta. Expected 5 is checked in the DOM too.
	test("step 4: the browser DOM contains the robots meta with noindex, nofollow", async ({ page }) => {
		await page.goto(`${base}/sample`);
		const meta = page.locator('meta[name="robots"]');
		await expect(meta).toHaveCount(1);
		await expect(meta).toHaveAttribute("content", NOINDEX);

		await page.goto(`${base}/priced`);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", NOINDEX);
		await expect(page.locator('a[href*="/bill"], a[href*="/admin"]')).toHaveCount(0);
	});
});
