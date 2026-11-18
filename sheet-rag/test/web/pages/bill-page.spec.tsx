import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import type { SiteSettings } from "../../../src/db/settings";
import type { Lang } from "../../../src/web/i18n/t";
import { en } from "../../../src/web/i18n/en";
import { vi as viDict } from "../../../src/web/i18n/vi";
import { BillPage } from "../../../src/web/pages/Bill";
import { renderPage } from "../../../src/web/render";

const ORIGIN = "https://example.test";

const settings: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Giá chỉ mang tính tham khảo, vui lòng xác nhận lại.",
	disclaimerEn: "Prices are indicative, please confirm before booking.",
};

async function render(lang: Lang, s: SiteSettings = settings): Promise<string> {
	const app = new Hono();
	app.get("*", (c) =>
		renderPage(
			c,
			<BillPage lang={lang} path={lang === "en" ? "/en/bill" : "/bill"} origin={ORIGIN} settings={s} />,
		),
	);
	const res = await app.request("/");
	return res.text();
}

// Returns the inner HTML of the first element matching the opening-tag regex.
function between(html: string, open: string, close: string): string {
	const start = html.indexOf(open);
	if (start === -1) return "";
	const end = html.indexOf(close, start);
	return end === -1 ? "" : html.slice(start, end + close.length);
}

function configJson(html: string): unknown {
	const m = html.match(/<script type="application\/json" id="bill-config">([\s\S]*?)<\/script>/);
	if (!m) throw new Error("bill-config block missing");
	return JSON.parse(m[1]);
}

// Restores any label changed by a test so the shared dictionary stays intact.
const restore: (() => void)[] = [];
afterEach(() => {
	while (restore.length) restore.pop()?.();
});

describe("BillPage (TASK-37)", () => {
	it("vi and en pages use their own labels", async () => {
		const vi = await render("vi");
		const en2 = await render("en");
		expect(vi).toContain(`<html lang="vi">`);
		expect(vi).toContain(viDict.bill.title);
		expect(vi).toContain(viDict.bill.intro);
		expect(vi).not.toContain(en.bill.title);
		expect(en2).toContain(`<html lang="en">`);
		expect(en2).toContain(en.bill.title);
		expect(en2).toContain(en.bill.intro);
		expect(en2).not.toContain(viDict.bill.title);
	});

	it("server header row has the six columns and no data rows", async () => {
		const html = await render("en");
		const head = between(html, `<div class="bill-head"`, `</div>`);
		const cols = [...head.matchAll(/<(?:span|div)[^>]*>([^<]*)<\/(?:span|div)>/g)].map((m) => m[1]);
		expect(cols).toEqual([
			en.bill.colIndex,
			en.bill.colHotel,
			en.bill.colRoom,
			en.bill.colNight,
			en.bill.colPricing,
			en.bill.colTotal,
		]);
		expect(html).toContain(`id="bill-app"`);
		expect(html).not.toMatch(/<div[^>]*class="[^"]*bill-row/);
		expect(html).not.toContain("<tr");
	});

	it("disclaimer once from settings and fee note follows the setting", async () => {
		const en2 = await render("en");
		expect(en2.match(/data-disclaimer/g)?.length).toBe(1);
		expect(en2).toContain(settings.disclaimerEn);
		expect(en2).not.toContain(settings.disclaimerVi);
		expect(en2).toContain("Includes 10% service fee");

		const vi = await render("vi");
		expect(vi.match(/data-disclaimer/g)?.length).toBe(1);
		expect(vi).toContain(settings.disclaimerVi);

		const noFee = await render("en", { ...settings, showFeeNote: false, serviceFeePercent: 12.5 });
		expect(noFee).not.toContain("data-fee-note");
		expect(noFee).not.toContain("service fee");

		const pct = await render("en", { ...settings, serviceFeePercent: 12.5 });
		expect(pct).toContain("Includes 12.5% service fee");
	});

	it("no phone, zalo, admin or self links", async () => {
		const html = await render("en");
		for (const bad of ["tel:", "zalo", "Zalo", "phone", "/admin", `href="/bill"`, `href="/en/bill"`]) {
			expect(html).not.toContain(bad);
		}
		// The only bill URLs are the canonical and alternate links from Layout.
		const billUrls = [...html.matchAll(/(?:href|src)="([^"]*bill[^"]*)"/g)].map((m) => m[1]);
		for (const u of billUrls) {
			expect(u).toMatch(/^https:\/\/example\.test\/|^\/bill\.(css|js)$/);
		}
	});

	it("noscript message in both languages", async () => {
		const vi = await render("vi");
		const en2 = await render("en");
		expect(vi).toContain(`<noscript><p class="bill-noscript">${viDict.bill.noscript}</p></noscript>`);
		expect(en2).toContain(`<noscript><p class="bill-noscript">${en.bill.noscript}</p></noscript>`);
	});

	it("config json is safe against script injection and the only scripts are external plus the json block", async () => {
		const original = en.bill.noteLabel;
		en.bill.noteLabel = "</script><script>alert(1)</script>";
		restore.push(() => {
			en.bill.noteLabel = original;
		});

		const html = await render("en");
		expect(html).not.toContain("</script><script>alert(1)</script>");
		expect(html).not.toContain("<script>alert(1)");

		const config = configJson(html) as { lang: string; labels: Record<string, string> };
		expect(config.lang).toBe("en");
		expect(config.labels.noteLabel).toBe("</script><script>alert(1)</script>");
		expect(config.labels.colHotel).toBe(en.bill.colHotel);

		const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
		expect(scripts).toHaveLength(3);
		expect(html).toContain(`<script src="/lang.js"></script>`);
		expect(html).toMatch(/<script src="\/bill\.js" defer(=""|)><\/script>/);
		expect(scripts.some((a) => a.includes(`type="application/json"`) && a.includes(`id="bill-config"`))).toBe(true);
		expect(html).not.toMatch(/\sstyle=/);
	});

	it("limits in the config come from the code", async () => {
		const config = configJson(await render("en")) as {
			maxRows: number;
			maxNights: number;
			maxNote: number;
		};
		expect(config.maxNote).toBe(500);
		expect(config.maxRows).toBe(30);
		expect(config.maxNights).toBe(365);
	});

	it("print head, no-print actions and notes block", async () => {
		const html = await render("en");
		expect(html).toContain(`class="bill-print-head"`);
		expect(html).toContain(`data-bill-date`);

		for (const action of ["add", "clear", "print", "clear-draft"]) {
			const tag = html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`));
			expect(tag, `button ${action}`).not.toBeNull();
			expect(tag![0]).toContain("no-print");
		}

		const notes = between(html, `<div class="bill-notes"`, `</div>`);
		expect(notes).toContain("data-fee-note");
		expect(notes).toContain("data-disclaimer");
		expect(notes).toContain(en.bill.privacyNote);
		const noPrintBlocks = [...html.matchAll(/<[^>]*no-print[^>]*>/g)].map((m) => m[0]);
		expect(noPrintBlocks.some((t) => t.includes("bill-notes"))).toBe(false);
	});

	it("page has no form", async () => {
		const html = await render("en");
		expect(html).not.toContain("<form");
		// data-action is allowed; a real action attribute is not.
		expect(html).not.toMatch(/(?<![\w-])action=/);
	});
});
