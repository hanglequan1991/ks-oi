import { describe, expect, it } from "vitest";
import { createFakeD1 } from "./d1";

describe("createFakeD1", () => {
	it("runs prepare/bind/first/all/run against an in-memory database", async () => {
		const db = createFakeD1();
		await db.exec("CREATE TABLE sheets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

		const inserted = await db
			.prepare("INSERT INTO sheets (name) VALUES (?)")
			.bind("budget")
			.run();
		expect(inserted.success).toBe(true);
		expect(inserted.meta.changes).toBe(1);
		expect(inserted.meta.last_row_id).toBe(1);

		await db.prepare("INSERT INTO sheets (name) VALUES (?)").bind("roster").run();

		const one = await db
			.prepare("SELECT id, name FROM sheets WHERE name = ?")
			.bind("roster")
			.first<{ id: number; name: string }>();
		expect(one).toEqual({ id: 2, name: "roster" });

		const missing = await db
			.prepare("SELECT id FROM sheets WHERE name = ?")
			.bind("nope")
			.first();
		expect(missing).toBeNull();

		const all = await db.prepare("SELECT id, name FROM sheets ORDER BY id").all();
		expect(all.success).toBe(true);
		expect(all.results).toEqual([
			{ id: 1, name: "budget" },
			{ id: 2, name: "roster" },
		]);
		expect(all.meta).toBeDefined();
	});

	it("enforces foreign keys", async () => {
		const db = createFakeD1();
		await db.exec("CREATE TABLE parents (id INTEGER PRIMARY KEY)");
		await db.exec(
			"CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id))",
		);

		await expect(
			db.prepare("INSERT INTO children (parent_id) VALUES (?)").bind(999).run(),
		).rejects.toThrow();
	});

	it("rejects on invalid SQL", async () => {
		const db = createFakeD1();
		await expect(db.prepare("SELEC nonsense FROM").all()).rejects.toThrow();
		await expect(db.exec("CREATE TABLE")).rejects.toThrow();
	});

	it("batch rolls back when one statement fails", async () => {
		const db = createFakeD1();
		await db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");

		await expect(
			db.batch([
				db.prepare("INSERT INTO items (label) VALUES (?)").bind("first"),
				db.prepare("INSERT INTO items (label) VALUES (?)").bind("second"),
				db.prepare("INSERT INTO items (missing_column) VALUES (?)").bind("boom"),
			]),
		).rejects.toThrow();

		const rows = await db.prepare("SELECT COUNT(*) AS n FROM items").first<{ n: number }>();
		expect(rows?.n).toBe(0);
	});

	it("batch applies all statements when none fail", async () => {
		const db = createFakeD1();
		await db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");

		const results = await db.batch([
			db.prepare("INSERT INTO items (label) VALUES (?)").bind("a"),
			db.prepare("INSERT INTO items (label) VALUES (?)").bind("b"),
		]);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success)).toBe(true);

		const rows = await db.prepare("SELECT COUNT(*) AS n FROM items").first<{ n: number }>();
		expect(rows?.n).toBe(2);
	});
});
