import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Config and docs checks for the hotel-dictionary Worker (TASK-42). Plain file
// reads from sheet-rag/ (the working directory under vitest). No network.

const ROOT = process.cwd();

function read(name: string): string {
	return readFileSync(join(ROOT, name), "utf8");
}

// Strips /* */ and // comments. The wrangler.hotel.jsonc file holds no URLs,
// so a simple strip is safe for it.
function parseJsonc(text: string): Record<string, any> {
	const stripped = text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:\\])\/\/.*$/gm, "$1");
	return JSON.parse(stripped);
}

describe("wrangler.hotel.jsonc", () => {
	it("wrangler.hotel.jsonc: parses and has the expected fields", () => {
		const cfg = parseJsonc(read("wrangler.hotel.jsonc"));
		const main = parseJsonc(read("wrangler.jsonc"));

		expect(cfg.name).toBe("hotel-dictionary");
		expect(cfg.main).toBe("src/site.ts");
		expect(cfg.compatibility_date).toBe(main.compatibility_date);
		expect(cfg.observability?.enabled).toBe(true);

		expect(cfg.d1_databases).toHaveLength(1);
		const db = cfg.d1_databases[0];
		expect(db.binding).toBe("DB");
		expect(db.database_name).toBe("hotel-dictionary");
		expect(db.database_id).toBe("REPLACE_WITH_D1_ID");
		expect(db.migrations_dir).toBe("migrations");

		expect(cfg.assets.directory).toBe("./public");
		expect(cfg.assets.binding).toBe("ASSETS");
		expect(cfg.assets).not.toHaveProperty("run_worker_first");

		expect(cfg.build.command).toBe("npm run build:client");
	});

	it("wrangler.hotel.jsonc: does not mention sheet-rag and has no AI or Vectorize", () => {
		const text = read("wrangler.hotel.jsonc");
		expect(text).not.toContain("sheet-rag");
		const cfg = parseJsonc(text);
		expect(cfg).not.toHaveProperty("ai");
		expect(cfg).not.toHaveProperty("vectorize");
	});
});

describe("package.json", () => {
	it("package.json: has deploy:hotel and dry-run:hotel and keeps the existing scripts", () => {
		const pkg = JSON.parse(read("package.json"));
		expect(pkg.scripts["deploy:hotel"]).toBe("wrangler deploy -c wrangler.hotel.jsonc");
		expect(pkg.scripts["dry-run:hotel"]).toBe(
			"wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel",
		);

		expect(pkg.scripts).toMatchObject({
			deploy: "wrangler deploy",
			dev: "wrangler dev",
			start: "wrangler dev",
			test: "vitest --config vitest.unit.config.mts",
			"cf-typegen": "wrangler types",
			e2e: "playwright test",
			"e2e:node": "playwright test -c playwright.node.config.ts",
			"build:client": "node scripts/build-client.mjs",
			predeploy: "npm run build:client",
			predev: "npm run build:client",
		});
		expect(pkg.dependencies).toEqual({ hono: "^4.13.19" });
		expect(pkg.devDependencies).toMatchObject({
			wrangler: "^4.160.1",
			vitest: "~5.0.3",
			typescript: "^5.5.2",
		});
	});
});

describe("DEPLOY-hotel-dictionary.md", () => {
	it("DEPLOY-hotel-dictionary.md: contains the required commands and URLs", () => {
		const doc = read("DEPLOY-hotel-dictionary.md");
		const required = [
			"npx wrangler d1 create hotel-dictionary",
			"database_id",
			"npx wrangler d1 migrations apply hotel-dictionary --remote -c wrangler.hotel.jsonc",
			"npm run build:client",
			"npx wrangler deploy -c wrangler.hotel.jsonc",
			"npm run deploy:hotel",
			"/bill",
			"/en/bill",
			"/api/config",
			"/api/hotels",
			"/api/cities",
			"npx wrangler deploy --dry-run -c wrangler.hotel.jsonc --outdir .wrangler/dry-run-hotel",
			"CF-Connecting-IP",
			"in-memory",
		];
		for (const text of required) {
			expect(doc, text).toContain(text);
		}

		// Order: create, paste id, migrate, build, deploy.
		const order = [
			"npx wrangler d1 create hotel-dictionary",
			"database_id",
			"npx wrangler d1 migrations apply hotel-dictionary --remote -c wrangler.hotel.jsonc",
			"npm run build:client",
			"npx wrangler deploy -c wrangler.hotel.jsonc",
		].map((s) => doc.indexOf(s));
		for (let i = 1; i < order.length; i++) {
			expect(order[i], `order ${i}`).toBeGreaterThan(order[i - 1]);
		}
	});
});

describe("wrangler.hotel.jsonc: sync settings (TASK-56)", () => {
	it("wrangler.hotel.jsonc has the cron trigger, the DRIVE_FOLDER_ID and SKIP_TABS vars and no secrets", () => {
		const text = read("wrangler.hotel.jsonc");
		const cfg = parseJsonc(text);

		expect(cfg.triggers?.crons).toEqual(["0 * * * *"]);
		expect(cfg.vars.DRIVE_FOLDER_ID).toBe("REPLACE_WITH_DRIVE_FOLDER_ID");
		expect(cfg.vars.SKIP_TABS).toBe("[]");

		// The secret is set with wrangler, never stored in the file.
		expect(cfg.vars).not.toHaveProperty("SYNC_TOKEN");
		expect(text).toContain("wrangler secret put SYNC_TOKEN");
		expect(text).not.toMatch(/SYNC_TOKEN"?\s*:\s*"(?!\s*$)/);
	});
});
