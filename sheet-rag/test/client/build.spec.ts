import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain .mjs script without type declarations
import { buildClient } from "../../scripts/build-client.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MONEY = fileURLToPath(new URL("../../src/domain/money.ts", import.meta.url));

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bill-build-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("buildClient", () => {
	it("builds a ts entry that imports the domain into one iife", async () => {
		const entry = join(dir, "main.ts");
		const outfile = join(dir, "bill.js");
		writeFileSync(
			entry,
			`import { parseVnd } from ${JSON.stringify(MONEY)};\n` +
				`(globalThis as any).__parsed = parseVnd("1.250.000 VND");\n`,
		);

		const res = await buildClient({ entry, outfile });
		expect(res.outfile).toBe(outfile);
		expect(res.bytes).toBeGreaterThan(0);

		const code = readFileSync(outfile, "utf8");
		expect(res.bytes).toBe(Buffer.byteLength(code, "utf8"));
		// single file, no module syntax left
		expect(code).not.toMatch(/(^|[;\s{}])import[\s{*"']/m);
		expect(code).not.toMatch(/\brequire\(/);
		expect(code).not.toMatch(/\bexport\s/);
		// wrapped as an IIFE
		expect(code.trim().startsWith("(")).toBe(true);
		expect(code.trim().endsWith(")();")).toBe(true);
	});

	it("with minify false keeps the bundled parseVnd code from src/domain", async () => {
		const entry = join(dir, "main.ts");
		const outfile = join(dir, "bill-readable.js");
		writeFileSync(
			entry,
			`import { parseVnd } from ${JSON.stringify(MONEY)};\n` +
				`(globalThis as any).__parsed = parseVnd("1.250.000 VND");\n`,
		);

		await buildClient({ entry, outfile, minify: false });
		const code = readFileSync(outfile, "utf8");
		expect(code).toContain("parseVnd");
		expect(code).toContain("MAX_PRICE_DIGITS");
	});

	it("a broken entry fails the build", async () => {
		const entry = join(dir, "broken.ts");
		const outfile = join(dir, "broken-out.js");
		writeFileSync(entry, `export const x = (;\n`);

		await expect(buildClient({ entry, outfile })).rejects.toThrow();
		expect(existsSync(outfile)).toBe(false);
	});

	it("build runs without Cloudflare variables", async () => {
		const saved: Record<string, string | undefined> = {};
		for (const k of Object.keys(process.env)) {
			if (k.startsWith("CLOUDFLARE_")) {
				saved[k] = process.env[k];
				delete process.env[k];
			}
		}
		const fetchSpy = vi.fn(() => {
			throw new Error("network access is not allowed in the client build");
		});
		vi.stubGlobal("fetch", fetchSpy);
		try {
			expect(Object.keys(process.env).some((k) => k.startsWith("CLOUDFLARE_"))).toBe(false);
			const entry = join(dir, "main.ts");
			const outfile = join(dir, "bill-nocf.js");
			writeFileSync(entry, `import { parseVnd } from ${JSON.stringify(MONEY)};\nparseVnd("5");\n`);
			const res = await buildClient({ entry, outfile });
			expect(res.bytes).toBeGreaterThan(0);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			for (const [k, v] of Object.entries(saved)) process.env[k] = v;
		}

		const script = readFileSync(join(ROOT, "scripts/build-client.mjs"), "utf8");
		expect(script).not.toMatch(/from\s+["'](node:)?(http|https|net|tls|dns)["']/);
		expect(script).not.toMatch(/\bfetch\(/);
	});

	it("package scripts and gitignore are in place", () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
		expect(pkg.scripts["build:client"]).toBe("node scripts/build-client.mjs");
		expect(pkg.scripts.predeploy).toBe("npm run build:client");
		expect(pkg.scripts.predev).toBe("npm run build:client");
		expect(pkg.devDependencies.esbuild).toBe("^0.28.2");

		const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8")
			.split(/\r?\n/)
			.map((l) => l.trim());
		expect(ignore).toContain("public/bill.js");
		expect(ignore).toContain("test-results/");
		expect(ignore).toContain("playwright-report/");
	});
});
