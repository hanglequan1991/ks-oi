// TC-16: Every page that shows a price carries the call-to-confirm disclaimer in the page language (STORY-16, AC7).
// Browser test for the rendered pages, plus plain HTTP checks for the 500 responses.
// The harness is inline, as in TC-14 and TC-15: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// getSettings is a fake whose returned settings can be changed per test. The browser is chosen by playwright.node.config.ts.
// Notes on the TC wording:
// - Step 7 says "add a second PriceBlock to /priced". That would change step 1 (one price), so the second
//   PriceBlock goes on its own route, /priced-two (and /en/priced-two). The disclaimer count is still checked.
// - The TC preconditions mount only /priced and /sample, but steps 2 and 5 use /en/priced. All needed routes are mounted here.

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { createApp, getSiteSettings, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
import { PriceBlock } from "../src/web/pages/components/PriceBlock";
import { t, type Lang } from "../src/web/i18n/t";
import type { SiteSettings } from "../src/db/settings";

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

const PUBLIC_DIR = join(__dirname, "..", "public");
const STATIC_FILES: Record<string, string> = {
	"/lang.js": "application/javascript; charset=utf-8",
	"/app.css": "text/css; charset=utf-8",
};

// Sample settings from the TC test data: distinct sample texts, no fee note.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const SAMPLE_AMOUNT = 1375000;
const SECOND_AMOUNT = 990000;

// The settings the fake getSettings returns. A test may replace it; beforeEach restores the sample settings.
let currentSettings: SiteSettings = { ...SAMPLE_SETTINGS };

// Renders a page through Layout and renderPage. Settings come from getSiteSettings, as in production.
async function render(
	c: Context<WebEnv>,
	build: (lang: Lang, settings: SiteSettings) => unknown,
	showsPrice: boolean,
) {
	const lang = c.get("lang");
	const settings = await getSiteSettings(c);
	return renderPage(
		c,
		Layout({
			lang,
			path: c.req.path,
			origin: new URL(c.req.url).origin,
			title: t(lang, "bill.title"),
			settings,
			showsPrice,
			children: build(lang, settings),
		}),
	);
}

// Sample routes, in Vietnamese (no prefix) and English (/en prefix).
function samplePages(app: Hono<WebEnv>) {
	for (const prefix of ["", "/en"]) {
		// No price: the page prints no price and no disclaimer.
		app.get(`${prefix}/sample`, (c) =>
			render(c, (lang) => html`<h1>${t(lang, "common.siteName")}</h1><p>${t(lang, "common.langVi")}</p>`, false),
		);
		// One price, with the disclaimer printed once by Layout (showsPrice true).
		app.get(`${prefix}/priced`, (c) =>
			render(c, (lang, settings) => PriceBlock({ lang, settings, amount: SAMPLE_AMOUNT }), true),
		);
		// Two prices on one page: the disclaimer must still be printed once.
		app.get(`${prefix}/priced-two`, (c) =>
			render(
				c,
				(lang, settings) => [
					PriceBlock({ lang, settings, amount: SAMPLE_AMOUNT }),
					PriceBlock({ lang, settings, amount: SECOND_AMOUNT }),
				],
				true,
			),
		);
		// A PriceBlock with showsPrice false: the renderPage guard must throw, so the page is not served.
		app.get(`${prefix}/broken`, (c) =>
			render(c, (lang, settings) => PriceBlock({ lang, settings, amount: SAMPLE_AMOUNT }), false),
		);
	}
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
		getSettings: async () => currentSettings,
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

// Records uncaught page errors, from now on. A page that renders correctly must not raise one.
function trackPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(err.message));
	return errors;
}

// The five security headers the middleware sets on every response.
const SECURITY_HEADER_NAMES = [
	"x-content-type-options",
	"referrer-policy",
	"strict-transport-security",
	"content-security-policy",
	"x-frame-options",
];

test.describe("TC-16: every page that shows a price carries the disclaimer in the page language", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	test.beforeEach(() => {
		currentSettings = { ...SAMPLE_SETTINGS };
	});

	// Steps 1 and 2: the priced pages show exactly one disclaimer in the page language, next to the price.
	test("steps 1 and 2: /priced and /en/priced show one disclaimer and one price in the page language", async ({ page }) => {
		const pageErrors = trackPageErrors(page);

		// Expected 1: Vietnamese page, one disclaimer with the Vietnamese text, visible; price as 1.375.000 ₫.
		const vi = await page.goto(`${base}/priced`);
		expect(vi?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "vi");
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("VI-SAMPLE-DISCLAIMER");
		await expect(page.locator("[data-disclaimer]")).toBeVisible();
		await expect(page.locator("[data-price]")).toHaveCount(1);
		await expect(page.locator("[data-price]")).toHaveText("1.375.000 ₫");
		await expect(page.locator("[data-price]")).toBeVisible();

		// Expected 2: English page, one disclaimer with the English text, visible; price as 1,375,000 VND.
		const en = await page.goto(`${base}/en/priced`);
		expect(en?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("EN-SAMPLE-DISCLAIMER");
		await expect(page.locator("[data-disclaimer]")).toBeVisible();
		await expect(page.locator("[data-price]")).toHaveCount(1);
		await expect(page.locator("[data-price]")).toHaveText("1,375,000 VND");
		await expect(page.locator("[data-price]")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	// Step 3: a page without a price has no price and no disclaimer, and no error.
	test("step 3: the price-free page has no price and no disclaimer and no error", async ({ page }) => {
		const pageErrors = trackPageErrors(page);

		const response = await page.goto(`${base}/sample`);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "vi");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("vi", "common.siteName"));
		await expect(page.locator("[data-price]")).toHaveCount(0);
		await expect(page.locator("[data-disclaimer]")).toHaveCount(0);

		expect(pageErrors).toEqual([]);
	});

	// Step 4: a price without a disclaimer is not served. The guard answers 500, with the security headers and no price.
	test("step 4: /broken answers 500 with security headers and without a price", async ({ request }) => {
		const response = await request.get(`${base}/broken`);
		expect(response.status()).toBe(500);

		const headers = response.headers();
		for (const name of SECURITY_HEADER_NAMES) {
			expect(headers[name], `security header ${name}`).toBeTruthy();
		}

		const body = await response.text();
		expect(body).not.toContain("data-price");
		expect(body).not.toContain("1.375.000");
		expect(body).not.toContain("1,375,000");
	});

	// Step 5: an empty Vietnamese text falls back to the English text; with both texts empty the page answers 500.
	test("step 5: empty Vietnamese text falls back to English; both empty answers 500", async ({ page, request }) => {
		const pageErrors = trackPageErrors(page);

		// Variant 1: only the Vietnamese text is empty. /priced shows the English text.
		currentSettings = { ...SAMPLE_SETTINGS, disclaimerVi: "" };
		const fallback = await page.goto(`${base}/priced`);
		expect(fallback?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "vi");
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("EN-SAMPLE-DISCLAIMER");
		await expect(page.locator("[data-price]")).toHaveText("1.375.000 ₫");

		// Variant 2: both texts are empty. The page is not served: 500, no price, no silent notice-less page.
		currentSettings = { ...SAMPLE_SETTINGS, disclaimerVi: "", disclaimerEn: "" };
		const broken = await request.get(`${base}/priced`);
		expect(broken.status()).toBe(500);
		const body = await broken.text();
		expect(body).not.toContain("data-price");

		expect(pageErrors).toEqual([]);
	});

	// Step 6: markup in the disclaimer text is escaped: shown as literal text, with no <b> element.
	test("step 6: a <b> in the English disclaimer is shown as literal text", async ({ page }) => {
		const pageErrors = trackPageErrors(page);
		currentSettings = { ...SAMPLE_SETTINGS, disclaimerEn: "<b>x</b>" };

		const response = await page.goto(`${base}/en/priced`);
		expect(response?.status()).toBe(200);
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("<b>x</b>");
		await expect(page.locator("[data-disclaimer] b")).toHaveCount(0);
		await expect(page.locator("[data-disclaimer]")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	// Step 7: the disclaimer is printed once per page, not once per price.
	test("step 7: two prices on one page still give one disclaimer", async ({ page }) => {
		const pageErrors = trackPageErrors(page);

		const response = await page.goto(`${base}/priced-two`);
		expect(response?.status()).toBe(200);
		await expect(page.locator("[data-price]")).toHaveCount(2);
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("VI-SAMPLE-DISCLAIMER");

		expect(pageErrors).toEqual([]);
	});
});
