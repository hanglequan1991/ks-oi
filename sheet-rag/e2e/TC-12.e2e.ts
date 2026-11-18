// TC-12: Switching language is remembered on reload and on a later visit in the same browser (STORY-16, AC3).
// Browser test. The harness is inline: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// No Cloudflare credentials are needed: getSettings is a fake. The browser is chosen by playwright.node.config.ts.

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
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

// Sample settings. The sample page shows no price, so these are not printed.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const STORAGE_KEY = "hd_lang";

// Sample route. Mounted at /sample and /en/sample (the TC's paths) and at / and /en/ (step 7 needs a
// mounted sample page at the root). The language comes from the path. Visible texts come from the dictionaries.
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
	app.get("/", handler);
	app.get("/en/", handler);
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

function storedLang(page: Page): Promise<string | null> {
	return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

// Sets the stored language on this origin. The page must already be on the harness origin.
async function setStoredLang(page: Page, lang: Lang): Promise<void> {
	await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, lang] as const);
}

// Opens a same-origin page that runs no lang.js (static CSS), so localStorage can be set before a real visit.
async function openOriginWithoutScript(page: Page, base: string): Promise<void> {
	await page.goto(`${base}/app.css`);
}

async function expectSamplePage(page: Page, lang: Lang, url: string): Promise<void> {
	await expect(page).toHaveURL(url);
	await expect(page.locator("html")).toHaveAttribute("lang", lang);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(lang, "common.siteName"));
	await expect(page.locator("main p")).toHaveText(t(lang, "common.langVi"));
}

test.describe("TC-12: switching language is remembered on reload and on a later visit in the same browser", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	test("choice is remembered across reload, new tabs, direct visits, root paths and a later visit", async ({ browser }) => {
		// One persistent context for the whole test, so localStorage is shared by every page in it.
		const context = await browser.newContext();
		try {
			// The two dictionaries must differ on the checked text, or the language checks below prove nothing.
			// (common.siteName is the same in both languages, so the paragraph text is the language signal.)
			expect(t("en", "common.langVi")).not.toBe(t("vi", "common.langVi"));

			// Step 1: open /sample (Vietnamese) in a fresh context, then click the toggle to English.
			const first = await context.newPage();
			const firstNavs = trackNavigations(first);
			await first.goto(`${base}/sample`);
			await expect(first.locator("html")).toHaveAttribute("lang", "vi");
			const enToggle = first.locator('a[data-lang="en"]');
			// Expected 1: the toggle is a plain link to /en/sample.
			await expect(enToggle).toHaveAttribute("href", "/en/sample");
			await enToggle.click();

			// Step 2: read URL, lang and the stored choice.
			// Expected 2: /en/sample, lang="en", hd_lang === "en".
			await expectSamplePage(first, "en", `${base}/en/sample`);
			expect(await storedLang(first)).toBe("en");

			// Step 3: reload. Expected 3: still /en/sample in English, and no navigation back to Vietnamese.
			firstNavs.length = 0;
			await first.reload();
			await expectSamplePage(first, "en", `${base}/en/sample`);
			expect(firstNavs.length).toBeGreaterThan(0);
			expect(firstNavs.every((u) => new URL(u).pathname === "/en/sample")).toBe(true);
			expect(await storedLang(first)).toBe("en");

			// Step 4: open /sample?x=1#top in a new tab of the same context.
			// Expected 4: the tab ends on /en/sample?x=1#top (prefix added, search and hash kept).
			const second = await context.newPage();
			await second.goto(`${base}/sample?x=1#top`);
			await expectSamplePage(second, "en", `${base}/en/sample?x=1#top`);

			// Step 5: on the English page, click the toggle to Vietnamese.
			// Expected 5: the click navigates to /sample.
			const viToggle = second.locator('a[data-lang="vi"]');
			await expect(viToggle).toHaveAttribute("href", "/sample");
			await viToggle.click();

			// Step 6: read URL, lang and hd_lang. Expected 6: /sample, lang="vi", hd_lang === "vi".
			await expectSamplePage(second, "vi", `${base}/sample`);
			expect(await storedLang(second)).toBe("vi");

			// Then open /en/sample directly in a new tab. Expected 6: redirected to /sample because Vietnamese is remembered.
			const third = await context.newPage();
			await third.goto(`${base}/en/sample`);
			await expectSamplePage(third, "vi", `${base}/sample`);
			expect(await storedLang(third)).toBe("vi");

			// Step 7a: root path with saved "en" lands on /en/.
			// Set the choice from a same-origin page that runs no lang.js, then open /.
			await openOriginWithoutScript(third, base);
			await setStoredLang(third, "en");
			await third.goto(`${base}/`);
			await expectSamplePage(third, "en", `${base}/en/`);

			// Step 7b: /en/ with saved "vi" lands on /. Set the choice on the /en/ page, then reopen it.
			await setStoredLang(third, "vi");
			await third.goto(`${base}/en/`);
			await expectSamplePage(third, "vi", `${base}/`);
			expect(await storedLang(third)).toBe("vi");

			// Step 8: close the page and open a new page ("return later") after hd_lang=en was last chosen.
			// The TC order leaves "vi" as the last stored value from step 7, so set "en" first.
			await third.close();
			await second.close();
			await first.close();

			const returning = await context.newPage();
			await openOriginWithoutScript(returning, base);
			await setStoredLang(returning, "en");
			const returningNavs = trackNavigations(returning);
			await returning.goto(`${base}/sample`);
			// Expected 8: lands on /en/sample in English, and the page settles with a small navigation count (no loop).
			await expectSamplePage(returning, "en", `${base}/en/sample`);
			await returning.waitForLoadState("load");
			expect(new URL(returning.url()).pathname).toBe("/en/sample");
			expect(returningNavs.length).toBeLessThanOrEqual(2);
			expect(await storedLang(returning)).toBe("en");
		} finally {
			await context.close();
		}
	});
});
