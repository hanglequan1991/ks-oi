// Published hotel list query (technical-design.html section 3.4, STORY-15 AC1 and AC2).
// Takes the D1 binding as a parameter. Imports only src/domain/. Every value
// from the caller is a bound parameter; the only text built into SQL is fixed.

import { likeContainsPattern, searchTokens } from "../domain/fold";
import type { HotelListRow } from "../domain/hotelView";

export interface HotelListQuery {
	city?: string;
	q?: string;
	stars?: number[];
	facilities: string[];
	sort: "name" | "stars" | "price";
	page: number;
	limit: number;
}

const MAX_LIMIT = 50;

// Fixed ORDER BY clauses, one per sort key. Ties end on slug (unique), so paging is stable.
const ORDER_BY: Record<HotelListQuery["sort"], string> = {
	name: "h.name_search ASC, h.slug ASC",
	stars: "h.stars DESC NULLS LAST, h.name_search ASC, h.slug ASC",
	price: "min_base_price ASC NULLS LAST, h.name_search ASC, h.slug ASC",
};

// Integer of at least `min`; anything not finite becomes `min`.
function intAtLeast(value: number, min: number): number {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) ? Math.max(min, n) : min;
}

interface Where {
	sql: string;
	params: unknown[];
}

// Filters shared by the list query and the count query. Always requires published.
function buildWhere(query: HotelListQuery): Where {
	const clauses: string[] = ["h.status = 'published'"];
	const params: unknown[] = [];

	if (query.city) {
		clauses.push("h.city_slug = ?");
		params.push(query.city);
	}

	const stars = query.stars ?? [];
	if (stars.length > 0) {
		clauses.push(`h.stars IN (${stars.map(() => "?").join(", ")})`);
		params.push(...stars);
	}

	for (const code of query.facilities) {
		clauses.push(
			"EXISTS (SELECT 1 FROM hotel_facilities f WHERE f.hotel_id = h.id AND f.code = ?)",
		);
		params.push(code);
	}

	// A q that folds to no tokens is ignored. Every token must appear in name_search.
	const tokens = query.q ? searchTokens(query.q) : [];
	for (const token of tokens) {
		clauses.push("h.name_search LIKE ? ESCAPE '\\'");
		params.push(likeContainsPattern(token));
	}

	return { sql: clauses.join(" AND "), params };
}

/**
 * One page of published hotels, plus the total number of matching hotels.
 * `limit` is clamped to 1..50 and `page` to at least 1, even if the caller
 * skips validation.
 */
export async function listPublishedHotels(
	db: D1Database,
	query: HotelListQuery,
): Promise<{ rows: HotelListRow[]; total: number }> {
	const limit = Math.min(MAX_LIMIT, intAtLeast(query.limit, 1));
	const page = intAtLeast(query.page, 1);
	const offset = (page - 1) * limit;
	const orderBy = ORDER_BY[query.sort] ?? ORDER_BY.name;
	const where = buildWhere(query);

	const listSql = `
		SELECT h.slug, h.name, h.city_slug,
			c.name_vi AS city_name_vi, c.name_en AS city_name_en,
			h.stars, h.address, h.area,
			(SELECT MIN(r.base_price) FROM rooms r WHERE r.hotel_id = h.id) AS min_base_price,
			(SELECT i.url FROM hotel_images i WHERE i.hotel_id = h.id
				ORDER BY i.position ASC, i.url ASC LIMIT 1) AS image_url
		FROM hotels h
		JOIN cities c ON c.slug = h.city_slug
		WHERE ${where.sql}
		ORDER BY ${orderBy}
		LIMIT ? OFFSET ?`;

	const { results } = await db
		.prepare(listSql)
		.bind(...where.params, limit, offset)
		.all<HotelListRow>();

	const countRow = await db
		.prepare(`SELECT COUNT(*) AS n FROM hotels h WHERE ${where.sql}`)
		.bind(...where.params)
		.first<{ n: number }>();

	return { rows: results, total: Number(countRow?.n ?? 0) };
}
