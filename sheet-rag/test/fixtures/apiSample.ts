/**
 * Shared sample data for the hotel API tests (STORY-15).
 *
 * Usage: create a fresh database, run `applyMigrations()` first, then call
 * `seedApiSample()` once. The values are fixed so tests can hard-code expectations.
 *
 * `seedApiSample` is meant to run ONCE per fresh database. It only INSERTs, so a
 * second call on the same database fails with a UNIQUE constraint error (for example
 * on `cities.slug`). Do not call it twice; create a new database instead.
 *
 * This file is test-only and has no Cloudflare dependency. Pass the fake D1 cast
 * to `D1Database`, as in the other unit tests.
 */

/** Base price of room "Deluxe" at Mộng Hotel (h1). Final price with 10 percent fee: 1375000. */
export const BASE_PRICE_DELUXE = 1250000;

/** Base price of room "Superior" at Sao Hà Nội (h2). Final price with 10 percent fee: 1078000. */
export const BASE_PRICE_SAO = 980000;

const BASE_PRICE_MONG_REVIEW = 555000;
const BASE_PRICE_MONG_HIDDEN = 444000;

/**
 * Every base price inserted by this fixture, as plain digits and with thousands
 * separators. Tests use it to assert that no base price appears in a response.
 */
export const SAMPLE_BASE_PRICE_STRINGS: string[] = [
	"1250000",
	"980000",
	"1,250,000",
	"980,000",
	String(BASE_PRICE_MONG_REVIEW),
	"555,000",
	String(BASE_PRICE_MONG_HIDDEN),
	"444,000",
];

const SYNCED_AT = "2026-11-18T03:00:00Z";
const SOURCE_FILE = "sample-file";

/** The D1 binding type (global from worker-configuration.d.ts). Type-only, so no runtime import. */
type Db = D1Database;

async function run(db: Db, statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
	const prepared = statements.map((s) => db.prepare(s.sql).bind(...s.params));
	await db.batch(prepared);
}

/**
 * Inserts the sample data. Caller must have applied the migrations first.
 * Runs as one batch, so a failure leaves no partial data. Meant to run once per
 * fresh database (see the file comment).
 */
export async function seedApiSample(db: Db): Promise<void> {
	const hotel = (
		id: string,
		slug: string,
		city: string,
		name: string,
		nameSearch: string,
		stars: number | null,
		status: string,
		extra: { descVi?: string; descEn?: string; address?: string } = {},
	) => ({
		sql: `INSERT INTO hotels (id, slug, city_slug, name, name_search, stars, address, description_vi, description_en, status, source_file_id, source_gid, source_hash, synced_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params: [
			id,
			slug,
			city,
			name,
			nameSearch,
			stars,
			extra.address ?? null,
			extra.descVi ?? null,
			extra.descEn ?? null,
			status,
			SOURCE_FILE,
			id,
			`hash-${id}`,
			SYNCED_AT,
		],
	});

	const room = (id: string, hotelId: string, name: string, base: number | null, position: number) => ({
		sql: `INSERT INTO rooms (id, hotel_id, name, name_search, base_price, source, position) VALUES (?, ?, ?, ?, ?, 'sheet', ?)`,
		params: [id, hotelId, name, name.toLowerCase(), base, position],
	});

	await run(db, [
		// Cities
		{
			sql: "INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)",
			params: ["da-nang", "Đà Nẵng", "Da Nang"],
		},
		{
			sql: "INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)",
			params: ["ha-noi", "Hà Nội", null],
		},
		{
			sql: "INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)",
			params: ["hue", "Huế", "Hue"],
		},

		// Facility vocabulary
		{
			sql: "INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, 'facility', ?, ?)",
			params: ["pool", "Hồ bơi", "Swimming pool"],
		},
		{
			sql: "INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, 'facility', ?, ?)",
			params: ["parking", "Chỗ đậu xe", "Parking"],
		},
		{
			sql: "INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, 'facility', ?, ?)",
			params: ["elevator", "Thang máy", "Elevator"],
		},

		// Hotels
		hotel("h1", "mong-hotel", "da-nang", "Mộng Hotel", "mong hotel", 4, "published", {
			descVi: "Khách sạn gần biển tại Đà Nẵng.",
			descEn: "A hotel near the beach in Da Nang.",
			address: "1 Đường Biển, Đà Nẵng",
		}),
		hotel("h2", "sao-hotel", "ha-noi", "Sao Hà Nội", "sao ha noi", 3, "published"),
		hotel("h3", "dong-do-hotel", "da-nang", "Đông Đô", "dong do", 5, "published"),
		hotel("h4", "mong-review", "da-nang", "Mộng Review", "mong review", null, "review"),
		hotel("h5", "mong-hidden", "hue", "Mộng Hidden", "mong hidden", null, "hidden"),

		// Facilities
		{
			sql: "INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('h1', 'pool', 'sheet', 1)",
			params: [],
		},
		{
			sql: "INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('h1', 'parking', 'sheet', 0)",
			params: [],
		},
		{
			sql: "INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('h2', 'parking', 'sheet', 1)",
			params: [],
		},
		{
			sql: "INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('h3', 'pool', 'sheet', 1)",
			params: [],
		},
		{
			sql: "INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('h3', 'elevator', 'sheet', 1)",
			params: [],
		},

		// Images for h1
		{
			sql: "INSERT INTO hotel_images (hotel_id, url, position, alt_vi) VALUES ('h1', 'https://example.test/mong-0.jpg', 0, 'Sảnh khách sạn')",
			params: [],
		},
		{
			sql: "INSERT INTO hotel_images (hotel_id, url, position, alt_vi) VALUES ('h1', 'https://example.test/mong-1.jpg', 1, NULL)",
			params: [],
		},

		// Rooms
		room("r1", "h1", "Deluxe", BASE_PRICE_DELUXE, 0),
		room("r2", "h1", "Standard", null, 1),
		room("r3", "h2", "Superior", BASE_PRICE_SAO, 0),
		room("r4", "h4", "Deluxe", BASE_PRICE_MONG_REVIEW, 0),
		room("r5", "h5", "Deluxe", BASE_PRICE_MONG_HIDDEN, 0),

		// Booking rules
		{
			sql: `INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, checkin_time, checkout_time, status, synced_at)
				VALUES ('rule-h1', 'h1', NULL, ?, '14:00', '12:00', 'confirmed', '2026-11-17T02:00:00Z')`,
			params: ["Nhận phòng 14:00\n  Trả phòng 12:00 (có dấu cách thừa) "],
		},
		{
			sql: `INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, cancellation, status, synced_at)
				VALUES ('rule-r1', 'h1', 'r1', ?, ?, 'confirmed', '2026-11-16T02:00:00Z')`,
			params: ["Hủy phòng trước 3 ngày, phí 50%", "Hủy trước 3 ngày, phí 50%"],
		},
	]);
}

/**
 * Adds `n` published hotels `bulk-1` .. `bulk-n` in `ha-noi` (3 stars, no rooms), for paging
 * tests. Ids collide with an earlier call, so call it at most once per fresh database.
 */
export async function seedManyPublished(db: Db, n: number): Promise<void> {
	const statements = [];
	for (let i = 1; i <= n; i++) {
		statements.push({
			sql: `INSERT INTO hotels (id, slug, city_slug, name, name_search, stars, status, source_file_id, source_gid, source_hash, synced_at)
				VALUES (?, ?, 'ha-noi', ?, ?, 3, 'published', ?, ?, ?, ?)`,
			params: [
				`bulk-${i}`,
				`bulk-${i}`,
				`Bulk ${i}`,
				`bulk ${i}`,
				SOURCE_FILE,
				`bulk-${i}`,
				`hash-bulk-${i}`,
				SYNCED_AT,
			],
		});
	}
	await run(db, statements);
}
