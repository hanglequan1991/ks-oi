// Pure money and limits helpers (technical-design.html section 18.6).
// Imported by the browser bundle and by tests. No I/O, no imports.
// Whole-number arithmetic with hard upper bounds.

export const MAX_ROWS = 30;
export const MAX_NIGHTS = 365;
export const MIN_NIGHTS = 1;
export const MAX_NOTE = 500;
export const MAX_PRICE = 1_000_000_000;
export const MAX_PRICE_DIGITS = 10;

const MAX_NIGHT_DIGITS = 3;

function digitsOnly(input: string): string {
	return String(input ?? "").replace(/\D/g, "");
}

/** Digits only, first 10 digits, capped at MAX_PRICE. No digits -> null. */
export function parseVnd(input: string): number | null {
	const digits = digitsOnly(input).slice(0, MAX_PRICE_DIGITS);
	if (digits === "") return null;
	return Math.min(Number(digits), MAX_PRICE);
}

/** Whole number, groups of three digits joined by `sep`. Negative or non-finite -> "0". */
export function formatVnd(n: number, sep = "."): string {
	if (!Number.isFinite(n) || n < 0) return "0";
	const whole = String(Math.trunc(n));
	return whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Truncate, NaN -> 0, range 0..MAX_NIGHTS. */
export function clampNights(n: number): number {
	if (Number.isNaN(n)) return 0;
	return Math.min(MAX_NIGHTS, Math.max(0, Math.trunc(n)));
}

/** Digits only, first 3 digits, clamped to MIN_NIGHTS..MAX_NIGHTS. No digits -> null. */
export function parseNights(input: string): number | null {
	const digits = digitsOnly(input).slice(0, MAX_NIGHT_DIGITS);
	if (digits === "") return null;
	return Math.min(MAX_NIGHTS, Math.max(MIN_NIGHTS, Number(digits)));
}

/** Price as a whole number within 0..MAX_PRICE. NaN -> 0. */
function clampPrice(price: number): number {
	if (Number.isNaN(price)) return 0;
	return Math.min(MAX_PRICE, Math.max(0, Math.trunc(price)));
}

export function lineTotal(nights: number, price: number): number {
	return clampNights(nights) * clampPrice(price);
}

export function grandTotal(rows: { nights: number; price: number }[]): number {
	let total = 0;
	for (const row of rows) {
		total += lineTotal(row.nights, row.price);
	}
	return total;
}
