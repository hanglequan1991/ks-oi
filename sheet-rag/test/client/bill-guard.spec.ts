import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain .mjs script without type declarations
import { buildClient } from "../../scripts/build-client.mjs";

// Source guards for the bill page client (src/client/bill/). They read the
// files as text, so they run without a browser. Comments are stripped before
// the code checks, so prose such as "no fetch" in a header does not count.

const BILL_DIR = fileURLToPath(new URL("../../src/client/bill/", import.meta.url));
const MAIN = join(BILL_DIR, "main.ts");

const files = readdirSync(BILL_DIR)
	.filter((f) => f.endsWith(".ts"))
	.sort();

function raw(name: string): string {
	return readFileSync(join(BILL_DIR, name), "utf8");
}

/** Source without block and line comments. String literals are kept. */
function code(name: string): string {
	return raw(name)
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Module specifiers of every import and re-export. */
function specifiers(src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(/\b(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"']+)["']/g)) {
		out.push(m[1]);
	}
	for (const m of src.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
		out.push(m[1]);
	}
	return out;
}

const FORBIDDEN_CODE: [string, RegExp][] = [
	["innerHTML", /innerHTML/],
	["outerHTML", /outerHTML/],
	["insertAdjacentHTML", /insertAdjacentHTML/],
	["document.write", /document\.write/],
	["eval(", /\beval\s*\(/],
	["new Function", /new\s+Function\b/],
	["XMLHttpRequest", /XMLHttpRequest/],
	["sendBeacon", /sendBeacon/],
	["WebSocket", /WebSocket/],
	["method POST/PUT/DELETE/PATCH", /method\s*:\s*["'`](POST|PUT|DELETE|PATCH)["'`]/i],
	["quoted POST/PUT/DELETE/PATCH", /["'`](POST|PUT|DELETE|PATCH)["'`]/],
	["/admin", /\/admin/],
	["dynamic import(", /(^|[^\w.$])import\s*\(/],
];

describe("client bill sources", () => {
	it("found the bill client files", () => {
		expect(files).toContain("main.ts");
		expect(files).toContain("config.ts");
		expect(files).toContain("storage.ts");
	});

	it("client sources contain no html injection, no writes to the network and no admin or outside imports", () => {
		const problems: string[] = [];
		for (const f of files) {
			const src = code(f);
			for (const [label, re] of FORBIDDEN_CODE) {
				if (re.test(src)) problems.push(`${f}: ${label}`);
			}
			for (const spec of specifiers(src)) {
				const inside = spec.startsWith("./") || spec.startsWith("../../domain/");
				if (!inside) problems.push(`${f}: import from ${spec}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("fetch appears only in main.ts and api.ts", () => {
		const users = files.filter((f) => /\bfetch\b/.test(code(f))).sort();
		expect(users).toEqual(["api.ts", "main.ts"]);
		// main.ts hands fetch to createBillApi
		expect(code("main.ts")).toMatch(/createBillApi\s*\(\s*\{[^}]*\bfetch\b/);
	});

	it("only main.ts touches localStorage and only with the draft key", () => {
		const users = files.filter((f) => /\blocalStorage\b/.test(code(f)));
		expect(users.every((f) => f === "main.ts")).toBe(true);
		expect(users).not.toContain("storage.ts");

		const keys = new Set<string>();
		for (const f of files) {
			for (const m of code(f).matchAll(/["'`]([^"'`\n]*hd_[^"'`\n]*)["'`]/g)) {
				keys.add(m[1]);
			}
		}
		expect([...keys]).toEqual(["hd_bill_v1"]);

		const declared = files.filter((f) => /["'`]hd_bill_v1["'`]/.test(code(f)));
		expect(declared).toEqual(["storage.ts"]);
		const decl = code("storage.ts").match(/["'`]hd_bill_v1["'`]/g) ?? [];
		expect(decl).toHaveLength(1);
	});

	it("no phone or zalo in client code", () => {
		const PHONE = /(?<!\d)(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)/;
		const problems: string[] = [];
		for (const f of files) {
			const src = raw(f);
			if (/\btel:/i.test(src)) problems.push(`${f}: tel:`);
			if (/zalo/i.test(src)) problems.push(`${f}: zalo`);
			if (PHONE.test(src)) problems.push(`${f}: phone number pattern`);
		}
		expect(problems).toEqual([]);
	});

	describe("bundle", () => {
		const dir = mkdtempSync(join(tmpdir(), "bill-guard-"));
		afterAll(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		it("the client bundle builds and stays free of innerHTML", async () => {
			const outfile = join(dir, "bill.js");
			const res = await buildClient({ entry: MAIN, outfile });
			expect(res.outfile).toBe(outfile);
			expect(res.bytes).toBeGreaterThan(0);
			const bundle = readFileSync(outfile, "utf8");
			expect(bundle).not.toContain("innerHTML");
		});
	});
});
