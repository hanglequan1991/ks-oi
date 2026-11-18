// TC-17: The fee note appears with a price only when the setting is on, in the page language (STORY-16, AC8).
// Browser test for the rendered pages. The harness is inline, as in TC-14 to TC-16: a Node HTTP server on port 0
// converts each request to a Request, calls createApp(deps).fetch, and serves public/lang.js and public/app.css
// (stands in for the assets binding). getSettings is a fake that reads a mutable object, so each step can change
// showFeeNote and serviceFeePercent. The browser is chosen by playwright.node.config.ts.
// Notes on the TC wording:
// - "next to the price": FeeNote is rendered inside the PriceBlock span ([data-price]), so the test checks that the
//   note is a child of the price element. That is the sensible reading of "next to the price".
// - Step 5 opens /sample. The /en/sample page is checked too, since it is the same price-free case in English.

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

// Sample settings from the TC test data: distinct sample texts, fee note on, 10 percent.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const SAMPLE_AMOUNT = 1375000;

// The settings the fake getSettings returns. Each test sets its own; beforeEach restores the sample settings.
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
		// No price: no price element and no fee note.
		app.get(`${prefix}/sample`, (c) =>
			render(c, (lang) => html`<h1>${t(lang, "common.siteName")}</h1><p>${t(lang, "common.langVi")}</p>`, false),
		);
		// One price, with the fee note decided by the settings.
		app.get(`${prefix}/priced`, (c) =>
			render(c, (lang, settings) => PriceBlock({ lang, settings, amount: SAMPLE_AMOUNT }), true),
		);
	}
}

// Converts a Node request to a Fetch API Request. GET carries no body in this test.
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

test.describe("TC-17: the fee note appears with a price only when the setting is on, in the page language", () => {
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

	// Steps 1 and 2: flag on, 10 percent. The note sits inside the price element, in the page language.
	test("steps 1 and 2: /en/priced and /priced show the fee note with 10 percent in the page language", async ({ page }) => {
		const pageErrors = trackPageErrors(page);

		// Expected 1: English page, the note with the exact English text next to the price.
		const en = await page.goto(`${base}/en/priced`);
		expect(en?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("[data-price] [data-fee-note]")).toHaveCount(1);
		await expect(page.locator("[data-fee-note]")).toHaveCount(1);
		await expect(page.locator("[data-fee-note]")).toHaveText("Includes 10% service fee");
		await expect(page.locator("[data-fee-note]")).toBeVisible();

		// Expected 2: Vietnamese page, the note with the Vietnamese text next to the price.
		const vi = await page.goto(`${base}/priced`);
		expect(vi?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "vi");
		await expect(page.locator("[data-price] [data-fee-note]")).toHaveCount(1);
		await expect(page.locator("[data-fee-note]")).toHaveCount(1);
		await expect(page.locator("[data-fee-note]")).toHaveText("Đã bao gồm 10% phí dịch vụ");
		await expect(page.locator("[data-fee-note]")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	// Step 3: flag off. No note on either page; the price and the disclaimer are still shown.
	test("step 3: with the flag off, neither page shows a fee note but price and disclaimer stay", async ({ page }) => {
		const pageErrors = trackPageErrors(page);
		currentSettings = { ...SAMPLE_SETTINGS, showFeeNote: false };

		const en = await page.goto(`${base}/en/priced`);
		expect(en?.status()).toBe(200);
		await expect(page.locator("[data-fee-note]")).toHaveCount(0);
		await expect(page.locator("[data-price]")).toHaveCount(1);
		await expect(page.locator("[data-price]")).toHaveText("1,375,000 VND");
		await expect(page.locator("[data-price]")).toBeVisible();
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("EN-SAMPLE-DISCLAIMER");
		await expect(page.locator("[data-disclaimer]")).toBeVisible();

		const vi = await page.goto(`${base}/priced`);
		expect(vi?.status()).toBe(200);
		await expect(page.locator("[data-fee-note]")).toHaveCount(0);
		await expect(page.locator("[data-price]")).toHaveCount(1);
		await expect(page.locator("[data-price]")).toHaveText("1.375.000 ₫");
		await expect(page.locator("[data-price]")).toBeVisible();
		await expect(page.locator("[data-disclaimer]")).toHaveCount(1);
		await expect(page.locator("[data-disclaimer]")).toHaveText("VI-SAMPLE-DISCLAIMER");
		await expect(page.locator("[data-disclaimer]")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	// Step 4: flag on, 12.5 percent. The percentage comes from the settings, not from a hard-coded value.
	test("step 4: the note reads the percentage from settings (12.5)", async ({ page }) => {
		const pageErrors = trackPageErrors(page);
		currentSettings = { ...SAMPLE_SETTINGS, showFeeNote: true, serviceFeePercent: 12.5 };

		const response = await page.goto(`${base}/en/priced`);
		expect(response?.status()).toBe(200);
		await expect(page.locator("[data-price] [data-fee-note]")).toHaveCount(1);
		await expect(page.locator("[data-fee-note]")).toHaveText("Includes 12.5% service fee");
		await expect(page.locator("[data-fee-note]")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	// Step 5: a page without a price shows no fee note, even with the flag on.
	test("step 5: a page without a price shows no fee note, with the flag on", async ({ page }) => {
		const pageErrors = trackPageErrors(page);
		currentSettings = { ...SAMPLE_SETTINGS, showFeeNote: true };

		for (const path of ["/sample", "/en/sample"]) {
			const response = await page.goto(`${base}${path}`);
			expect(response?.status(), path).toBe(200);
			await expect(page.locator("[data-price]")).toHaveCount(0);
			await expect(page.locator("[data-fee-note]")).toHaveCount(0);
		}

		expect(pageErrors).toEqual([]);
	});
});
