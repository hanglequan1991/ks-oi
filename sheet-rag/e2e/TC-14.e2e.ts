// TC-14: Pages still work when the browser blocks storage (STORY-16, AC5).
// Browser test. The harness is inline: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// No Cloudflare credentials are needed: getSettings is a fake. The browser is chosen by playwright.node.config.ts.
// Storage is blocked in two ways, set by an init script before any page script runs:
//   variant A: the window.localStorage getter throws a SecurityError.
//   variant B: Storage.prototype.getItem and setItem throw a SecurityError (the getter still works).
// Notes on the TC wording: its preconditions mount /priced, but step 5 opens /en/priced. Both are mounted here.

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createApp, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
import { formatPrice } from "../src/web/pages/components/PriceBlock";
import { t, type Lang } from "../src/web/i18n/t";
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

// Sample settings from the TC test data. The sample pages show no fee note; the priced pages show a disclaimer.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

// Sample price used on the priced pages.
const SAMPLE_AMOUNT = 1375000;

const STORAGE_KEY = "hd_lang";

// Sample routes. The language comes from the path: /sample and /en/sample, plus the priced pages /priced and /en/priced.
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
	// Priced page: prints a price (data-price) and, through Layout, the disclaimer once.
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

// The two ways storage is blocked. Each runs before any page script (addInitScript).
const BLOCKING_VARIANTS: { name: string; script: string }[] = [
	{
		name: "variant A: window.localStorage getter throws SecurityError",
		script: `
			Object.defineProperty(window, "localStorage", {
				configurable: true,
				get() { throw new DOMException("storage blocked", "SecurityError"); },
			});
		`,
	},
	{
		name: "variant B: getItem and setItem throw SecurityError",
		script: `
			const blocked = () => { throw new DOMException("storage blocked", "SecurityError"); };
			Storage.prototype.getItem = blocked;
			Storage.prototype.setItem = blocked;
		`,
	},
];

// Records the URL of every main-frame navigation of a page, from now on.
function trackNavigations(page: Page): string[] {
	const urls: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) urls.push(frame.url());
	});
	return urls;
}

// Records uncaught page errors and console errors, from now on. The browser's automatic /favicon.ico request
// logs a 404 console error, because the harness serves no favicon. That is not a storage problem, so it is skipped.
function trackErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
	const errors = { pageErrors: [] as string[], consoleErrors: [] as string[] };
	page.on("pageerror", (err) => errors.pageErrors.push(err.message));
	page.on("console", (msg) => {
		if (msg.type() !== "error") return;
		const url = msg.location().url;
		if (new URL(url || "http://x/").pathname === "/favicon.ico") return;
		errors.consoleErrors.push(`${msg.text()} @ ${url}`);
	});
	return errors;
}

// Checks the Vietnamese or English sample page: URL, lang attribute, heading and paragraph text.
async function expectSamplePage(page: Page, lang: Lang, url: string): Promise<void> {
	await expect(page).toHaveURL(url);
	await expect(page.locator("html")).toHaveAttribute("lang", lang);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(lang, "common.siteName"));
	await expect(page.locator("main p")).toHaveText(t(lang, "common.langVi"));
}

// Reads localStorage the way lang.js does. Under both variants this must throw a SecurityError.
async function storageAccessError(page: Page): Promise<string> {
	return page.evaluate((key) => {
		try {
			window.localStorage.getItem(key);
			return "readable";
		} catch (e) {
			return (e as Error).name;
		}
	}, STORAGE_KEY);
}

test.describe("TC-14: pages still work when the browser blocks storage", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	for (const variant of BLOCKING_VARIANTS) {
		test(`steps 1 to 3 and 5 work with storage blocked (${variant.name})`, async ({ page }) => {
			// Step 1 (and step 4 for variant B): add the init script, listen to errors, open /sample.
			await page.addInitScript(variant.script);
			const errors = trackErrors(page);
			const navs = trackNavigations(page);

			// Expected 1: /sample is shown in Vietnamese, no redirect, no pageerror.
			const viResponse = await page.goto(`${base}/sample`);
			expect(viResponse?.status()).toBe(200);
			// Sanity check: storage really is blocked on this page, so the rest of the test proves something.
			expect(await storageAccessError(page)).toBe("SecurityError");
			await expectSamplePage(page, "vi", `${base}/sample`);
			expect(navs).toEqual([`${base}/sample`]);
			expect(errors.pageErrors).toEqual([]);
			expect(errors.consoleErrors).toEqual([]);

			// Step 2: open /en/sample.
			// Expected 2: /en/sample stays in English, no redirect, no pageerror.
			const enResponse = await page.goto(`${base}/en/sample`);
			expect(enResponse?.status()).toBe(200);
			await expectSamplePage(page, "en", `${base}/en/sample`);
			expect(navs).toEqual([`${base}/sample`, `${base}/en/sample`]);
			expect(errors.pageErrors).toEqual([]);
			expect(errors.consoleErrors).toEqual([]);

			// Step 3: go back to the Vietnamese page and click the language toggle.
			// Expected 3: the click still navigates to /en/sample (not blocked by script) and the page is English.
			await page.goto(`${base}/sample`);
			const viToggle = page.locator("nav a[data-lang]");
			await expect(viToggle).toHaveText(t("vi", "common.switchToEn"));
			await expect(viToggle).toHaveAttribute("href", "/en/sample");
			await viToggle.click();
			await expectSamplePage(page, "en", `${base}/en/sample`);

			// Nothing is remembered: a reload keeps the address language, and opening /sample again does not redirect.
			await page.reload();
			await expectSamplePage(page, "en", `${base}/en/sample`);
			await page.goto(`${base}/sample`);
			await expectSamplePage(page, "vi", `${base}/sample`);
			expect(errors.pageErrors).toEqual([]);
			expect(errors.consoleErrors).toEqual([]);

			// Step 5: open the priced pages under blocked storage.
			// Expected 5: the price and the disclaimer render normally in the page language, no pageerror.
			const pricedEn = await page.goto(`${base}/en/priced`);
			expect(pricedEn?.status()).toBe(200);
			await expect(page).toHaveURL(`${base}/en/priced`);
			await expect(page.locator("html")).toHaveAttribute("lang", "en");
			await expect(page.locator("[data-price]")).toHaveText(formatPrice(SAMPLE_AMOUNT, "en"));
			await expect(page.locator("[data-disclaimer]")).toHaveText("EN-SAMPLE-DISCLAIMER");

			const pricedVi = await page.goto(`${base}/priced`);
			expect(pricedVi?.status()).toBe(200);
			await expect(page).toHaveURL(`${base}/priced`);
			await expect(page.locator("html")).toHaveAttribute("lang", "vi");
			await expect(page.locator("[data-price]")).toHaveText(formatPrice(SAMPLE_AMOUNT, "vi"));
			await expect(page.locator("[data-disclaimer]")).toHaveText("VI-SAMPLE-DISCLAIMER");

			expect(errors.pageErrors).toEqual([]);
			expect(errors.consoleErrors).toEqual([]);
		});
	}
});
