import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function matchesIgnore(pattern: unknown, file: string): boolean {
	if (pattern instanceof RegExp) return pattern.test(file);
	if (typeof pattern === "string") return file.includes(pattern);
	if (Array.isArray(pattern)) return pattern.some((p) => matchesIgnore(p, file));
	return false;
}

describe("playwright node config", () => {
	it("node config has no webServer and ignores live TCs", async () => {
		const mod = await import("../../playwright.node.config");
		const config = mod.default;

		expect(config.testDir).toBe("./e2e");
		expect(config.testMatch).toEqual(/.*\.e2e\.ts$/);
		expect(config.webServer).toBeUndefined();

		const projectNames = (config.projects ?? []).map((p) => p.name);
		expect(projectNames).toEqual(expect.arrayContaining(["chromium", "mobile"]));

		for (const live of ["e2e/TC-10.e2e.ts", "e2e/TC-23.e2e.ts", "e2e/TC-24.e2e.ts", "e2e/TC-39.e2e.ts", "e2e/TC-62.e2e.ts"]) {
			expect(matchesIgnore(config.testIgnore, live), live).toBe(true);
		}
		for (const local of ["e2e/TC-1.e2e.ts", "e2e/TC-11.e2e.ts", "e2e/TC-100.e2e.ts"]) {
			expect(matchesIgnore(config.testIgnore, local), local).toBe(false);
		}
	});

	it("package has the e2e:node script and keeps e2e", () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts["e2e:node"]).toBe("playwright test -c playwright.node.config.ts");
		expect(pkg.scripts["e2e"]).toBe("playwright test");
	});

	it("migrations fake has no import.meta", () => {
		const text = readFileSync(join(ROOT, "test", "fakes", "migrations.ts"), "utf8");
		expect(text).not.toContain("import.meta");
	});

	it("playwright --list loads the node config and TC-1 under CJS", () => {
		const stdout = execFileSync(
			"npx",
			["playwright", "test", "-c", "playwright.node.config.ts", "--list"],
			{ cwd: ROOT, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
		);
		expect(stdout).toContain("TC-1.e2e.ts");
	}, 60_000);

	it("main config still has its webServer", async () => {
		const saved = process.env.E2E_BASE_URL;
		delete process.env.E2E_BASE_URL;
		try {
			const mod = await import("../../playwright.config");
			expect(mod.default.webServer).toBeDefined();
		} finally {
			if (saved !== undefined) process.env.E2E_BASE_URL = saved;
		}
	});
});
