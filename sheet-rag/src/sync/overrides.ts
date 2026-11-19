// Override re-application and the data version bump for the Google Sheets sync (STORY-14, TASK-52).
//
// An override is an owner edit stored in the `overrides` table. After the sheet writes of a
// sync run, these statements put every whitelisted override back on top of the sheet value.
//
// Only fixed SQL is built here. The table, column and field names come from the WHITELIST
// below, never from the data in the `overrides` table. Rows outside the whitelist are ignored.
// Every statement is idempotent: running the same batch twice leaves the same table contents.

type Rule = {
	/** Table whose row the override changes. */
	table: "hotels" | "rooms";
	/** Column to set (same name as the override field). */
	column: string;
	/** Override entity: 'hotel' (entity_id '') or 'room' (entity_id = room id). */
	entity: "hotel" | "room";
	/** Condition on the override value `o.value`; the override is skipped when false. */
	valid: string;
	/** Expression that gives the stored value from `o.value`. */
	value: string;
};

/** Digits only, non-empty. Anything else (letters, signs, decimals, spaces) does not cast. */
const DIGITS_ONLY = "o.value <> '' AND o.value NOT GLOB '*[^0-9]*'";
const ANY_TEXT = "1 = 1";
const TEXT = "o.value";
const INTEGER = "CAST(o.value AS INTEGER)";

/** The fixed whitelist of (entity, field) pairs that overrides may re-apply. */
const WHITELIST: Array<Rule & { field: string }> = [
	{ table: "hotels", entity: "hotel", field: "description_vi", column: "description_vi", valid: ANY_TEXT, value: TEXT },
	{ table: "hotels", entity: "hotel", field: "description_en", column: "description_en", valid: ANY_TEXT, value: TEXT },
	{ table: "hotels", entity: "hotel", field: "address", column: "address", valid: ANY_TEXT, value: TEXT },
	{ table: "hotels", entity: "hotel", field: "area", column: "area", valid: ANY_TEXT, value: TEXT },
	{
		table: "hotels",
		entity: "hotel",
		field: "stars",
		column: "stars",
		valid: `${DIGITS_ONLY} AND ${INTEGER} BETWEEN 1 AND 5`,
		value: INTEGER,
	},
	{
		table: "hotels",
		entity: "hotel",
		field: "status",
		column: "status",
		valid: "o.value IN ('review', 'published', 'hidden')",
		value: TEXT,
	},
	{ table: "rooms", entity: "room", field: "description", column: "description", valid: ANY_TEXT, value: TEXT },
	{
		table: "rooms",
		entity: "room",
		field: "base_price",
		column: "base_price",
		valid: `${DIGITS_ONLY} AND ${INTEGER} >= 0`,
		value: INTEGER,
	},
];

/**
 * Builds the UPDATE for one whitelisted pair. Bound parameters: ?1 = hotel id, ?2 = field name.
 * The EXISTS guard keeps the sheet value when there is no usable override, so an override
 * for a room that no longer exists changes nothing.
 */
function ruleSql(rule: Rule): string {
	const match =
		rule.entity === "hotel"
			? "o.hotel_id = ?1 AND o.entity = 'hotel' AND o.entity_id = ''"
			: "o.hotel_id = ?1 AND o.entity = 'room' AND o.entity_id = rooms.id";
	const target = rule.table === "hotels" ? "hotels.id = ?1" : "rooms.hotel_id = ?1";
	const condition = `${match} AND o.field = ?2 AND ${rule.valid}`;
	return (
		`UPDATE ${rule.table} SET ${rule.column} = (SELECT ${rule.value} FROM overrides o WHERE ${condition}) ` +
		`WHERE ${target} AND EXISTS (SELECT 1 FROM overrides o WHERE ${condition})`
	);
}

/**
 * Returns the statements that re-apply the overrides of one hotel. Run them in one batch
 * after the sheet writes of the hotel.
 */
export function buildOverrideStatements(db: D1Database, hotelId: string): D1PreparedStatement[] {
	return WHITELIST.map((rule) => db.prepare(ruleSql(rule)).bind(hotelId, rule.field));
}

/**
 * Returns the statement that increments settings.data_version as an integer. It creates the
 * setting at 1 when it is missing, and resets a non-numeric value to 1.
 */
export function buildDataVersionStatement(db: D1Database): D1PreparedStatement {
	return db.prepare(
		`INSERT INTO settings (key, value) VALUES ('data_version', '1')
		 ON CONFLICT(key) DO UPDATE SET value = CAST(
		   (CASE WHEN settings.value <> '' AND settings.value NOT GLOB '*[^0-9]*'
		         THEN CAST(settings.value AS INTEGER) ELSE 0 END) + 1 AS TEXT)`,
	);
}
