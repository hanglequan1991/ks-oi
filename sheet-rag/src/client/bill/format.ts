// Display helpers for the bill page (technical-design.html sections 3.3 and 3.4).
// Pure functions, no DOM. Must not import src/web/i18n; the template filler lives here.
// Uses only src/domain/money for number parsing and formatting.

import { parseVnd, formatVnd, parseNights } from "../../domain/money";

export type Lang = "vi" | "en";

export const separatorFor = (lang: Lang): string => (lang === "en" ? "," : ".");

/** Number of digits in s[0:index]. */
function digitsBefore(s: string, index: number): number {
	let count = 0;
	for (let i = 0; i < index && i < s.length; i++) {
		if (s[i] >= "0" && s[i] <= "9") count++;
	}
	return count;
}

/** Index right after the k-th digit of s; 0 when k is 0; clamps to s.length. */
function indexAfterDigit(s: string, k: number): number {
	if (k <= 0) return 0;
	let count = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] >= "0" && s[i] <= "9") {
			count++;
			if (count === k) return i + 1;
		}
	}
	return s.length;
}

/**
 * Reformat a price input while typing. The caret keeps the same number of
 * digits to its left. Value is capped by parseVnd (10 digits, MAX_PRICE).
 */
export function reformatPriceInput(
	raw: string,
	caret: number,
	lang: Lang,
): { text: string; caret: number; value: number | null } {
	const value = parseVnd(raw);
	const text = value === null ? "" : formatVnd(value, separatorFor(lang));
	const digitsLeft = digitsBefore(raw, caret);
	const newCaret = Math.min(indexAfterDigit(text, digitsLeft), text.length);
	return { text, caret: newCaret, value };
}

/** Total for display: null -> em dash, otherwise formatted with the language separator. */
export function totalLabel(total: number | null, lang: Lang): string {
	if (total === null) return "—";
	return formatVnd(total, separatorFor(lang));
}

/** Price for display: null -> empty string, otherwise formatted with the language separator. */
export function priceLabel(price: number | null, lang: Lang): string {
	if (price === null) return "";
	return formatVnd(price, separatorFor(lang));
}

/**
 * Replace {name} placeholders with values. Values are inserted literally
 * (no recursion, no `$` replacement patterns). Unknown placeholders stay as they are.
 */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{([A-Za-z_]\w*)\}/g, (match, name: string) =>
		Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
	);
}

/** vi: dd/mm/yyyy, en: yyyy-mm-dd. Uses local date parts. */
export function dateLabel(date: Date, lang: Lang): string {
	const yyyy = String(date.getFullYear()).padStart(4, "0");
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return lang === "en" ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
}

/**
 * Nights input: ASCII digits only, leading zeros removed, at most 3 digits read,
 * value clamped to 1..MAX_NIGHTS by parseNights. No digits -> text '' and null.
 */
export function nightsText(raw: string): { text: string; value: number | null } {
	const allDigits = String(raw ?? "").replace(/\D/g, "");
	if (allDigits === "") return { text: "", value: null };
	// Strip leading zeros first so "0012" reads as 12. An all-zero input becomes "0" -> parseNights gives 1.
	const significant = allDigits.replace(/^0+/, "") || "0";
	const value = parseNights(significant.slice(0, 3));
	return { text: value === null ? "" : String(value), value };
}
