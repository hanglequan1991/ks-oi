// Page config for the bill page (technical design 18.5). Pure: no DOM, no network.
// The server writes the config as JSON into <script type="application/json" id="bill-config">.
// The page is untrusted input for the client, so every field is checked. Limits are
// never taken from the page: they always come from src/domain/money.ts.
// Imports only from src/domain/ (design 3.4).

import { MAX_ROWS, MAX_NIGHTS, MAX_NOTE } from "../../domain/money";

export interface BillConfig {
	lang: "vi" | "en";
	labels: Record<string, string>;
	maxRows: number;
	maxNights: number;
	maxNote: number;
}

/** Every label key the bill client reads. A missing key falls back to its own name. */
export const LABEL_KEYS: readonly string[] = [
	"colIndex",
	"colHotel",
	"colRoom",
	"colNight",
	"colPricing",
	"colTotal",
	"rowLabel",
	"hotelPlaceholder",
	"roomPlaceholder",
	"pricePlaceholder",
	"listboxHotel",
	"listboxRoom",
	"hotelAria",
	"roomAria",
	"nightAria",
	"priceAria",
	"noteAria",
	"removeRowAria",
	"removeRow",
	"addRowLimit",
	"edited",
	"useDefault",
	"noteLabel",
	"notePlaceholder",
	"draftRestored",
	"draftSaved",
	"clearConfirm",
	"grandTotal",
	"comboHint",
];

const MAX_CONFIG_CHARS = 65536;
const MAX_LABEL_CHARS = 500;
const MAX_LABEL_KEYS = 300;

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cut(s: string, max: number): string {
	return Array.from(s).slice(0, max).join("");
}

/**
 * Parses the page config. Returns null for missing, invalid or oversized input;
 * never throws. Labels: only string values are kept, long values are cut, and
 * every LABEL_KEYS entry is present (its own name when the page does not give it).
 */
export function parseBillConfig(text: string | null | undefined): BillConfig | null {
	if (typeof text !== "string" || text === "" || text.length > MAX_CONFIG_CHARS) {
		return null;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isPlainObject(raw)) return null;
	const lang = raw.lang;
	if (lang !== "vi" && lang !== "en") return null;
	if (!isPlainObject(raw.labels)) return null;

	const labels: Record<string, string> = {};
	for (const key of LABEL_KEYS) labels[key] = key;

	const source = raw.labels;
	const keys = Object.keys(source).slice(0, MAX_LABEL_KEYS);
	for (const key of keys) {
		// Plain assignment of "__proto__" would change the prototype.
		if (key === "__proto__") continue;
		const value = source[key];
		if (typeof value === "string") labels[key] = cut(value, MAX_LABEL_CHARS);
	}

	return {
		lang,
		labels,
		maxRows: MAX_ROWS,
		maxNights: MAX_NIGHTS,
		maxNote: MAX_NOTE,
	};
}
