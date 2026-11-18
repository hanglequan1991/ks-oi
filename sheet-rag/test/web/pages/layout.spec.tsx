import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Context } from "hono";
import type { SiteSettings } from "../../../src/db/settings";
import type { Lang } from "../../../src/web/i18n/t";
import { Layout } from "../../../src/web/pages/Layout";
import { PriceBlock } from "../../../src/web/pages/components/PriceBlock";
import { renderPage } from "../../../src/web/render";

const ORIGIN = "https://example.test";

const settings: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Giá chỉ mang tính tham khảo, vui lòng xác nhận lại.",
	disclaimerEn: "Prices are indicative, please confirm before booking.",
};

// Parses every <name ...> tag in the HTML into a map of its attributes.
function tags(html: string, name: string): Record<string, string>[] {
	return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map((m) => {
		const attrs: Record<string, string> = {};
		for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
		return attrs;
	});
}

// Returns the inner HTML of the first <name> element.
function section(html: string, name: string): string {
	const start = html.indexOf(`<${name}`);
	const end = html.indexOf(`</${name}>`);
	return start === -1 || end === -1 ? "" : html.slice(start, end);
}

function appFor(opts: {
	lang: Lang;
	path: string;
	showsPrice?: boolean;
	amount?: number | null;
	s?: SiteSettings;
}) {
	const app = new Hono();
	app.get("*", (c) =>
		renderPage(
			c,
			<Layout
				lang={opts.lang}
				path={opts.path}
				origin={ORIGIN}
				title="Test page"
				settings={opts.s ?? settings}
				showsPrice={opts.showsPrice ?? false}
			>
				<p>Body</p>
				{opts.amount !== undefined && (
					<PriceBlock lang={opts.lang} settings={opts.s ?? settings} amount={opts.amount} />
				)}
			</Layout>,
		),
	);
	app.onError((err, c) => c.text(err.message, 500));
	return app;
}

async function htmlOf(app: Hono, url: string): Promise<string> {
	const res = await app.request(url);
	return res.text();
}

describe("Layout and renderPage (TASK-9)", () => {
	it("vi page declares lang vi, en page declares lang en", async () => {
		const vi = await htmlOf(appFor({ lang: "vi", path: "/" }), "/");
		const en = await htmlOf(appFor({ lang: "en", path: "/en/" }), "/en/");
		expect(tags(vi, "html")[0].lang).toBe("vi");
		expect(tags(en, "html")[0].lang).toBe("en");
		expect(vi.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(tags(vi, "meta").some((m) => m.charset !== undefined)).toBe(true);
		expect(tags(vi, "meta").some((m) => m.name === "viewport")).toBe(true);
		expect(vi).toContain("<title>Test page</title>");
	});

	it("canonical and hreflang alternates are correct for both languages", async () => {
		const vi = await htmlOf(appFor({ lang: "vi", path: "/rooms/1" }), "/rooms/1");
		const en = await htmlOf(appFor({ lang: "en", path: "/en/rooms/1" }), "/en/rooms/1");

		const canonicalVi = tags(vi, "link").filter((l) => l.rel === "canonical");
		const canonicalEn = tags(en, "link").filter((l) => l.rel === "canonical");
		expect(canonicalVi).toEqual([{ rel: "canonical", href: `${ORIGIN}/rooms/1` }]);
		expect(canonicalEn).toEqual([{ rel: "canonical", href: `${ORIGIN}/en/rooms/1` }]);

		const alternates = tags(en, "link").filter((l) => l.rel === "alternate");
		const byLang = Object.fromEntries(alternates.map((l) => [l.hreflang, l.href]));
		expect(byLang).toEqual({
			vi: `${ORIGIN}/rooms/1`,
			en: `${ORIGIN}/en/rooms/1`,
			"x-default": `${ORIGIN}/rooms/1`,
		});
	});

	it("normal address renders Vietnamese with nothing stored", async () => {
		const app = new Hono();
		// Sample route: language comes from the URL only, never from cookies or storage.
		app.get("*", (c) =>
			renderPage(
				c,
				<Layout lang="vi" path="/" origin={ORIGIN} title="Home" settings={settings} showsPrice={false}>
					<p>Home</p>
				</Layout>,
			),
		);
		const res = await app.request("/", { headers: { cookie: "" } });
		const html = await res.text();
		expect(tags(html, "html")[0].lang).toBe("vi");
		expect(res.headers.get("set-cookie")).toBeNull();
		expect(html).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
	});

	it("every page has a noindex robots meta", async () => {
		const pages = [
			await htmlOf(appFor({ lang: "vi", path: "/" }), "/"),
			await htmlOf(appFor({ lang: "en", path: "/en/" }), "/en/"),
			await htmlOf(appFor({ lang: "vi", path: "/rooms/1", showsPrice: true, amount: 1 }), "/rooms/1"),
		];
		for (const html of pages) {
			const robots = tags(html, "meta").filter((m) => m.name === "robots");
			expect(robots).toEqual([{ name: "robots", content: "noindex, nofollow" }]);
		}
	});

	it("showsPrice adds the disclaimer in the page language", async () => {
		const vi = await htmlOf(
			appFor({ lang: "vi", path: "/", showsPrice: true, amount: 1375000 }),
			"/",
		);
		const en = await htmlOf(
			appFor({ lang: "en", path: "/en/", showsPrice: true, amount: 1375000 }),
			"/en/",
		);
		const viFooter = section(vi, "footer");
		const enFooter = section(en, "footer");
		expect(viFooter).toContain("data-disclaimer");
		expect(viFooter).toContain(settings.disclaimerVi);
		expect(viFooter).not.toContain(settings.disclaimerEn);
		expect(enFooter).toContain("data-disclaimer");
		expect(enFooter).toContain(settings.disclaimerEn);
		expect(enFooter).not.toContain(settings.disclaimerVi);
		// The disclaimer is printed once per page.
		expect(vi.match(/data-disclaimer/g)).toHaveLength(1);
	});

	it("renderPage throws when a price has no disclaimer, and allows price-free pages", async () => {
		const fakeContext = () => ({ html: vi.fn((s: string) => s) });

		const withoutDisclaimer = fakeContext();
		expect(() =>
			renderPage(
				withoutDisclaimer as unknown as Context,
				<Layout lang="vi" path="/" origin={ORIGIN} title="T" settings={settings} showsPrice={false}>
					<PriceBlock lang="vi" settings={settings} amount={500000} />
				</Layout>,
			),
		).toThrow();
		expect(withoutDisclaimer.html).not.toHaveBeenCalled();

		const priceFree = fakeContext();
		expect(() =>
			renderPage(
				priceFree as unknown as Context,
				<Layout lang="vi" path="/" origin={ORIGIN} title="T" settings={settings} showsPrice={false}>
					<p>No price here</p>
				</Layout>,
			),
		).not.toThrow();
		expect(priceFree.html).toHaveBeenCalledTimes(1);

		const withDisclaimer = fakeContext();
		expect(() =>
			renderPage(
				withDisclaimer as unknown as Context,
				<Layout lang="vi" path="/" origin={ORIGIN} title="T" settings={settings} showsPrice={true}>
					<PriceBlock lang="vi" settings={settings} amount={500000} />
				</Layout>,
			),
		).not.toThrow();
		expect(withDisclaimer.html).toHaveBeenCalledTimes(1);
	});

	it("fee note follows the setting through renderPage", async () => {
		const on = await htmlOf(
			appFor({ lang: "en", path: "/en/", showsPrice: true, amount: 1000000 }),
			"/en/",
		);
		expect(on).toContain("data-fee-note");
		expect(on).toContain("10%");

		const off = await htmlOf(
			appFor({
				lang: "en",
				path: "/en/",
				showsPrice: true,
				amount: 1000000,
				s: { ...settings, showFeeNote: false },
			}),
			"/en/",
		);
		expect(off).toContain("data-price");
		expect(off).not.toContain("data-fee-note");
	});

	it("loads lang.js as an external script and the toggle is a plain link", async () => {
		const html = await htmlOf(appFor({ lang: "vi", path: "/rooms/1" }), "/rooms/1");
		const head = section(html, "head");
		const scripts = tags(head, "script");
		expect(scripts).toEqual([{ src: "/lang.js" }]);
		expect(scripts[0].defer).toBeUndefined();
		expect(scripts[0].async).toBeUndefined();

		const toggles = tags(html, "a").filter((a) => a["data-lang"] !== undefined);
		expect(toggles).toEqual([
			{ href: "/en/rooms/1", "data-lang": "en", hreflang: "en" },
		]);
		expect(html).toContain("Switch to English");

		const enHtml = await htmlOf(appFor({ lang: "en", path: "/en/rooms/1" }), "/en/rooms/1");
		const enToggles = tags(enHtml, "a").filter((a) => a["data-lang"] !== undefined);
		expect(enToggles).toEqual([{ href: "/rooms/1", "data-lang": "vi", hreflang: "vi" }]);
		expect(enHtml).toContain("Chuyển sang tiếng Việt");

		// The billing page and any admin area are not linked from the layout.
		expect(html).not.toMatch(/href="[^"]*\/bill/);
		expect(html).not.toMatch(/href="[^"]*\/admin/);
	});

	it("no inline style attributes or inline scripts", async () => {
		const html = await htmlOf(
			appFor({ lang: "vi", path: "/", showsPrice: true, amount: 1375000 }),
			"/",
		);
		expect(html).not.toMatch(/\sstyle=/);
		const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
		expect(scripts.length).toBeGreaterThan(0);
		for (const s of scripts) {
			expect(s[1]).toMatch(/\ssrc="/);
			expect(s[2].trim()).toBe("");
		}
		expect(html).toMatch(/<link rel="stylesheet" href="\/app\.css"/);
	});
});
