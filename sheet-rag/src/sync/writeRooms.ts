// Statement builder for the rooms and booking rules of one hotel (STORY-14, TASK-51).
//
// Returns D1 prepared statements for the caller to run in one batch. Nothing is
// executed here. Prices are the sheet BASE price only (whole VND or NULL); no
// service fee is applied. Rooms from Mytour (source='mytour') are never touched.

import { foldText } from "../domain/fold";
import { sha256Hex } from "./hash";
import type { ParsedHotel, ParsedRoom } from "./record";

export type BuildRoomStatementsInput = {
	hotelId: string;
	/** Parsed hotel record from the sheet tab. */
	record: ParsedHotel;
	/** Sync time (ISO text), stored as booking_rules.synced_at. */
	now: string;
};

/** Stable room id: first 16 hex chars of sha256(hotelId:foldedName). */
async function roomIdFor(hotelId: string, name: string): Promise<string> {
	return (await sha256Hex(`${hotelId}:${foldText(name)}`)).slice(0, 16);
}

/** Stable rule id: first 16 hex chars of sha256(hotelId:scope:index). */
async function ruleIdFor(hotelId: string, scope: string, index: number): Promise<string> {
	return (await sha256Hex(`${hotelId}:${scope}:${index}`)).slice(0, 16);
}

export async function buildRoomStatements(
	db: D1Database,
	{ hotelId, record, now }: BuildRoomStatementsInput,
): Promise<D1PreparedStatement[]> {
	const statements: D1PreparedStatement[] = [];

	const roomIds: Array<{ room: ParsedRoom; id: string }> = [];
	for (const room of record.rooms) {
		roomIds.push({ room, id: await roomIdFor(hotelId, room.name) });
	}

	// 1. Sheet rooms that are no longer in the sheet. Room-level rules cascade.
	statements.push(
		db
			.prepare(
				"DELETE FROM rooms WHERE hotel_id = ? AND source = 'sheet' AND id NOT IN (SELECT value FROM json_each(?))",
			)
			.bind(hotelId, JSON.stringify(roomIds.map((r) => r.id))),
	);

	// 2. Upsert the sheet rooms. A room keeps its id; position is the sheet order.
	roomIds.forEach(({ room, id }, position) => {
		statements.push(
			db
				.prepare(
					`INSERT INTO rooms
					   (id, hotel_id, name, name_search, bed_type, size_m2, view, max_guests, description, base_price, source, sheet_room_id, position)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sheet', NULL, ?)
					 ON CONFLICT(id) DO UPDATE SET
					   name = excluded.name,
					   name_search = excluded.name_search,
					   bed_type = excluded.bed_type,
					   size_m2 = excluded.size_m2,
					   view = excluded.view,
					   max_guests = excluded.max_guests,
					   description = excluded.description,
					   base_price = excluded.base_price,
					   source = excluded.source,
					   position = excluded.position
					 WHERE rooms.source = 'sheet'`,
				)
				.bind(
					id,
					hotelId,
					room.name,
					foldText(room.name),
					room.bedType ?? null,
					room.sizeM2 ?? null,
					room.view ?? null,
					room.maxGuests ?? null,
					room.description ?? null,
					room.basePrice,
					position,
				),
		);
	});

	// 3. Booking rules: all of the hotel's rules are replaced, so a re-run is idempotent.
	statements.push(db.prepare("DELETE FROM booking_rules WHERE hotel_id = ?").bind(hotelId));

	const ruleRows: Array<{ id: string; roomId: string | null; text: string }> = [];
	for (let i = 0; i < record.hotelRules.length; i++) {
		ruleRows.push({
			id: await ruleIdFor(hotelId, "hotel", i),
			roomId: null,
			text: record.hotelRules[i],
		});
	}
	for (const { room, id: roomId } of roomIds) {
		for (let i = 0; i < room.rules.length; i++) {
			ruleRows.push({
				id: await ruleIdFor(hotelId, roomId, i),
				roomId,
				text: room.rules[i],
			});
		}
	}

	for (const rule of ruleRows) {
		statements.push(
			db
				.prepare(
					`INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, status, synced_at)
					 VALUES (?, ?, ?, ?, 'review', ?)`,
				)
				.bind(rule.id, hotelId, rule.roomId, rule.text, now),
		);
	}

	return statements;
}
