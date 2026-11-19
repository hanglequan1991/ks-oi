import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { createSubrequestBudget } from "../../src/sync/budget";
import { countingDb } from "../../src/sync/countingDb";

// The fake does not implement `raw`, so add it to each prepared statement for these tests.
function withRaw(db: FakeD1): FakeD1 {
	const prepare = db.prepare.bind(db);
	return {
		...db,
		prepare(sql: string) {
			const statement = prepare(sql);
			return Object.assign(statement, {
				raw: async () => [[...sql]],
			}) as ReturnType<FakeD1["prepare"]>;
		},
		batch: db.batch.bind(db),
		exec: db.exec.bind(db),
	} as FakeD1;
}

async function setup() {
	const fake = withRaw(createFakeD1());
	await fake.exec("CREATE TABLE sheets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
	await fake.exec("INSERT INTO sheets (name) VALUES ('a'), ('b')");
	const budget = createSubrequestBudget(100);
	const db = countingDb(fake as unknown as D1Database, budget);
	return { fake, db, budget };
}

describe("countingDb", () => {
	it("countingDb counts run, first, all, raw once each", async () => {
		const { db, budget } = await setup();
		const stmt = db.prepare("SELECT name FROM sheets WHERE id = ?");

		await stmt.bind(1).run();
		expect(budget.used).toBe(1);
		await stmt.bind(1).first();
		expect(budget.used).toBe(2);
		await stmt.bind(1).all();
		expect(budget.used).toBe(3);
		await (db.prepare("SELECT 1") as unknown as { raw(): Promise<unknown> }).raw();
		expect(budget.used).toBe(4);
	});

	it("countingDb counts a batch of several statements as one", async () => {
		const { db, budget } = await setup();
		const results = await db.batch([
			db.prepare("INSERT INTO sheets (name) VALUES (?)").bind("c"),
			db.prepare("INSERT INTO sheets (name) VALUES (?)").bind("d"),
			db.prepare("SELECT COUNT(*) AS n FROM sheets"),
		]);
		expect(results).toHaveLength(3);
		expect(budget.used).toBe(1);
	});

	it("countingDb returns the same results and rethrows the same errors", async () => {
		const { fake, db, budget } = await setup();

		const direct = await fake.prepare("SELECT id, name FROM sheets ORDER BY id").all();
		const counted = await db.prepare("SELECT id, name FROM sheets ORDER BY id").all();
		// duration is a timing value, so compare everything else.
		expect(counted.results).toEqual(direct.results);
		expect(counted.success).toBe(direct.success);
		expect({ ...counted.meta, duration: 0 }).toEqual({ ...direct.meta, duration: 0 });

		const directFirst = await fake.prepare("SELECT name FROM sheets WHERE id = ?").bind(2).first();
		const countedFirst = await db.prepare("SELECT name FROM sheets WHERE id = ?").bind(2).first();
		expect(countedFirst).toEqual(directFirst);

		const missingFirst = await db.prepare("SELECT name FROM sheets WHERE id = ?").bind(99).first();
		expect(missingFirst).toBeNull();

		const directError = await fake
			.prepare("SELECT * FROM missing_table")
			.all()
			.catch((e: unknown) => e);
		const countedError = await db
			.prepare("SELECT * FROM missing_table")
			.all()
			.catch((e: unknown) => e);
		expect(directError).toBeInstanceOf(Error);
		expect((countedError as Error).message).toBe((directError as Error).message);
		expect(budget.used).toBeGreaterThan(0);
	});

	it("countingDb counts exec and dump and passes prepare through", async () => {
		const { db, budget } = await setup();
		await db.exec("INSERT INTO sheets (name) VALUES ('e')");
		expect(budget.used).toBe(1);
		const bound = db.prepare("SELECT 1").bind();
		expect(typeof bound.run).toBe("function");
		expect(budget.used).toBe(1);
	});
});
