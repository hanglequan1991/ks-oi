import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devices } from "@playwright/test";
import unitConfig from "../../vitest.unit.config.mts";
import playwrightConfig from "../../playwright.config";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("playwright config", () => {
	it("config points at the e2e folder and the two projects", () => {
		const cfg = playwrightConfig;
		expect(cfg.testDir).toBe("./e2e");
		expect(cfg.testMatch).toEqual(/.*\.e2e\.ts$/);
		const names = (cfg.projects ?? []).map((p) => p.name);
		expect(names).toEqual(["chromium", "mobile"]);
		const mobile = (cfg.projects ?? []).find((p) => p.name === "mobile");
		expect(mobile?.use).toMatchObject({ viewport: devices["Pixel 7"].viewport });
		expect(cfg.use?.baseURL).toBe("http://127.0.0.1:8787");
		expect(cfg.retries).toBe(0);
		expect(cfg.fullyParallel).toBe(true);
		expect(cfg.reporter).toBe("list");
	});

	it("uses E2E_BASE_URL for the base URL and a webServer unless it is set", async () => {
		const original = process.env.E2E_BASE_URL;
		try {
			delete process.env.E2E_BASE_URL;
			vi.resetModules();
			const local = (await import("../../playwright.config")).default;
			expect(local.webServer).toBeDefined();
			const ws = Array.isArray(local.webServer) ? local.webServer[0] : local.webServer;
			expect(ws?.command).toBe("npm run build:client && npx wrangler dev --local --port 8787");
			expect(ws?.url).toBe("http://127.0.0.1:8787");
			expect(ws?.reuseExistingServer).toBe(true);
			expect(ws?.timeout).toBe(120_000);

			process.env.E2E_BASE_URL = "https://example.test";
			vi.resetModules();
			const remote = (await import("../../playwright.config")).default;
			expect(remote.use?.baseURL).toBe("https://example.test");
			expect(remote.webServer).toBeUndefined();
		} finally {
			if (original === undefined) delete process.env.E2E_BASE_URL;
			else process.env.E2E_BASE_URL = original;
		}
	});
});

describe("package.json", () => {
	it("package has the dependency and script", () => {
		const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
		expect(pkg.devDependencies["@playwright/test"]).toBeTypeOf("string");
		expect(pkg.scripts.e2e).toBe("playwright test");
	});
});

describe("vitest unit config", () => {
	it("unit config does not collect e2e files", () => {
		const include: string[] = unitConfig.test.include;
		expect(include.some((glob) => glob.includes("e2e"))).toBe(false);
	});
});

describe("config loading without Cloudflare variables", () => {
	let savedToken: string | undefined;

	beforeEach(() => {
		savedToken = process.env.CLOUDFLARE_API_TOKEN;
		delete process.env.CLOUDFLARE_API_TOKEN;
	});

	afterEach(() => {
		if (savedToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
		else process.env.CLOUDFLARE_API_TOKEN = savedToken;
	});

	it("config loads without Cloudflare variables", async () => {
		vi.resetModules();
		const mod = await import("../../playwright.config");
		expect(mod.default.testDir).toBe("./e2e");
		expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
	});
});
