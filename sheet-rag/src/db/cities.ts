// Cities that have at least one published hotel (technical-design.html section 3.4,
// STORY-15 AC11). Takes the D1 binding as a parameter. Imports only src/domain/.
// The query has no caller-supplied values, so no bound parameters are needed.

import { foldText } from "../domain/fold";

export interface CityRow {
	slug: string;
	name_vi: string;
	name_en: string | null;
}

/**
 * Cities with at least one published hotel. Sorted by the accent-free form of
 * name_vi (so Đà Nẵng comes before Hà Nội, as in Vietnamese alphabetical order),
 * then by name_vi, then by slug. SQLite compares by code point, which would put
 * Đ after H, so the sort happens here.
 */
export async function listCitiesWithPublishedHotels(db: D1Database): Promise<CityRow[]> {
	const { results } = await db
		.prepare(
			`SELECT c.slug, c.name_vi, c.name_en
			FROM cities c
			WHERE EXISTS (
				SELECT 1 FROM hotels h
				WHERE h.city_slug = c.slug AND h.status = 'published'
			)`,
		)
		.all<CityRow>();

	return results.sort(
		(a, b) =>
			compare(foldText(a.name_vi), foldText(b.name_vi)) ||
			compare(a.name_vi, b.name_vi) ||
			compare(a.slug, b.slug),
	);
}

// Plain code-point comparison (no locale), so the order does not depend on the runtime.
function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
