// Accent-insensitive text folding for search. Shared by the search code and
// the sync story that fills the `name_search` column. This module imports
// nothing outside src/domain/.

const COMBINING_MARKS = /\p{M}/gu;
const NON_ALNUM = /[^a-z0-9]+/g;

/**
 * Lower case, strip diacritics, map đ/Đ to d, turn every character that is
 * not a-z or 0-9 into a space, collapse space runs and trim.
 */
export function foldText(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(COMBINING_MARKS, "")
		.replace(/đ/g, "d")
		.replace(NON_ALNUM, " ")
		.trim();
}

/** Folded words of the input, empties removed, at most `max` of them. */
export function searchTokens(input: string, max: number = 6): string[] {
	return foldText(input)
		.split(" ")
		.filter((token) => token.length > 0)
		.slice(0, max);
}

/** Escape LIKE wildcards and the escape character itself (query uses ESCAPE '\'). */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Pattern for a prefix match: `${escaped}%`. */
export function likePrefixPattern(folded: string): string {
	return `${escapeLike(folded)}%`;
}

/** Pattern for a substring match: `%${escaped}%`. */
export function likeContainsPattern(token: string): string {
	return `%${escapeLike(token)}%`;
}
