import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchArgs, resolveChromiumPath } from "../../playwright.node.config";

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

describe("chromium path selection", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pw-browsers-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function touch(rel: string): string {
		const full = join(root, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, "");
		return full;
	}

	const noDefault = () => join(root, "no-such-default", "chrome");

	it("PW_CHROMIUM_PATH wins over everything", () => {
		const resolved = resolveChromiumPath(
			{ PW_CHROMIUM_PATH: "/custom/chrome" },
			() => true,
			() => "/default/chrome",
			root,
		);
		expect(resolved).toBe("/custom/chrome");
	});

	it("returns undefined when the default browser exists", () => {
		const resolved = resolveChromiumPath(
			{},
			(p) => p === "/default/chrome",
			() => "/default/chrome",
			root,
		);
		expect(resolved).toBeUndefined();
	});

	it("an empty PW_CHROMIUM_PATH is ignored", () => {
		const resolved = resolveChromiumPath(
			{ PW_CHROMIUM_PATH: "" },
			(p) => p === "/default/chrome",
			() => "/default/chrome",
			root,
		);
		expect(resolved).toBeUndefined();
	});

	it("picks the first chromium-* chrome when default is missing", () => {
		touch("chromium-1300/chrome-linux64/chrome");
		const first = touch("chromium-1243/chrome-linux64/chrome");
		touch("chromium-1100/chrome-linux64/readme.txt");
		touch("chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
		expect(resolveChromiumPath({}, existsSync, noDefault, root)).toBe(first);
	});

	it("falls back to headless shell, then undefined", () => {
		touch("chromium/chrome-linux64/chrome");
		const shell = touch(
			"chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
		);
		expect(resolveChromiumPath({}, existsSync, noDefault, root)).toBe(shell);

		const empty = mkdtempSync(join(tmpdir(), "pw-empty-"));
		try {
			expect(resolveChromiumPath({}, existsSync, noDefault, empty)).toBeUndefined();
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	it("launchArgs adds --no-sandbox only for root", () => {
		expect(launchArgs(true)).toEqual(["--no-sandbox"]);
		expect(launchArgs(false)).toEqual([]);
	});

	it("chromium and mobile projects share the resolved launchOptions", async () => {
		const mod = await import("../../playwright.node.config");
		const isRoot = process.getuid?.() === 0;
		const executablePath = resolveChromiumPath();
		const expected = {
			...(executablePath ? { executablePath } : {}),
			...(isRoot ? { args: launchArgs(true) } : {}),
		};
		const projects = mod.default.projects ?? [];
		const chromiumProject = projects.find((p) => p.name === "chromium");
		const mobileProject = projects.find((p) => p.name === "mobile");

		expect(chromiumProject?.use?.launchOptions).toStrictEqual(expected);
		expect(mobileProject?.use?.launchOptions).toStrictEqual(expected);
		expect(mod.default.webServer).toBeUndefined();
	});
});
