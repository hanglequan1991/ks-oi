// Validate, then apply one synced hotel tab in a single D1 batch (STORY-14, TASK-53).
//
// An invalid record writes nothing: it only records the error (the hash is kept, so the
// next run retries). A valid record is applied with one db.batch(): city, hotel, images,
// facilities, rooms and rules, then the restore of a hidden hotel, then the overrides,
// then the data_version bump, then the sync_state success row and the sync_tab_checks row. Either all of it is
// visible or none of it is.

import { foldText } from "../domain/fold";
import { recordTabError, tabCheckStatement } from "../db/syncState";
import { hotelIdFor } from "./hash";
import { buildHotelStatements, unmappedFacilities, type HotelWriteContext } from "./writeHotel";
import { buildRoomStatements } from "./writeRooms";
import { buildDataVersionStatement, buildOverrideStatements } from "./overrides";
import { validateHotel, type ValidationIssue } from "./validate";
import type { ParsedHotel } from "./record";
import type { SheetTab } from "./sheetSource";

export type SyncHotelInput = {
	tab: SheetTab;
	record: ParsedHotel;
	/** Content hash of the tab; stored only after a successful apply. */
	hash: string;
	/** Sync time (ISO text). */
	now: string;
	/** Status of a new hotel: published when true, review when false. */
	autoPublish: boolean;
};

export type SyncHotelResult = {
	outcome: "created" | "updated" | "invalid" | "error";
	hotelId: string;
	/** Validation errors; set only for `invalid`. */
	issues?: ValidationIssue[];
	/** Sheet facility labels that match no catalog code or synonym. */
	unmappedFacilities: string[];
};

type ExistingHotel = { slug: string; status: "review" | "published" | "hidden" };

/** City slug, the same form as writeHotel uses for the city row. */
function citySlugFor(fileName: string): string {
	return foldText(fileName).replace(/ /g, "-");
}

/**
 * Slug of a new hotel: `${citySlug}-${foldedName}`, then `-2`, `-3`... while another hotel
 * has it. Existing hotels keep their slug (see syncHotel), so this runs for new ids only.
 */
async function newSlugFor(db: D1Database, tab: SheetTab, hotelId: string): Promise<string> {
	const base = `${citySlugFor(tab.fileName)}-${foldText(tab.tabName).replace(/ /g, "-")}`;
	for (let n = 1; ; n++) {
		const candidate = n === 1 ? base : `${base}-${n}`;
		const taken = await db
			.prepare("SELECT 1 AS hit FROM hotels WHERE slug = ? AND id <> ? LIMIT 1")
			.bind(candidate, hotelId)
			.first<{ hit: number }>();
		if (taken === null) return candidate;
	}
}

/**
 * Restores a hotel that sync hid because its tab went missing. Only a row with
 * hidden_by_sync = 1 is touched; an owner-hidden hotel stays hidden. The status becomes
 * prior_status when it is review or published, and review otherwise (NULL, invalid or
 * 'hidden'), so a restored hotel is never left hidden and never auto-published from an
 * unknown state. Must run before the overrides, so an override of the status still wins.
 * The status is read from sync_state before the flag is cleared (the order of the two
 * statements matters).
 */
function restoreStatements(db: D1Database, tab: SheetTab, hotelId: string, now: string): D1PreparedStatement[] {
	return [
		db
			.prepare(
				`UPDATE hotels SET status = (SELECT CASE WHEN prior_status IN ('review', 'published')
				                                         THEN prior_status ELSE 'review' END
				                             FROM sync_state
				                             WHERE source_file_id = ?1 AND source_gid = ?2)
				 WHERE id = ?3 AND EXISTS (
				   SELECT 1 FROM sync_state
				   WHERE source_file_id = ?1 AND source_gid = ?2 AND hidden_by_sync = 1)`,
			)
			.bind(tab.fileId, tab.gid, hotelId),
		db
			.prepare(
				`UPDATE sync_state SET hidden_by_sync = 0, prior_status = NULL, updated_at = ?3
				 WHERE source_file_id = ?1 AND source_gid = ?2 AND hidden_by_sync = 1`,
			)
			.bind(tab.fileId, tab.gid, now),
	];
}

/**
 * Success row for sync_state, the same effect as recordTabSuccess (syncState.ts) but as a
 * statement, so it can join the hotel batch. Clears last_error and missing_since.
 */
function recordSuccessStatement(
	db: D1Database,
	tab: SheetTab,
	hotelId: string,
	hash: string,
	now: string,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO sync_state (source_file_id, source_gid, hotel_id, tab_name, hash, last_seen_at, missing_since, last_error, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
			 ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
			   hotel_id = excluded.hotel_id,
			   tab_name = excluded.tab_name,
			   hash = excluded.hash,
			   last_seen_at = excluded.last_seen_at,
			   missing_since = NULL,
			   last_error = NULL,
			   updated_at = excluded.updated_at`,
		)
		.bind(tab.fileId, tab.gid, hotelId, tab.tabName, hash, now, now);
}

export async function syncHotel(db: D1Database, input: SyncHotelInput): Promise<SyncHotelResult> {
	const { tab, record, hash, now, autoPublish } = input;
	const hotelId = await hotelIdFor(tab.fileId, tab.gid);

	const validation = validateHotel(record);
	if (!validation.ok) {
		await recordTabError(db, {
			fileId: tab.fileId,
			gid: tab.gid,
			tabName: tab.tabName,
			error: validation.errors.map((issue) => issue.message).join(" "),
			now,
		});
		return { outcome: "invalid", hotelId, issues: validation.errors, unmappedFacilities: [] };
	}

	try {
		const existing = await db
			.prepare("SELECT slug, status FROM hotels WHERE id = ?")
			.bind(hotelId)
			.first<ExistingHotel>();
		const slug = existing ? existing.slug : await newSlugFor(db, tab, hotelId);
		const unmapped = await unmappedFacilities(db, record.facilities);

		const ctx: HotelWriteContext = {
			tab,
			record,
			hotelId,
			slug,
			now,
			autoPublish,
			existingStatus: existing ? existing.status : null,
			hash,
		};
		const statements: D1PreparedStatement[] = [
			...buildHotelStatements(db, ctx),
			...(await buildRoomStatements(db, { hotelId, record, now })),
			...restoreStatements(db, tab, hotelId, now),
			...buildOverrideStatements(db, hotelId),
			buildDataVersionStatement(db),
			recordSuccessStatement(db, tab, hotelId, hash, now),
			// Same check upsert as recordTabSuccess (the success row above is already in the batch).
			tabCheckStatement(db, tab, now),
		];
		await db.batch(statements);

		return {
			outcome: existing ? "updated" : "created",
			hotelId,
			unmappedFacilities: unmapped,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await recordTabError(db, { fileId: tab.fileId, gid: tab.gid, tabName: tab.tabName, error: message, now });
		return { outcome: "error", hotelId, unmappedFacilities: [] };
	}
}
