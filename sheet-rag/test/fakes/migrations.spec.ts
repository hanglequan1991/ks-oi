import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeD1 } from "./d1";
import { applyMigrations, listMigrationFiles } from "./migrations";

describe("applyMigrations", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "sheet-rag-migrations-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("applies .sql files in name order from a temp dir", async () => {
		// 002 inserts into a table created by 001, so this only passes if files run in name order.
		writeFileSync(join(dir, "002_seed.sql"), "INSERT INTO widgets (name) VALUES ('seeded');");
		writeFileSync(join(dir, "001_create.sql"), "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);");
		writeFileSync(join(dir, "notes.txt"), "this is not a migration");

		expect(listMigrationFiles(dir)).toEqual([
			join(dir, "001_create.sql"),
			join(dir, "002_seed.sql"),
		]);

		const db = createFakeD1();
		await applyMigrations(db, dir);

		const row = await db.prepare("SELECT name FROM widgets").first<{ name: string }>();
		expect(row?.name).toBe("seeded");
	});

	it("missing or empty migrations dir is a no-op", async () => {
		const db = createFakeD1();

		const missing = join(dir, "does-not-exist");
		await expect(applyMigrations(db, missing)).resolves.toBeUndefined();
		expect(listMigrationFiles(missing)).toEqual([]);

		const empty = join(dir, "empty");
		mkdirSync(empty);
		await expect(applyMigrations(db, empty)).resolves.toBeUndefined();
		expect(listMigrationFiles(empty)).toEqual([]);

		const tables = await db
			.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
			.first<{ n: number }>();
		expect(tables?.n).toBe(0);
	});

	it("applyMigrations without dir uses the repo migrations folder", async () => {
		const db = createFakeD1();
		await applyMigrations(db);
		const names = await db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
			.first<{ name: string }>();
		expect(names?.name).toBe("settings");
	});

	it("runs without CLOUDFLARE_API_TOKEN", async () => {
		const saved = process.env.CLOUDFLARE_API_TOKEN;
		delete process.env.CLOUDFLARE_API_TOKEN;
		try {
			writeFileSync(join(dir, "001_create.sql"), "CREATE TABLE ping (id INTEGER);");
			const db = createFakeD1();
			await applyMigrations(db, dir);
			await db.prepare("INSERT INTO ping (id) VALUES (?)").bind(1).run();
			const row = await db.prepare("SELECT id FROM ping").first<{ id: number }>();
			expect(row?.id).toBe(1);
			expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
		} finally {
			if (saved !== undefined) process.env.CLOUDFLARE_API_TOKEN = saved;
		}
	});
});
