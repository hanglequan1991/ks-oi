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

// Compares at-rule preludes ignoring all whitespace, e.g. "@media (max-width:720px)".
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

const TEMPLATE = "56px 2fr 2fr 110px 170px 170px 52px";

describe("bill.css", () => {
	it("desktop grid template and note alignment", () => {
		expect(hasDecl(declsOf(screen, ".bill-head"), "display", "grid")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-head"), "grid-template-columns", TEMPLATE)).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-row"), "display", "grid")).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-row"), "grid-template-columns", TEMPLATE)).toBe(true);
		expect(hasDecl(declsOf(screen, ".bill-note"), "grid-template-columns", TEMPLATE)).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-label"), "grid-column", "1")).toBe(true);
		expect(hasDecl(declsOf(screen, ".note-field"), "grid-column", "2 / 7")).toBe(true);
	});

	it("mobile card rules and 44 px targets", () => {
		expect(mediaBody(all, "@media (max-width: 720px)")).not.toBe("");
		expect(hasDecl(declsOf(mobile, ".bill-head"), "display", "none")).toBe(true);
		expect(hasProp(declsOf(mobile, ".bill-item"), "border")).toBe(true);
		expect(hasProp(declsOf(mobile, ".bill-item"), "padding")).toBe(true);
		const row = declsOf(mobile, ".bill-row");
		expect(/display:(flex|grid)/.test(row)).toBe(true);
		expect(hasDecl(declsOf(mobile, ".cell-label"), "display", "block")).toBe(true);
		expect(hasDecl(declsOf(mobile, ".bill-note"), "grid-template-columns", "1fr")).toBe(true);
		for (const sel of ["input", "textarea", ".btn", ".btn-reset", ".c-remove button"]) {
			expect(hasDecl(declsOf(mobile, sel), "min-height", "44px"), sel).toBe(true);
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
		expect(hasDecl(declsOf(print, ".bill-print-head"), "display", "block")).toBe(true);
		expect(hasDecl(declsOf(print, ".bill-item"), "break-inside", "avoid")).toBe(true);
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
		];
		for (const cls of classes) {
			expect(new RegExp(`\\.${cls}(?![\\w-])`).test(css), cls).toBe(true);
		}
		expect(css.includes('[aria-selected="true"]')).toBe(true);
	});
});
