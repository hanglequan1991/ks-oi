// TC-15: Every label exists in both Vietnamese and English (STORY-16, AC6).
// Node checks on the two dictionaries (steps 1 to 3 and 5), plus a browser check that the sample pages show no raw key (step 4).
// The harness is inline, as in TC-11 to TC-14: a Node HTTP server on port 0 converts each request to a Request,
// calls createApp(deps).fetch, and serves public/lang.js and public/app.css (stands in for the assets binding).
// getSettings is a fake. The browser is chosen by playwright.node.config.ts.
// Notes on the TC wording:
// - Step 5 says the English file has no Vietnamese-only characters. The English dictionary holds one deliberate
//   Vietnamese label, common.switchToVi ("Chuyển sang tiếng Việt"), which is shown to switch to Vietnamese.
//   So the check excludes that one key, and asserts that it really is Vietnamese.
// - The TC preconditions mount only /sample, but step 4 fetches /en/sample. Both are mounted here (as in TC-14).

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createApp, type WebEnv } from "../src/web/app";
import { renderPage } from "../src/web/render";
import { Layout } from "../src/web/pages/Layout";
import { formatPrice } from "../src/web/pages/components/PriceBlock";
import { t } from "../src/web/i18n/t";
import { vi } from "../src/web/i18n/vi";
import { en } from "../src/web/i18n/en";
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

// Sample settings: distinct sample texts, so a missing translation would show up as a wrong string.
const SAMPLE_SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: false,
	disclaimerVi: "VI-SAMPLE-DISCLAIMER",
	disclaimerEn: "EN-SAMPLE-DISCLAIMER",
};

const SAMPLE_AMOUNT = 1375000;

// Required keys from TC-15 step 3.
const REQUIRED_KEYS = [
	"common.siteName",
	"common.langVi",
	"common.langEn",
	"common.switchToVi",
	"common.switchToEn",
	"common.skipToContent",
	"price.feeNote",
	"price.currencyUnit",
	"price.perNight",
	"errors.tooManyRequests",
	"errors.inputTooLong",
	"errors.notFound",
	"errors.generic",
];

// The one Vietnamese string allowed in the English dictionary (see the notes above).
const VI_ONLY_EXCEPTIONS = new Set(["common.switchToVi"]);

// Vietnamese-only letters: đ, Đ, ơ, Ơ, ư, Ư, and the tone-marked vowels U+1EA0 to U+1EF9.
const VI_ONLY_CHARS = /[đĐơƠưƯẠ-ỹ]/u;
// Any Vietnamese diacritic: a combining mark (after NFD) or đ / Đ.
const DIACRITIC = /[̀-ͯđ]/u;

type Leaves = Map<string, string>;

// Flattens a dictionary to dot-path keys. Non-string leaves are kept as-is so the test can flag them.
function flatten(node: unknown, prefix = ""): Map<string, unknown> {
	const out = new Map<string, unknown>();
	if (node !== null && typeof node === "object") {
		for (const [name, child] of Object.entries(node as Record<string, unknown>)) {
			const key = prefix ? `${prefix}.${name}` : name;
			if (child !== null && typeof child === "object") {
				for (const [k, v] of flatten(child, key)) out.set(k, v);
			} else {
				out.set(key, child);
			}
		}
	}
	return out;
}

// Returns the sorted {name} placeholders of a template.
function placeholders(template: string): string[] {
	return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

// Sample routes: the Layout (nav, skip link, footer) plus a heading and a paragraph, and the priced pages.
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

// Visible text of the page (what a reader sees, not the markup).
async function visibleText(page: Page): Promise<string> {
	return page.locator("body").innerText();
}

// Dictionaries, flattened once.
const viLeaves: Leaves = flatten(vi) as Leaves;
const enLeaves: Leaves = flatten(en) as Leaves;

test.describe("TC-15: every label exists in both Vietnamese and English", () => {
	// Steps 1 and 2: both dictionaries load, same keys both ways, no empty leaf, same placeholders per key.
	test("steps 1 and 2: the two dictionaries have the same keys, non-empty leaves and placeholders", () => {
		// Expected 1: both objects load.
		expect(viLeaves.size).toBeGreaterThan(0);
		expect(enLeaves.size).toBeGreaterThan(0);

		// Expected 2: key sets are identical in both directions.
		const viOnly = [...viLeaves.keys()].filter((k) => !enLeaves.has(k));
		const enOnly = [...enLeaves.keys()].filter((k) => !viLeaves.has(k));
		expect(viOnly, "keys in vi.ts missing from en.ts").toEqual([]);
		expect(enOnly, "keys in en.ts missing from vi.ts").toEqual([]);

		// Every leaf is a non-empty string (checked in both dictionaries).
		for (const [dict, leaves] of [
			["vi", viLeaves],
			["en", enLeaves],
		] as const) {
			for (const [key, value] of leaves) {
				expect(typeof value, `${dict}.${key} is not a string`).toBe("string");
				expect((value as string).trim(), `${dict}.${key} is empty`).not.toBe("");
			}
		}

		// Identical {placeholder} names per key.
		for (const key of viLeaves.keys()) {
			expect(placeholders(enLeaves.get(key) as string), `placeholders of ${key}`).toEqual(
				placeholders(viLeaves.get(key) as string),
			);
		}
		expect(placeholders(viLeaves.get("price.feeNote") as string)).toEqual(["percent"]);
		expect(placeholders(enLeaves.get("price.feeNote") as string)).toEqual(["percent"]);
	});

	// Step 3: the required keys exist in both languages.
	test("step 3: all required keys exist in both languages", () => {
		for (const key of REQUIRED_KEYS) {
			expect(viLeaves.get(key), `vi is missing ${key}`).toBeTruthy();
			expect(enLeaves.get(key), `en is missing ${key}`).toBeTruthy();
		}
	});

	// Step 5: Vietnamese has diacritics where expected; English has no Vietnamese-only letters (bar the one exception).
	test("step 5: Vietnamese values carry diacritics and English values carry none", () => {
		expect(vi.common.langVi).toBe("Tiếng Việt");

		for (const key of ["common.langVi", "common.switchToVi", "common.skipToContent", "price.feeNote", "errors.generic", "bill.title"]) {
			const value = viLeaves.get(key) as string;
			expect(value.normalize("NFD"), `vi ${key} should have diacritics`).toMatch(DIACRITIC);
		}

		for (const [key, value] of enLeaves) {
			if (VI_ONLY_EXCEPTIONS.has(key)) continue;
			expect(value, `en ${key} has a Vietnamese-only letter`).not.toMatch(VI_ONLY_CHARS);
		}

		// The exception is really Vietnamese.
		expect(enLeaves.get("common.switchToVi")).toMatch(VI_ONLY_CHARS);
	});

	// Step 4: the sample pages in both languages show no raw dictionary key in visible text.
	test("step 4: neither the Vietnamese nor the English page shows a raw key", async ({ page }) => {
		const { server, base } = await startHarness();
		try {
			const allKeys = [...viLeaves.keys()];
			const pageErrors: string[] = [];
			page.on("pageerror", (err) => pageErrors.push(err.message));

			for (const [path, lang] of [
				["/sample", "vi"],
				["/en/sample", "en"],
				["/priced", "vi"],
				["/en/priced", "en"],
			] as const) {
				const response = await page.goto(`${base}${path}`);
				expect(response?.status(), `${path} status`).toBe(200);
				await expect(page.locator("html")).toHaveAttribute("lang", lang);

				const text = await visibleText(page);
				expect(text.length, `${path} has visible text`).toBeGreaterThan(0);
				for (const key of allKeys) {
					expect(text.includes(key), `${path} shows the raw key ${key}`).toBe(false);
				}
			}

			// Positive check: the translated labels are what the pages show.
			await page.goto(`${base}/en/sample`);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "common.siteName"));
			await expect(page.locator("main p")).toHaveText(t("en", "common.langVi"));
			await page.goto(`${base}/sample`);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("vi", "common.siteName"));
			await expect(page.locator("main p")).toHaveText(t("vi", "common.langVi"));

			expect(pageErrors).toEqual([]);
		} finally {
			await closeServer(server);
		}
	});
});
