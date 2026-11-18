// TC-13: First visit with nothing stored, or an invalid stored value, stays in Vietnamese (STORY-16, AC4).
// Browser test. The harness is inline: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// No Cloudflare credentials are needed: getSettings is a fake. The browser is chosen by playwright.node.config.ts.

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { createApp, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
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

// Sample settings from the TC test data. The sample page shows no price, so these are not printed.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const STORAGE_KEY = "hd_lang";

// Sample route, mounted at /sample and /en/sample (the TC's paths). The language comes from the path.
// Visible texts come from the dictionaries.
function samplePage(app: Hono<WebEnv>) {
	const handler: Parameters<Hono<WebEnv>["get"]>[1] = (c) => {
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
	app.get("/sample", handler);
	app.get("/en/sample", handler);
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
		mount: (a) => samplePage(a),
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

// Records the URL of every main-frame navigation of a page, from now on.
function trackNavigations(page: Page): string[] {
	const urls: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) urls.push(frame.url());
	});
	return urls;
}

// Checks the Vietnamese or English sample page: URL, lang attribute, heading and paragraph text.
async function expectSamplePage(page: Page, lang: Lang, url: string): Promise<void> {
	await expect(page).toHaveURL(url);
	await expect(page.locator("html")).toHaveAttribute("lang", lang);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(lang, "common.siteName"));
	await expect(page.locator("main p")).toHaveText(t(lang, "common.langVi"));
}

// Sets hd_lang before the page's own scripts run. On about:blank localStorage is not accessible, so the
// write is skipped there and only takes effect on the harness origin.
async function storeBeforeLoad(context: BrowserContext, value: string): Promise<void> {
	await context.addInitScript(
		([key, v]) => {
			try {
				window.localStorage.setItem(key, v);
			} catch {
				// No storage on this document (about:blank): nothing to set.
			}
		},
		[STORAGE_KEY, value] as const,
	);
}

test.describe("TC-13: first visit with nothing stored, or an invalid stored value, stays in Vietnamese", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	test("nothing stored, unknown or empty stored value, and JavaScript off all stay in Vietnamese", async ({ browser, request }) => {
		// Browser language is English. Every context uses it, so the Vietnamese result proves the browser
		// language is not used to pick the site language.
		const contexts: BrowserContext[] = [];
		const newContext = async (options: BrowserContextOptions = {}): Promise<BrowserContext> => {
			const context = await browser.newContext({
				locale: "en-US",
				extraHTTPHeaders: { "Accept-Language": "en-US" },
				...options,
			});
			contexts.push(context);
			return context;
		};

		try {
			// The two dictionaries must differ on the checked text, or the language checks below prove nothing.
			expect(t("en", "common.langVi")).not.toBe(t("vi", "common.langVi"));

			// Step 1: fresh context, open /sample and record every navigation.
			// Expected 1: a single navigation to /sample (no redirect), HTTP 200.
			const context1 = await newContext();
			const page1 = await context1.newPage();
			const navs1 = trackNavigations(page1);
			const response1 = await page1.goto(`${base}/sample`);
			expect(response1?.status()).toBe(200);
			expect(navs1).toEqual([`${base}/sample`]);

			// Step 2: read <html lang>, hd_lang and the URL.
			// Expected 2: lang="vi", hd_lang still null (the script wrote nothing), URL unchanged.
			await expectSamplePage(page1, "vi", `${base}/sample`);
			expect(await page1.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

			// Step 3: fresh context with hd_lang = "fr" (not a supported value), open /sample.
			// Expected 3: no redirect, lang="vi", URL /sample.
			const context2 = await newContext();
			await storeBeforeLoad(context2, "fr");
			const page2 = await context2.newPage();
			const navs2 = trackNavigations(page2);
			await page2.goto(`${base}/sample`);
			await expectSamplePage(page2, "vi", `${base}/sample`);
			expect(navs2).toEqual([`${base}/sample`]);
			expect(await page2.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe("fr");

			// Step 4: fresh context with hd_lang = "" (empty string), open /sample.
			// Expected 4: no redirect, lang="vi", URL /sample.
			const context3 = await newContext();
			await storeBeforeLoad(context3, "");
			const page3 = await context3.newPage();
			const navs3 = trackNavigations(page3);
			await page3.goto(`${base}/sample`);
			await expectSamplePage(page3, "vi", `${base}/sample`);
			expect(navs3).toEqual([`${base}/sample`]);

			// Step 5: fresh context with JavaScript disabled, open /sample.
			// Expected 5: Vietnamese page, toggle link to /en/sample present, and it works as a plain link:
			// the link URL returns HTTP 200 with lang="en", and a click on it reaches the English page.
			const context4 = await newContext({ javaScriptEnabled: false });
			const page4 = await context4.newPage();
			const response4 = await page4.goto(`${base}/sample`);
			expect(response4?.status()).toBe(200);
			await expectSamplePage(page4, "vi", `${base}/sample`);

			const toggle = page4.locator("nav a[data-lang]");
			await expect(toggle).toHaveAttribute("href", "/en/sample");

			const englishResponse = await request.get(`${base}/en/sample`, { maxRedirects: 0 });
			expect(englishResponse.status()).toBe(200);
			expect(await englishResponse.text()).toContain('<html lang="en"');

			await toggle.click();
			await expectSamplePage(page4, "en", `${base}/en/sample`);
		} finally {
			for (const context of contexts) {
				await context.close();
			}
		}
	});
});
