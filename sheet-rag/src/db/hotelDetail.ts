// Published hotel detail query (technical-design.html section 3.4, STORY-15 AC4 and AC5).
// Takes the D1 binding as a parameter. Imports only src/domain/ types. The slug is
// always a bound parameter; the SQL text is fixed. One query per table, never per room.

import type { FacilityRow, HotelRow, ImageRow, RoomRow, RuleRow } from "../domain/hotelView";

export interface HotelDetailRows {
	hotel: HotelRow;
	rooms: RoomRow[];
	rules: RuleRow[];
	facilities: FacilityRow[];
	images: ImageRow[];
}

const HOTEL_SQL = `
	SELECT h.id, h.slug, h.name, h.city_slug,
		c.name_vi AS city_name_vi, c.name_en AS city_name_en,
		h.stars, h.address, h.area, h.lat, h.lng,
		h.description_vi, h.description_en, h.synced_at
	FROM hotels h
	JOIN cities c ON c.slug = h.city_slug
	WHERE h.slug = ? AND h.status = 'published'`;

// base_price is returned so the serializer can compute the final price. It is never sent to the client as is.
const ROOMS_SQL = `
	SELECT id, name, bed_type, size_m2, max_guests, view, description, base_price, position
	FROM rooms
	WHERE hotel_id = ?
	ORDER BY position, name`;

const RULES_SQL = `
	SELECT room_id, raw_text, synced_at
	FROM booking_rules
	WHERE hotel_id = ?
	ORDER BY synced_at DESC, id`;

const FACILITIES_SQL = `
	SELECT f.code, c.label_vi, c.label_en, f.confirmed
	FROM hotel_facilities f
	JOIN facility_catalog c ON c.code = f.code
	WHERE f.hotel_id = ?
	ORDER BY f.code`;

const IMAGES_SQL = `
	SELECT url, alt_vi, position
	FROM hotel_images
	WHERE hotel_id = ?
	ORDER BY position, url`;

/**
 * Everything the hotel detail page needs for one published hotel, or null when the
 * slug is unknown or the hotel is not published (review and hidden give null too).
 */
export async function getPublishedHotelDetail(
	db: D1Database,
	slug: string,
): Promise<HotelDetailRows | null> {
	const hotel = await db.prepare(HOTEL_SQL).bind(slug).first<HotelRow>();
	if (!hotel) return null;

	const [rooms, rules, facilities, images] = await db.batch<
		RoomRow | RuleRow | FacilityRow | ImageRow
	>([
		db.prepare(ROOMS_SQL).bind(hotel.id),
		db.prepare(RULES_SQL).bind(hotel.id),
		db.prepare(FACILITIES_SQL).bind(hotel.id),
		db.prepare(IMAGES_SQL).bind(hotel.id),
	]);

	return {
		hotel,
		rooms: rooms.results as RoomRow[],
		rules: rules.results as RuleRow[],
		facilities: facilities.results as FacilityRow[],
		images: images.results as ImageRow[],
	};
}
