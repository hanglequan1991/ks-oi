// Query parameter validation for the JSON API. Plain functions, no
// dependencies: each parser returns ok/value or a clear error that names the
// parameter. Nothing here touches the database.

import {
	DEFAULT_PAGE_SIZE,
	MAX_PAGE_SIZE,
	SUGGEST_DEFAULT_LIMIT,
	SUGGEST_MAX_CHARS,
	SUGGEST_MAX_LIMIT,
	type ParseResult,
} from "./types";

export interface ListParams {
	city?: string;
	q?: string;
	stars?: number[];
	facilities: string[];
	sort: "name" | "stars" | "price";
	page: number;
	limit: number;
	lang: "vi" | "en";
}

export interface SuggestParams {
	q: string;
	limit: number;
	lang: "vi" | "en";
}

const LIST_Q_MAX_CHARS = 100;
const CITY_RE = /^[a-z0-9-]{1,60}$/;
const FACILITY_RE = /^[a-z0-9_]{1,40}$/;
const FACILITY_MAX_COUNT = 10;
const STAR_RE = /^[1-5]$/;
const INT_RE = /^[0-9]+$/;
const PAGE_MAX = 10000;
const SORTS = ["name", "stars", "price"] as const;

function fail<T>(message: string, code = "invalid_param"): ParseResult<T> {
	return { ok: false, code, message };
}

/** Returns the raw value, or undefined when absent or empty. */
function optional(url: URLSearchParams, name: string): string | undefined {
	const v = url.get(name);
	return v === null || v === "" ? undefined : v;
}

/**
 * Parses a whole-number parameter. Returns undefined when it is not a plain
 * digit string (so "2.5", "-3", "abc" are all rejected).
 */
function wholeNumber(raw: string): number | undefined {
	if (!INT_RE.test(raw)) return undefined;
	return Number(raw);
}

export function parseLang(url: URLSearchParams): ParseResult<"vi" | "en"> {
	const raw = optional(url, "lang");
	if (raw === undefined || raw === "vi") return { ok: true, value: "vi" };
	if (raw === "en") return { ok: true, value: "en" };
	return fail("lang must be vi or en");
}

export function parseListParams(url: URLSearchParams): ParseResult<ListParams> {
	// city
	const city = optional(url, "city");
	if (city !== undefined && !CITY_RE.test(city)) {
		return fail("city must be 1 to 60 characters: a-z, 0-9 or hyphen");
	}

	// q: trimmed; empty after trim means absent
	let q: string | undefined;
	const rawQ = url.get("q")?.trim() ?? "";
	if (rawQ.length > LIST_Q_MAX_CHARS) {
		return fail(`q must be at most ${LIST_Q_MAX_CHARS} characters`);
	}
	if (rawQ !== "") q = rawQ;

	// stars: one value 1 to 5, or a comma-separated list
	let stars: number[] | undefined;
	const rawStars = optional(url, "stars");
	if (rawStars !== undefined) {
		const parts = rawStars.split(",");
		const list: number[] = [];
		for (const p of parts) {
			if (!STAR_RE.test(p)) {
				return fail("stars must be whole numbers from 1 to 5, for example stars=4,5");
			}
			const n = Number(p);
			if (!list.includes(n)) list.push(n);
		}
		stars = list;
	}

	// facility: repeatable and/or comma-separated; deduplicated; at most 10
	const facilities: string[] = [];
	for (const entry of url.getAll("facility")) {
		for (const p of entry.split(",")) {
			if (p === "") continue;
			if (!FACILITY_RE.test(p)) {
				return fail("facility must be 1 to 40 characters: a-z, 0-9 or underscore");
			}
			if (!facilities.includes(p)) facilities.push(p);
		}
	}
	if (facilities.length > FACILITY_MAX_COUNT) {
		return fail(`facility may have at most ${FACILITY_MAX_COUNT} values`);
	}

	// sort
	const rawSort = optional(url, "sort") ?? "name";
	if (!(SORTS as readonly string[]).includes(rawSort)) {
		return fail("sort must be name, stars or price");
	}

	// page
	let page = 1;
	const rawPage = optional(url, "page");
	if (rawPage !== undefined) {
		const n = wholeNumber(rawPage);
		if (n === undefined || n < 1 || n > PAGE_MAX) {
			return fail(`page must be a whole number from 1 to ${PAGE_MAX}`);
		}
		page = n;
	}

	// limit: above the maximum is limited (not rejected); below 1 is an error
	let limit = DEFAULT_PAGE_SIZE;
	const rawLimit = optional(url, "limit");
	if (rawLimit !== undefined) {
		const n = wholeNumber(rawLimit);
		if (n === undefined || n < 1) {
			return fail(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
		}
		limit = Math.min(n, MAX_PAGE_SIZE);
	}

	// lang
	const lang = parseLang(url);
	if (!lang.ok) return lang;

	const value: ListParams = {
		facilities,
		sort: rawSort as ListParams["sort"],
		page,
		limit,
		lang: lang.value,
	};
	if (city !== undefined) value.city = city;
	if (q !== undefined) value.q = q;
	if (stars !== undefined) value.stars = stars;
	return { ok: true, value };
}

export function parseSuggestParams(url: URLSearchParams): ParseResult<SuggestParams> {
	// q: required; trimmed length 1 to 60. Search-syntax characters are not
	// rejected here; the query layer neutralises them with foldText.
	const q = (url.get("q") ?? "").trim();
	if (q.length === 0 || q.length > SUGGEST_MAX_CHARS) {
		return fail(
			`q is required and must be 1 to ${SUGGEST_MAX_CHARS} characters`,
			"invalid_q",
		);
	}

	// limit: default 8; 1 to 10, anything else is an error
	let limit = SUGGEST_DEFAULT_LIMIT;
	const rawLimit = optional(url, "limit");
	if (rawLimit !== undefined) {
		const n = wholeNumber(rawLimit);
		if (n === undefined || n < 1 || n > SUGGEST_MAX_LIMIT) {
			return fail(`limit must be a whole number from 1 to ${SUGGEST_MAX_LIMIT}`);
		}
		limit = n;
	}

	const lang = parseLang(url);
	if (!lang.ok) return lang;

	return { ok: true, value: { q, limit, lang: lang.value } };
}
