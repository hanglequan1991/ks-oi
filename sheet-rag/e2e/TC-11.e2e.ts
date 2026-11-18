// TC-11: Pages open in Vietnamese at the normal address and in English under /en/ (STORY-16, AC1, AC2, AC4).
// Browser test. The harness is inline: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// No Cloudflare credentials are needed: getSettings is a fake.

import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { createApp, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
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

// Sample settings from the TC test data. The sample page shows no price, so these are not printed.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

// Sample route, registered at both addresses (the language comes from the path).
// Visible texts come from the real dictionaries, so the expected values use t() too.
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

// The installed Playwright expects a Chromium build that is not in /opt/pw-browsers (only revision 1243 is).
// When the expected build is missing, point this test at the preinstalled Chromium. Nothing is installed.
const PREINSTALLED_CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
if (!existsSync(chromium.executablePath()) && existsSync(PREINSTALLED_CHROME)) {
	test.use({ launchOptions: { executablePath: PREINSTALLED_CHROME } });
}

test.describe("TC-11: pages open in Vietnamese at the normal address and in English under /en/", () => {
	let server: Server;
	let base: string;

	test.beforeAll(async () => {
		({ server, base } = await startHarness());
	});

	test.afterAll(async () => {
		await closeServer(server);
	});

	test("first visit is Vietnamese, /en/ is English, unknown language paths are Vietnamese", async ({ page, request }) => {
		// Step 1: open /sample in a fresh browser context (the page fixture has no cookies or storage).
		const viResponse = await page.goto(`${base}/sample`);
		// Expected 1: HTTP 200.
		expect(viResponse?.status()).toBe(200);

		// Step 2: read the lang attribute, the visible heading and the toggle link.
		// Expected 2: Vietnamese texts from the dictionary, toggle points to /en/sample.
		await expect(page.locator("html")).toHaveAttribute("lang", "vi");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("vi", "common.siteName"));
		await expect(page.locator("main p")).toHaveText(t("vi", "common.langVi"));
		const viToggle = page.locator("nav a[data-lang]");
		await expect(viToggle).toHaveText(t("vi", "common.switchToEn"));
		await expect(viToggle).toHaveAttribute("href", "/en/sample");

		// Expected 6: nothing in the first visit changed the language. No redirect, no stored choice.
		expect(new URL(page.url()).pathname).toBe("/sample");
		expect(await page.evaluate(() => window.localStorage.getItem("hd_lang"))).toBeNull();

		// Step 3: open /en/sample in the same context.
		const enResponse = await page.goto(`${base}/en/sample`);
		// Expected 3: HTTP 200.
		expect(enResponse?.status()).toBe(200);

		// Step 4: read the same values, plus canonical and alternates.
		// Expected 4: English texts, toggle points to /sample, canonical and alternates as specified.
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "common.siteName"));
		await expect(page.locator("main p")).toHaveText(t("en", "common.langVi"));
		const enToggle = page.locator("nav a[data-lang]");
		await expect(enToggle).toHaveText(t("en", "common.switchToVi"));
		await expect(enToggle).toHaveAttribute("href", "/sample");

		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${base}/en/sample`);
		const alternates = await page
			.locator('link[rel="alternate"][hreflang]')
			.evaluateAll((links) =>
				links.map((link) => ({
					hreflang: link.getAttribute("hreflang"),
					href: link.getAttribute("href"),
				})),
			);
		expect(alternates).toHaveLength(3);
		expect(alternates).toEqual(
			expect.arrayContaining([
				{ hreflang: "vi", href: `${base}/sample` },
				{ hreflang: "en", href: `${base}/en/sample` },
				{ hreflang: "x-default", href: `${base}/sample` },
			]),
		);

		// Step 5 (negative): /english and /en-US/sample are Vietnamese (or 404), never English.
		// The app has no route for them, so the Vietnamese not-found text is expected.
		const notFoundVi = t("vi", "errors.notFound");
		for (const path of ["/english", "/en-US/sample"]) {
			const res = await request.get(`${base}${path}`, { maxRedirects: 0 });
			// Expected 5: 404, and the body is the Vietnamese not-found text.
			expect(res.status(), path).toBe(404);
			const contentType = res.headers()["content-type"] ?? "";
			const body = await res.text();
			if (contentType.includes("text/html")) {
				expect(body, path).toContain('<html lang="vi">');
			} else {
				expect(body.trim(), path).toBe(notFoundVi);
			}
		}
	});
});
