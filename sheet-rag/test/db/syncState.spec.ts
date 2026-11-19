import { describe, expect, it } from "vitest";
import {
	getSyncState,
	markTabMissing,
	markTabSeen,
	recordTabError,
	recordTabSuccess,
} from "../../src/db/syncState";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

async function migratedDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	return db;
}

const asD1 = (db: FakeD1) => db as unknown as D1Database;

describe("syncState db helpers", () => {
	it("syncState db helpers round trip on fake D1 with migrations", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "Hotel A", now: "t1" });
		let state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			source_file_id: "f1",
			source_gid: "0",
			tab_name: "Hotel A",
			last_seen_at: "t1",
			hash: null,
			last_error: null,
			missing_since: null,
		});

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h1",
			now: "t2",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			hotel_id: "hotel-a",
			hash: "h1",
			last_seen_at: "t2",
			last_error: null,
			missing_since: null,
		});

		// An error keeps the old hash and records the message.
		await recordTabError(d1, {
			fileId: "f1",
			gid: "0",
			tabName: "Hotel A",
			error: "csv_parse_failed",
			now: "t3",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			hash: "h1",
			last_error: "csv_parse_failed",
			hotel_id: "hotel-a",
		});

		// A later success clears the error.
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h2",
			now: "t4",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({ hash: "h2", last_error: null });

		// Missing marks the row with the time and prior status; a second mark keeps the first time.
		await markTabMissing(d1, "f1:0", "t5", "published");
		await markTabMissing(d1, "f1:0", "t6", "published");
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			missing_since: "t5",
			prior_status: "published",
		});

		// A success after missing clears missing_since (the tab came back).
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h2",
			now: "t7",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")?.missing_since).toBeNull();
	});

	it("getSyncState returns an empty map when no rows exist", async () => {
		const db = await migratedDb();
		const state = await getSyncState(asD1(db));
		expect(state.size).toBe(0);
	});
});
