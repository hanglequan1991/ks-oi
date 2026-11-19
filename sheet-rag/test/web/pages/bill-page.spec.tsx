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

	it("no phone, zalo or admin links; bill URL only via layout language toggle and canonical/hreflang", async () => {
		for (const lang of ["vi", "en"] as const) {
			const html = await render(lang);
			for (const bad of ["tel:", "zalo", "Zalo", "phone", "/admin"]) {
				expect(html, `${lang}: ${bad}`).not.toContain(bad);
			}

			// Exactly one <a> to a bill URL: the Layout language toggle (marked data-lang), pointing to the twin page.
			const other = lang === "en" ? "vi" : "en";
			const toggleTarget = lang === "en" ? "/bill" : "/en/bill";
			const billAnchors = [...html.matchAll(/<a\b([^>]*)>/g)]
				.map((m) => m[1])
				.filter((attrs) => {
					const href = attrs.match(/\shref="([^"]*)"/);
					return href !== null && /^(\/en)?\/bill\/?(\?|#|$)/.test(href[1]);
				});
			expect(billAnchors, `${lang}: bill anchors`).toHaveLength(1);
			expect(billAnchors[0]).toContain(`href="${toggleTarget}"`);
			expect(billAnchors[0]).toContain(`data-lang="${other}"`);

			// The only bill link inside main is the page's own language toggle (.lang-link).
			const main = between(html, `<main`, `</main>`);
			const mainBillLinks = [...main.matchAll(/<a\b([^>]*)>/g)]
				.map((m) => m[1])
				.filter((attrs) => /\shref="\/(en\/)?bill/.test(attrs));
			expect(mainBillLinks, `${lang}: main bill links`).toHaveLength(1);
			expect(mainBillLinks[0]).toContain(`class="lang-link"`);

			// Every href/src that mentions bill is one of the allowed targets.
			const allowedAbsolute = new Set([`${ORIGIN}/bill`, `${ORIGIN}/en/bill`]);
			const billUrls = [...html.matchAll(/(?:href|src)="([^"]*bill[^"]*)"/g)].map((m) => m[1]);
			for (const u of billUrls) {
				const allowed = allowedAbsolute.has(u) || u === "/bill.css" || u === "/bill.js" || u === toggleTarget;
				expect(allowed, `${lang}: ${u}`).toBe(true);
			}
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

	it("header holds title, intro, status and language toggle in order", async () => {
		const html = await render("en");
		const start = html.indexOf(`<div class="bill-header"`);
		const end = html.indexOf(`<div class="bill-print-head"`);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const header = html.slice(start, end);

		const at = (needle: string) => {
			const i = header.indexOf(needle);
			expect(i, `header has ${needle}`).toBeGreaterThan(-1);
			return i;
		};
		const positions = [
			at(`<h1>${en.bill.title}</h1>`),
			at(`<p class="bill-intro">${en.bill.intro}</p>`),
			at(`<div class="bill-tools no-print"`),
			at(`data-bill-status`),
			at(`class="lang-toggle"`),
		];
		expect(positions).toEqual([...positions].sort((a, b) => a - b));

		const statusTag = header.match(/<p[^>]*data-bill-status[^>]*>/)![0];
		expect(statusTag).toContain(`role="status"`);
		expect(statusTag).toContain("no-print");
		expect(header.indexOf(`<div class="bill-titlebox"`)).toBeLessThan(positions[2]);
	});

	it("one language link with data-lang and a current-language span in both languages", async () => {
		const cases = [
			{ lang: "vi" as const, current: "VI", other: "EN", otherLang: "en", target: "/en/bill", aria: viDict.common.switchToEn },
			{ lang: "en" as const, current: "EN", other: "VI", otherLang: "vi", target: "/bill", aria: en.common.switchToVi },
		];
		for (const c of cases) {
			const html = await render(c.lang);
			const links = [...html.matchAll(/<a\b([^>]*)>/g)]
				.map((m) => m[1])
				.filter((attrs) => /\sdata-lang="/.test(attrs));
			expect(links, `${c.lang}: data-lang links`).toHaveLength(1);
			expect(links[0]).toContain(`class="lang-link"`);
			expect(links[0]).toContain(`href="${c.target}"`);
			expect(links[0]).toContain(`data-lang="${c.otherLang}"`);
			expect(links[0]).toContain(`hreflang="${c.otherLang}"`);
			expect(links[0]).toContain(`aria-label="${c.aria}"`);

			const currents = [...html.matchAll(/<span class="lang-current" aria-current="true">([^<]*)<\/span>/g)];
			expect(currents.map((m) => m[1]), `${c.lang}: current`).toEqual([c.current]);

			// Order is always VI then EN.
			const viIndex = c.lang === "vi" ? html.indexOf(`>VI</span>`) : html.indexOf(`>VI</a>`);
			const enIndex = c.lang === "vi" ? html.indexOf(`>EN</a>`) : html.indexOf(`>EN</span>`);
			expect(viIndex).toBeGreaterThan(-1);
			expect(enIndex).toBeGreaterThan(viIndex);
			expect(html.indexOf(`>${c.other}</`)).toBeGreaterThan(-1);
		}
	});

	it("footer row, summary label and tools buttons", async () => {
		const html = await render("en");
		const card = html.indexOf(`<div class="bill-card"`);
		const grid = html.indexOf(`<div id="bill-app" class="bill-grid"`);
		const foot = html.indexOf(`<div class="bill-foot"`);
		const bottom = html.indexOf(`<div class="bill-bottom"`);
		const config = html.indexOf(`id="bill-config"`);
		expect([card, grid, foot, bottom, config].every((i) => i > -1)).toBe(true);
		expect(card).toBeLessThan(grid);
		expect(grid).toBeLessThan(foot);
		expect(foot).toBeLessThan(bottom);
		expect(bottom).toBeLessThan(config);

		const footHtml = html.slice(foot, bottom);
		const addTag = footHtml.match(/<button[^>]*data-action="add"[^>]*>/)![0];
		expect(addTag).toContain(`class="btn btn-outline no-print"`);
		const clearTag = footHtml.match(/<button[^>]*data-action="clear"[^>]*>/)![0];
		expect(clearTag).toContain(`class="btn no-print"`);

		const summary = footHtml.slice(footHtml.indexOf(`<div class="bill-summary"`));
		expect(summary).toContain(`<span class="summary-label">${en.bill.grandTotal}</span>`);
		expect(summary).toContain(`<span class="summary-total" data-bill-summary>`);

		const bottomHtml = html.slice(bottom, config);
		const notesAt = bottomHtml.indexOf(`<div class="bill-notes"`);
		const toolsAt = bottomHtml.indexOf(`<div class="bill-tools-actions no-print"`);
		expect(notesAt).toBeGreaterThan(-1);
		expect(toolsAt).toBeGreaterThan(notesAt);
		const tools = bottomHtml.slice(toolsAt);
		const printTag = tools.match(/<button[^>]*data-action="print"[^>]*>/)![0];
		expect(printTag).toContain(`class="btn btn-primary no-print"`);
		const draftTag = tools.match(/<button[^>]*data-action="clear-draft"[^>]*>/)![0];
		expect(draftTag).toContain(`class="btn no-print"`);
	});

	it("page has no form", async () => {
		const html = await render("en");
		expect(html).not.toContain("<form");
		// data-action is allowed; a real action attribute is not.
		expect(html).not.toMatch(/(?<![\w-])action=/);
	});
});
