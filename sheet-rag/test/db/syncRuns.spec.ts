import { beforeEach, describe, expect, it } from "vitest";
import {
	finishRun,
	getLatestRun,
	getUnfinishedRuns,
	startRun,
} from "../../src/db/syncRuns";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

const NOW = "2026-11-19T10:00:00Z";
const LATER = "2026-11-19T10:05:00Z";

let db: FakeD1;
type Db = Parameters<typeof startRun>[0];
const asDb = (d: FakeD1): Db => d as unknown as Db;

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
});

describe("sync run log (sync_runs)", () => {
	it("getLatestRun returns null when no run exists", async () => {
		expect(await getLatestRun(asDb(db))).toBeNull();
	});

	it("startRun inserts an unfinished run and returns its id", async () => {
		const id = await startRun(asDb(db), "manual", NOW);
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);

		const latest = await getLatestRun(asDb(db));
		expect(latest).toMatchObject({ id, kind: "manual", started_at: NOW, finished_at: null });
	});

	it("finishRun stores the five counts, the notes JSON and finished_at", async () => {
		const id = await startRun(asDb(db), "manual", NOW);
		const items = [{ kind: "failure", tab: "Hotel A", reason: "stars_range" }];
		await finishRun(
			asDb(db),
			id,
			{ created: 2, updated: 1, failed: 1, hidden: 3, unchanged: 4 },
			items,
			LATER,
		);

		const latest = await getLatestRun(asDb(db));
		expect(latest).toMatchObject({
			id,
			finished_at: LATER,
			created: 2,
			updated: 1,
			failed: 1,
			hidden: 3,
			unchanged: 4,
		});
		expect(JSON.parse(latest!.notes as string)).toEqual({ items, truncated: false });
	});

	it("notes are truncated to at most 4000 characters and stay valid JSON", async () => {
		const id = await startRun(asDb(db), "manual", NOW);
		const items = Array.from({ length: 300 }, (_, i) => ({
			kind: "failure",
			tab: `Tab ${i}`,
			reason: "stars_range",
			message: "x".repeat(100),
		}));
		await finishRun(asDb(db), id, { created: 0, updated: 0, failed: 300, hidden: 0, unchanged: 0 }, items, LATER);

		const notes = (await getLatestRun(asDb(db)))!.notes as string;
		expect(notes.length).toBeLessThanOrEqual(4000);
		const parsed = JSON.parse(notes) as { items: unknown[]; truncated: boolean };
		expect(parsed.truncated).toBe(true);
		expect(parsed.items.length).toBeGreaterThan(0);
		expect(parsed.items.length).toBeLessThan(items.length);
		// The kept items are a prefix of the original list, in order.
		expect(parsed.items).toEqual(items.slice(0, parsed.items.length));
	});

	it("getUnfinishedRuns lists only runs without finished_at", async () => {
		const done = await startRun(asDb(db), "manual", NOW);
		await finishRun(asDb(db), done, { created: 0, updated: 0, failed: 0, hidden: 0, unchanged: 0 }, [], LATER);
		const open = await startRun(asDb(db), "scheduled", LATER);

		const unfinished = await getUnfinishedRuns(asDb(db));
		expect(unfinished).toEqual([{ id: open, started_at: LATER }]);
	});
});
