// Hotel name suggestions for the search box (technical-design.html section 3.4,
// STORY-15 AC12 and AC13). Takes the D1 binding as a parameter. Imports only src/domain/.
// The text is folded first; only the folded text is bound, as a LIKE prefix pattern.

import { foldText, likePrefixPattern } from "../domain/fold";

export interface SuggestRow {
	slug: string;
	name: string;
	city_slug: string;
	city_name_vi: string;
	city_name_en: string | null;
}

const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 8;

// Integer clamped to 1..10; anything not finite becomes the default of 8.
function clampLimit(value: number): number {
	const n = Math.floor(Number(value));
	if (!Number.isFinite(n)) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
}

/**
 * Published hotels whose folded name starts with the folded text, ordered by
 * name_search then slug. Text that folds to nothing (e.g. "%", "_", "***")
 * returns [] without a query.
 */
export async function suggestHotels(
	db: D1Database,
	rawText: string,
	limit: number,
): Promise<SuggestRow[]> {
	const folded = foldText(rawText);
	if (folded === "") return [];

	const { results } = await db
		.prepare(
			`SELECT h.slug, h.name, h.city_slug,
				c.name_vi AS city_name_vi, c.name_en AS city_name_en
			FROM hotels h
			JOIN cities c ON c.slug = h.city_slug
			WHERE h.status = 'published' AND h.name_search LIKE ? ESCAPE '\\'
			ORDER BY h.name_search ASC, h.slug ASC
			LIMIT ?`,
		)
		.bind(likePrefixPattern(folded), clampLimit(limit))
		.all<SuggestRow>();

	return results;
}
