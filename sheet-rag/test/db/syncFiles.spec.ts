import { beforeEach, describe, expect, it } from "vitest";
import {
	getSyncFiles,
	upsertSyncFile,
	type SyncFileRow,
} from "../../src/db/syncFiles";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

let db: FakeD1;
type Db = Parameters<typeof getSyncFiles>[0];
const asDb = (d: FakeD1): Db => d as unknown as Db;

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
});

const ROW: SyncFileRow = {
	fileId: "f1",
	fileName: "Nha Trang",
	modified: "2026-11-18T08:00:00Z",
	skipSig: "skip-a",
	tabs: [
		{ gid: "0", tabName: "Hotel A" },
		{ gid: "123", tabName: "Hotel B" },
	],
	listedAt: "2026-11-19T10:00:00Z",
};

describe("syncFiles db helpers", () => {
	it("syncFiles round trip, bad tabs_json gives null tabs", async () => {
		expect(await getSyncFiles(asDb(db))).toEqual(new Map());

		await upsertSyncFile(asDb(db), ROW);
		await upsertSyncFile(asDb(db), {
			fileId: "f2",
			fileName: null,
			modified: null,
			skipSig: null,
			tabs: null,
			listedAt: null,
		});

		let files = await getSyncFiles(asDb(db));
		expect(files.size).toBe(2);
		expect(files.get("f1")).toEqual(ROW);
		expect(files.get("f2")).toMatchObject({
			fileId: "f2",
			modified: null,
			skipSig: null,
			tabs: null,
			listedAt: null,
		});

		// An upsert replaces the row for the same file id.
		await upsertSyncFile(asDb(db), { ...ROW, modified: "2026-11-19T09:00:00Z", tabs: [] });
		files = await getSyncFiles(asDb(db));
		expect(files.size).toBe(2);
		expect(files.get("f1")).toMatchObject({ modified: "2026-11-19T09:00:00Z", tabs: [] });

		// Invalid JSON in tabs_json reads as null tabs and does not throw.
		await (asDb(db))
			.prepare("UPDATE sync_files SET tabs_json = ? WHERE file_id = ?")
			.bind("{not json", "f1")
			.run();
		files = await getSyncFiles(asDb(db));
		expect(files.get("f1")?.tabs).toBeNull();
		expect(files.get("f1")?.modified).toBe("2026-11-19T09:00:00Z");
	});
});
