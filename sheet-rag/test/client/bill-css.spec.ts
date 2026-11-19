import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Reads public/bill.css as text (no browser). Whitespace is normalised so the
// assertions can match "prop:value" pairs regardless of formatting.

const CSS_PATH = fileURLToPath(new URL("../../public/bill.css", import.meta.url));

function normalise(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.replace(/\s*([{};:,])\s*/g, "$1")
		.trim();
}

interface Block {
	prelude: string;
	body: string;
}

// Parses top-level blocks (rules and at-rules). Nested blocks stay inside body.
function parseBlocks(src: string): Block[] {
	const out: Block[] = [];
	let i = 0;
	while (i < src.length) {
		const open = src.indexOf("{", i);
		if (open < 0) break;
		const prelude = src.slice(i, open).trim();
		let depth = 1;
		let j = open + 1;
		while (j < src.length && depth > 0) {
			if (src[j] === "{") depth++;
			else if (src[j] === "}") depth--;
			j++;
		}
		out.push({ prelude, body: src.slice(open + 1, j - 1) });
		i = j;
	}
	return out;
}

// Compares at-rule preludes ignoring all whitespace, e.g. "@media (max-width: 720px)".
function key(prelude: string): string {
	return prelude.replace(/\s+/g, "");
}

function mediaBody(all: Block[], prelude: string): string {
	return all
		.filter((b) => key(b.prelude) === key(prelude))
		.map((b) => b.body)
		.join(" ");
}

// Concatenated declarations of every rule whose selector list contains `selector`.
function declsOf(blocks: Block[], selector: string): string {
	return blocks
		.filter((b) => !b.prelude.startsWith("@"))
		.filter((b) => b.prelude.split(",").map((s) => s.trim()).includes(selector))
		.map((b) => b.body)
		.join(" ");
}

function hasDecl(body: string, prop: string, value: string): boolean {
	const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`(^|[;{ ])${escaped(prop)}:${escaped(value)}(;|$| )`);
	return re.test(body);
}

function hasProp(body: string, prop: string): boolean {
	return new RegExp(`(^|[;{ ])${prop}(-[\\w-]+)?:`).test(body);
}

const css = normalise(readFileSync(CSS_PATH, "utf8"));
const all = parseBlocks(css);
const screen = all.filter((b) => !b.prelude.startsWith("@"));
const mobile = parseBlocks(mediaBody(all, "@media (max-width: 720px)"));
const print = parseBlocks(mediaBody(all, "@media print"));

const TEMPLATE = "56px minmax(0,1.5fr) minmax(0,1.3fr) 96px 180px 170px 44px";
const PRINT_TEMPLATE = "28px minmax(0,1.5fr) minmax(0,1.3fr) 44px 88px 96px";

describe("bill.css", () => {
	it("design tokens are present and no web font is loaded", () => {
		for (const hex of ["#F4F6F8", "#14202B", "#52606D", "#0F766E", "#115E59", "#C9D2DB", "#DCE3EA"]) {
			expect(css.includes(hex), hex).toBe(true);
		}
		expect(/Inter/.test(css)).toBe(false);
		expect(/googleapis/i.test(css)).toBe(false);
		expect(hasDecl(declsOf(screen, "body"), "background", "#F4F6F8")).toBe(true);
		expect(hasDecl(declsOf(screen, "main"), "max-width", "1280px")).toBe(true);
		expect(hasDecl(declsOf(screen, "main"), "padding", "0")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-page"), "padding", "40px 48px 48px")).toBe(true);
	});

	it("desktop grid template (design) on head, row, note and foot", () => {
		for (const sel of [".bill-head", ".bill-row", ".bill-note", ".bill-foot"]) {
			expect(hasDecl(declsOf(screen, sel), "display", "grid"), sel).toBe(true);
			expect(hasDecl(declsOf(screen, sel), "grid-template-columns", TEMPLATE), sel).toBe(true);
			expect(hasDecl(declsOf(screen, sel), "column-gap", "12px"), sel).toBe(true);
		}
		const head = declsOf(screen, ".bill-head");
		expect(hasDecl(head, "text-transform", "uppercase")).toBe(true);
		expect(hasDecl(head, "font-size", "13px")).toBe(true);
		expect(hasDecl(head, "font-weight", "600")).toBe(true);
		expect(hasDecl(head, "letter-spacing", "0.04em")).toBe(true);
		expect(hasDecl(head, "color", "#52606D")).toBe(true);
		expect(hasDecl(head, "border-bottom", "1px solid #DCE3EA")).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-label"), "grid-column", "1")).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-field"), "grid-column", "2 / 7")).toBe(true);
	});

	it("card, input and focus styling", () => {
		const card = declsOf(screen, ".bill-card");
		expect(hasDecl(card, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(card, "border", "1px solid #DCE3EA")).toBe(true);
		expect(hasDecl(card, "border-radius", "12px")).toBe(true);
		expect(hasDecl(card, "padding", "24px")).toBe(true);
		for (const sel of [".bill-page input", ".bill-page textarea"]) {
			const d = declsOf(screen, sel);
			expect(hasDecl(d, "border", "1px solid #C9D2DB"), sel).toBe(true);
			expect(hasDecl(d, "border-radius", "8px"), sel).toBe(true);
			expect(hasDecl(d, "font-size", "15px"), sel).toBe(true);
		}
		const input = declsOf(screen, ".bill-page input");
		expect(hasDecl(input, "height", "44px")).toBe(true);
		expect(hasDecl(input, "padding", "0 12px")).toBe(true);
		const ta = declsOf(screen, ".bill-page textarea");
		expect(hasDecl(ta, "min-height", "44px")).toBe(true);
		expect(hasDecl(ta, "background", "#FBFCFD")).toBe(true);
		const focus = declsOf(screen, ".bill-page input:focus");
		expect(hasDecl(focus, "border", "2px solid #0F766E")).toBe(true);
		expect(hasDecl(focus, "box-shadow", "0 0 0 3px #CCE9E6")).toBe(true);
		expect(hasDecl(declsOf(screen, ".c-price input"), "text-align", "right")).toBe(true);
		expect(hasDecl(declsOf(screen, ".c-night input"), "text-align", "right")).toBe(true);
		expect(hasDecl(declsOf(screen, ".c-price input"), "font-variant-numeric", "tabular-nums")).toBe(true);
		const total = declsOf(screen, ".c-total");
		expect(hasDecl(total, "font-size", "16px")).toBe(true);
		expect(hasDecl(total, "font-weight", "600")).toBe(true);
		expect(hasDecl(total, "text-align", "right")).toBe(true);
	});

	it("edited price border, badge and reset link", () => {
		expect(hasDecl(declsOf(screen, ".bill-item.is-edited .c-price input"), "border", "2px solid #B45309")).toBe(true);
		const badge = declsOf(screen, ".badge-edited");
		expect(hasDecl(badge, "background", "#FEF3C7")).toBe(true);
		expect(hasDecl(badge, "color", "#92400E")).toBe(true);
		expect(hasDecl(badge, "font-size", "12px")).toBe(true);
		expect(hasDecl(badge, "font-weight", "600")).toBe(true);
		expect(hasDecl(badge, "padding", "4px 8px")).toBe(true);
		expect(hasDecl(badge, "border-radius", "6px")).toBe(true);
		const reset = declsOf(screen, ".btn-reset");
		expect(hasDecl(reset, "border", "0")).toBe(true);
		expect(hasDecl(reset, "background", "none")).toBe(true);
		expect(hasDecl(reset, "color", "#0F766E")).toBe(true);
		expect(hasDecl(reset, "font-size", "13px")).toBe(true);
		expect(hasDecl(reset, "font-weight", "500")).toBe(true);
		expect(hasDecl(declsOf(screen, ".btn-reset:hover"), "text-decoration", "underline")).toBe(true);
		expect(hasDecl(declsOf(screen, ".btn-reset:hover"), "color", "#115E59")).toBe(true);
	});

	it("note label and note field spans, including the edited case", () => {
		const label = declsOf(screen, ".note-label");
		expect(hasDecl(label, "font-size", "12px")).toBe(true);
		expect(hasDecl(label, "font-weight", "600")).toBe(true);
		expect(hasDecl(label, "letter-spacing", "0.06em")).toBe(true);
		expect(hasDecl(label, "padding-top", "14px")).toBe(true);
		expect(hasDecl(label, "grid-column", "1")).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-field"), "grid-column", "2 / 7")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-item.is-edited .note-field"), "grid-column", "2 / 5")).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-markers"), "grid-column", "5 / 7")).toBe(true);
		const markers = declsOf(screen, ".note-markers");
		expect(hasDecl(markers, "display", "flex")).toBe(true);
		expect(hasDecl(markers, "flex-wrap", "wrap")).toBe(true);
		expect(hasDecl(markers, "gap", "8px")).toBe(true);
	});

	it("footer row and grand total columns", () => {
		expect(hasDecl(declsOf(screen, ".bill-actions"), "grid-column", "1 / 5")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-summary"), "display", "contents")).toBe(true);
		const label = declsOf(screen, ".summary-label");
		expect(hasDecl(label, "grid-column", "5")).toBe(true);
		expect(hasDecl(label, "font-size", "14px")).toBe(true);
		expect(hasDecl(label, "font-weight", "600")).toBe(true);
		expect(hasDecl(label, "text-align", "right")).toBe(true);
		const total = declsOf(screen, ".summary-total");
		expect(hasDecl(total, "grid-column", "6")).toBe(true);
		expect(hasDecl(total, "font-size", "24px")).toBe(true);
		expect(hasDecl(total, "font-weight", "700")).toBe(true);
		expect(hasDecl(total, "text-align", "right")).toBe(true);
		expect(hasDecl(total, "font-variant-numeric", "tabular-nums")).toBe(true);
	});

	it("button variants", () => {
		const btn = declsOf(screen, ".btn");
		expect(hasDecl(btn, "min-height", "44px")).toBe(true);
		expect(hasDecl(btn, "padding", "0 18px")).toBe(true);
		expect(hasDecl(btn, "border-radius", "8px")).toBe(true);
		expect(hasDecl(btn, "border", "1px solid #C9D2DB")).toBe(true);
		expect(hasDecl(btn, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(btn, "color", "#14202B")).toBe(true);
		expect(hasDecl(btn, "font-weight", "500")).toBe(true);
		const primary = declsOf(screen, ".btn-primary");
		expect(hasDecl(primary, "background", "#0F766E")).toBe(true);
		expect(hasDecl(primary, "color", "#FFFFFF")).toBe(true);
		expect(hasDecl(declsOf(screen, ".btn-primary:hover"), "background", "#115E59")).toBe(true);
		const outline = declsOf(screen, ".btn-outline");
		expect(hasDecl(outline, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(outline, "border", "1px solid #0F766E")).toBe(true);
		expect(hasDecl(outline, "color", "#0F766E")).toBe(true);
		expect(hasDecl(outline, "font-weight", "600")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-tools-actions"), "display", "flex")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-tools-actions"), "gap", "12px")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-actions"), "gap", "12px")).toBe(true);
		const dis = declsOf(screen, ".btn:disabled");
		expect(hasDecl(dis, "opacity", "0.5")).toBe(true);
		expect(hasDecl(dis, "cursor", "not-allowed")).toBe(true);
	});

	it("header, title size and language toggle", () => {
		const header = declsOf(screen, ".bill-header");
		expect(hasDecl(header, "display", "flex")).toBe(true);
		expect(hasDecl(header, "flex-wrap", "wrap")).toBe(true);
		expect(hasDecl(header, "justify-content", "space-between")).toBe(true);
		expect(hasDecl(header, "align-items", "flex-end")).toBe(true);
		const h1 = declsOf(screen, ".bill-page h1");
		expect(hasDecl(h1, "font-size", "28px")).toBe(true);
		expect(hasDecl(h1, "font-weight", "700")).toBe(true);
		expect(hasDecl(h1, "line-height", "1.2")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-intro"), "font-size", "15px")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-intro"), "color", "#52606D")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-status"), "font-size", "14px")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-status"), "color", "#52606D")).toBe(true);
		const toggle = declsOf(screen, ".lang-toggle");
		expect(hasDecl(toggle, "display", "inline-flex")).toBe(true);
		expect(hasDecl(toggle, "border", "1px solid #C9D2DB")).toBe(true);
		expect(hasDecl(toggle, "border-radius", "8px")).toBe(true);
		expect(hasDecl(toggle, "overflow", "hidden")).toBe(true);
		expect(hasDecl(toggle, "background", "#FFFFFF")).toBe(true);
		const cur = declsOf(screen, ".lang-current");
		expect(hasDecl(cur, "background", "#0F766E")).toBe(true);
		expect(hasDecl(cur, "color", "#FFFFFF")).toBe(true);
		expect(hasDecl(declsOf(screen, ".lang-link"), "color", "#14202B")).toBe(true);
		expect(hasDecl(declsOf(screen, ".lang-link"), "text-decoration", "none")).toBe(true);
		for (const sel of [".lang-current", ".lang-link"]) {
			const d = declsOf(screen, sel);
			expect(hasDecl(d, "font-size", "14px"), sel).toBe(true);
			expect(hasDecl(d, "font-weight", "600"), sel).toBe(true);
			expect(hasDecl(d, "padding", "10px 14px"), sel).toBe(true);
		}
	});

	it("dropdown listbox, active option and hint", () => {
		const list = declsOf(screen, ".combo-list");
		expect(hasDecl(list, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(list, "border", "1px solid #C9D2DB")).toBe(true);
		expect(hasDecl(list, "border-radius", "8px")).toBe(true);
		expect(hasDecl(list, "box-shadow", "0 8px 24px rgba(20,32,43,0.14)")).toBe(true);
		expect(hasDecl(list, "top", "calc(100% + 4px)")).toBe(true);
		expect(hasDecl(list, "max-height", "240px")).toBe(true);
		expect(hasDecl(list, "overflow-y", "auto")).toBe(true);
		const opt = declsOf(screen, ".combo-option");
		expect(hasDecl(opt, "padding", "12px")).toBe(true);
		expect(hasDecl(opt, "font-size", "15px")).toBe(true);
		const selected = declsOf(screen, '.combo-option[aria-selected="true"]');
		expect(hasDecl(selected, "background", "#E6F4F2")).toBe(true);
		expect(hasDecl(selected, "font-weight", "600")).toBe(true);
		const meta = declsOf(screen, '.combo-option [data-field="meta"]');
		expect(hasDecl(meta, "color", "#52606D")).toBe(true);
		expect(hasDecl(meta, "text-align", "right")).toBe(true);
		const hint = declsOf(screen, ".combo-list[data-hint]::after");
		expect(hasDecl(hint, "content", "attr(data-hint)")).toBe(true);
		expect(hasDecl(hint, "font-size", "13px")).toBe(true);
		expect(hasDecl(hint, "color", "#52606D")).toBe(true);
		expect(hasDecl(hint, "padding", "12px")).toBe(true);
		expect(hasDecl(hint, "border-top", "1px solid #EEF2F5")).toBe(true);
	});

	it("mobile card order and dark total bar", () => {
		expect(mediaBody(all, "@media (max-width: 720px)")).not.toBe("");
		expect(hasDecl(declsOf(mobile, ".bill-head"), "display", "none")).toBe(true);
		const card = declsOf(mobile, ".bill-card");
		expect(hasDecl(card, "background", "none")).toBe(true);
		expect(hasDecl(card, "border", "0")).toBe(true);
		expect(hasDecl(card, "padding", "0")).toBe(true);
		const item = declsOf(mobile, ".bill-item");
		expect(hasDecl(item, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(item, "border", "1px solid #DCE3EA")).toBe(true);
		expect(hasDecl(item, "border-radius", "12px")).toBe(true);
		expect(hasDecl(item, "padding", "16px")).toBe(true);
		expect(hasDecl(item, "margin-bottom", "16px")).toBe(true);
		expect(hasDecl(item, "display", "grid")).toBe(true);
		expect(hasDecl(item, "grid-template-columns", "96px minmax(0,1fr)")).toBe(true);
		expect(hasDecl(item, "gap", "12px")).toBe(true);
		for (const sel of [".bill-row", ".bill-note"]) {
			expect(hasDecl(declsOf(mobile, sel), "display", "contents"), sel).toBe(true);
		}
		const orders: Array<[string, string]> = [
			[".c-index", "1"], [".c-remove", "2"], [".c-hotel", "3"], [".c-room", "4"],
			[".c-night", "5"], [".c-price", "6"], [".note-markers", "7"], [".c-total", "8"],
			[".note-label", "9"], [".note-field", "10"],
		];
		for (const [sel, o] of orders) {
			expect(hasDecl(declsOf(mobile, sel), "order", o), sel).toBe(true);
		}
		expect(hasDecl(declsOf(mobile, ".row-title"), "font-size", "15px")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".row-title"), "font-weight", "700")).toBe(true);
		for (const sel of [".c-index .cell-label", '.c-index [data-field="index"]']) {
			expect(hasDecl(declsOf(mobile, sel), "display", "none"), sel).toBe(true);
		}
		expect(hasDecl(declsOf(mobile, ".c-remove"), "justify-self", "end")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".c-remove button"), "width", "44px")).toBe(true);
		for (const sel of [".c-hotel", ".c-room", ".note-markers", ".c-total", ".note-label", ".note-field"]) {
			expect(hasDecl(declsOf(mobile, sel), "grid-column", "1 / -1"), sel).toBe(true);
		}
		expect(hasDecl(declsOf(mobile, ".c-night"), "grid-column", "1")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".c-price"), "grid-column", "2")).toBe(true);
		const tot = declsOf(mobile, ".c-total");
		expect(hasDecl(tot, "display", "flex")).toBe(true);
		expect(hasDecl(tot, "font-size", "18px")).toBe(true);
		expect(hasDecl(tot, "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".c-total .cell-label"), "font-size", "13px")).toBe(true);
		const cl = declsOf(mobile, ".cell-label");
		expect(hasDecl(cl, "display", "block")).toBe(true);
		expect(hasDecl(cl, "font-size", "12px")).toBe(true);
		expect(hasDecl(cl, "font-weight", "600")).toBe(true);
		expect(hasDecl(cl, "text-transform", "uppercase")).toBe(true);
		expect(hasDecl(cl, "letter-spacing", "0.04em")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-page"), "padding", "20px 16px 24px")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-page h1"), "font-size", "22px")).toBe(true);
		const foot = declsOf(mobile, ".bill-foot");
		expect(hasDecl(foot, "display", "flex")).toBe(true);
		expect(hasDecl(foot, "flex-direction", "column")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-actions .btn"), "flex", "1 1 0")).toBe(true);
		const sum = declsOf(mobile, ".bill-summary");
		expect(hasDecl(sum, "display", "flex")).toBe(true);
		expect(hasDecl(sum, "background", "#14202B")).toBe(true);
		expect(hasDecl(sum, "color", "#FFFFFF")).toBe(true);
		expect(hasDecl(sum, "border-radius", "12px")).toBe(true);
		expect(hasDecl(sum, "padding", "16px")).toBe(true);
		const sl = declsOf(mobile, ".bill-summary .summary-label");
		expect(hasDecl(sl, "font-size", "14px")).toBe(true);
		expect(hasDecl(sl, "font-weight", "600")).toBe(true);
		const st = declsOf(mobile, ".bill-summary .summary-total");
		expect(hasDecl(st, "font-size", "24px")).toBe(true);
		expect(hasDecl(st, "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-bottom"), "flex-direction", "column")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-bottom .btn-primary"), "width", "100%")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-bottom .btn-primary"), "min-height", "48px")).toBe(true);
		for (const sel of ["input", "textarea", ".btn", ".btn-reset", ".c-remove button", ".lang-link", ".lang-current"]) {
			expect(hasDecl(declsOf(mobile, sel), "min-height", "44px"), sel).toBe(true);
		}
		for (const sel of [".lang-link", ".lang-current"]) {
			expect(hasDecl(declsOf(mobile, sel), "min-width", "44px"), sel).toBe(true);
		}
	});

	it("print rules hide controls and show mirrors and print head", () => {
		const pageBlock = print.find((b) => b.prelude === "@page");
		expect(pageBlock).toBeDefined();
		expect(hasDecl(pageBlock!.body, "size", "A4")).toBe(true);
		expect(hasDecl(pageBlock!.body, "margin", "14mm")).toBe(true);
		for (const sel of ["header", "footer", ".no-print", "input", "textarea"]) {
			expect(hasDecl(declsOf(print, sel), "display", "none !important"), sel).toBe(true);
		}
		expect(hasDecl(declsOf(print, ".print-only"), "display", "block !important")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-print-head"), "display", "flex")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-item"), "break-inside", "avoid")).toBe(true);
	});

	it("print layout is black and white with a 6-column table", () => {
		const body = declsOf(print, "body");
		expect(hasDecl(body, "background", "#FFFFFF")).toBe(true);
		expect(hasDecl(body, "color", "#111111")).toBe(true);
		for (const sel of [
			".bill-header", ".bill-tools", ".bill-tools-actions", ".bill-actions", ".bill-intro",
			".btn", ".btn-reset", ".badge-edited", ".combo-list", ".c-remove", ".bill-status",
		]) {
			expect(hasDecl(declsOf(print, sel), "display", "none !important"), sel).toBe(true);
		}
		const card = declsOf(print, ".bill-card");
		expect(hasDecl(card, "border", "0")).toBe(true);
		expect(hasDecl(card, "border-radius", "0")).toBe(true);
		expect(hasDecl(card, "background", "transparent")).toBe(true);
		expect(hasDecl(card, "padding", "0")).toBe(true);
		const ph = declsOf(print, ".bill-print-head");
		expect(hasDecl(ph, "display", "flex")).toBe(true);
		expect(hasDecl(ph, "justify-content", "space-between")).toBe(true);
		expect(hasDecl(ph, "border-bottom", "2px solid #111111")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-print-head h1"), "font-size", "24px")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-print-head h1"), "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-print-head > *"), "font-size", "13px")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-print-head > *"), "color", "#444444")).toBe(true);
		for (const sel of [".bill-head", ".bill-row", ".bill-note"]) {
			expect(hasDecl(declsOf(print, sel), "grid-template-columns", PRINT_TEMPLATE), sel).toBe(true);
			expect(hasDecl(declsOf(print, sel), "column-gap", "10px"), sel).toBe(true);
		}
		const head = declsOf(print, ".bill-head");
		expect(hasDecl(head, "font-size", "11px")).toBe(true);
		expect(hasDecl(head, "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-row"), "font-size", "13px")).toBe(true);
		expect(hasDecl(declsOf(print, ".note-label"), "font-size", "10px")).toBe(true);
		expect(hasDecl(declsOf(print, ".note-label"), "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(print, ".note-field"), "grid-column", "2 / 7")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-item.is-edited .note-field"), "grid-column", "2 / 7")).toBe(true);
		const item = declsOf(print, ".bill-item");
		expect(hasDecl(item, "border-bottom", "1px solid #DDDDDD")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-foot"), "border-top", "2px solid #111111")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-foot"), "justify-content", "flex-end")).toBe(true);
		expect(hasDecl(declsOf(print, ".summary-label"), "font-size", "13px")).toBe(true);
		expect(hasDecl(declsOf(print, ".summary-label"), "font-weight", "600")).toBe(true);
		expect(hasDecl(declsOf(print, ".summary-total"), "font-size", "22px")).toBe(true);
		expect(hasDecl(declsOf(print, ".summary-total"), "font-weight", "700")).toBe(true);
		expect(hasDecl(declsOf(print, ".summary-total::after"), "content", '" VND"')).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-notes"), "font-size", "12px")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-notes"), "border-top", "1px solid #999999")).toBe(true);
		// Mobile card rules must not leak into print.
		expect(hasDecl(declsOf(print, ".bill-row"), "display", "grid")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-note"), "display", "grid")).toBe(true);
		expect(hasDecl(item, "display", "block")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-row > *"), "order", "0")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-note > *"), "order", "0")).toBe(true);
		expect(hasDecl(declsOf(print, ".cell-label"), "display", "none")).toBe(true);
	});

	it("empty notes are hidden in print", () => {
		expect(hasDecl(declsOf(print, ".bill-note.is-empty"), "display", "none")).toBe(true);
	});

	it("screen hides print-only parts and print hides edit helpers", () => {
		expect(hasDecl(declsOf(screen, ".print-only"), "display", "none")).toBe(true);
		expect(hasDecl(declsOf(screen, ".print-only"), "white-space", "pre-wrap")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-print-head"), "display", "none")).toBe(true);
		for (const sel of [".badge-edited", ".btn-reset", ".bill-status", ".combo-list", ".btn", ".c-remove"]) {
			expect(hasDecl(declsOf(print, sel), "display", "none !important"), sel).toBe(true);
		}
	});

	it("no imports or external urls and all contract classes exist", () => {
		expect(/@import/i.test(css)).toBe(false);
		expect(/url\(\s*['"]?(https?:)?\/\//i.test(css)).toBe(false);
		expect(/expression\(/i.test(css)).toBe(false);
		const classes = [
			"bill-page", "bill-noscript", "bill-grid", "bill-head", "bill-item", "bill-row", "bill-note",
			"c-index", "c-hotel", "c-room", "c-night", "c-price", "c-total", "c-remove",
			"cell-label", "note-label", "note-field", "is-empty",
			"combo", "combo-list", "combo-option", "badge-edited", "btn-reset", "btn", "btn-primary",
			"btn-danger", "bill-actions", "bill-status", "bill-summary", "bill-notes", "bill-print-head",
			"no-print", "print-only",
			"bill-header", "bill-titlebox", "bill-intro", "bill-tools", "lang-toggle", "lang-current",
			"lang-link", "bill-card", "bill-foot", "summary-label", "summary-total", "bill-bottom",
			"bill-tools-actions", "btn-outline", "row-title", "note-markers", "is-edited",
		];
		for (const cls of classes) {
			expect(new RegExp(`\\.${cls}(?![\\w-])`).test(css), cls).toBe(true);
		}
		expect(css.includes('[aria-selected="true"]')).toBe(true);
	});
});
