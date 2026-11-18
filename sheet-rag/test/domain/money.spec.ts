import { describe, it, expect } from "vitest";
import {
	MAX_ROWS,
	MAX_NIGHTS,
	MIN_NIGHTS,
	MAX_NOTE,
	MAX_PRICE,
	MAX_PRICE_DIGITS,
	parseVnd,
	formatVnd,
	clampNights,
	parseNights,
	lineTotal,
	grandTotal,
} from "../../src/domain/money";

describe("money", () => {
	it("parseNights keeps digits only and stays within 1 to 365", () => {
		// AC19
		expect(parseNights("abc")).toBeNull();
		expect(parseNights("")).toBeNull();
		expect(parseNights("12a")).toBe(12);
		expect(parseNights("0")).toBe(1);
		expect(parseNights("999")).toBe(365);
		expect(parseNights("1000")).toBe(100);
		expect(parseNights("-5")).toBe(5);
		for (const raw of ["0", "1", "364", "365", "366", "999", "-1", "0000"]) {
			const n = parseNights(raw);
			expect(n).not.toBeNull();
			expect(n!).toBeGreaterThanOrEqual(MIN_NIGHTS);
			expect(n!).toBeLessThanOrEqual(MAX_NIGHTS);
		}
		expect(clampNights(-10)).toBeGreaterThanOrEqual(0);
		expect(clampNights(10_000)).toBe(365);
	});

	it("parseVnd accepts dots, commas and plain digits and caps length and value", () => {
		// AC20
		expect(parseVnd("1.375.000")).toBe(1375000);
		expect(parseVnd("1,375,000")).toBe(1375000);
		expect(parseVnd("1375000")).toBe(1375000);
		expect(parseVnd("abc")).toBeNull();
		expect(parseVnd("")).toBeNull();
		expect(parseVnd("0")).toBe(0);
		// 15 digits -> first 10 digits (1234567890) -> capped at MAX_PRICE
		expect(parseVnd("123456789012345")).toBe(MAX_PRICE);
		expect(parseVnd("1234567890")).toBe(MAX_PRICE);
		expect(parseVnd("123456789")).toBe(123456789);
		expect(parseVnd("  12 a3 ")).toBe(123);
		expect(parseVnd("-500")).toBe(500);
	});

	it("formatVnd groups thousands with the given separator", () => {
		// AC20
		expect(formatVnd(1375000)).toBe("1.375.000");
		expect(formatVnd(1375000, ",")).toBe("1,375,000");
		expect(formatVnd(0)).toBe("0");
		expect(formatVnd(999)).toBe("999");
		expect(formatVnd(1000)).toBe("1.000");
		expect(formatVnd(-5)).toBe("0");
		expect(formatVnd(NaN)).toBe("0");
		expect(formatVnd(Infinity)).toBe("0");
	});

	it("lineTotal multiplies and applies the limits", () => {
		// AC24
		expect(lineTotal(3, 1250000)).toBe(3750000);
		expect(lineTotal(0, 1250000)).toBe(0);
		expect(lineTotal(1000, 1000)).toBe(365 * 1000);
		expect(lineTotal(2, MAX_PRICE * 10)).toBe(2 * MAX_PRICE);
		expect(lineTotal(2, -100)).toBe(0);
		expect(lineTotal(2, NaN)).toBe(0);
	});

	it("grandTotal sums lines and the maximum stays a safe integer", () => {
		// AC25
		expect(grandTotal([{ nights: 2, price: 1000 }, { nights: 1, price: 500 }])).toBe(2500);
		expect(grandTotal([])).toBe(0);
		const rows = Array.from({ length: MAX_ROWS }, () => ({
			nights: MAX_NIGHTS,
			price: MAX_PRICE,
		}));
		const max = grandTotal(rows);
		expect(max).toBe(10_950_000_000_000);
		expect(Number.isSafeInteger(max)).toBe(true);
		expect(Number.isSafeInteger(MAX_ROWS * MAX_NIGHTS * MAX_PRICE)).toBe(true);
	});

	it("limit constants have the agreed values", () => {
		// AC5 (AC9, AC26, AC27)
		expect(MAX_ROWS).toBe(30);
		expect(MAX_NIGHTS).toBe(365);
		expect(MIN_NIGHTS).toBe(1);
		expect(MAX_NOTE).toBe(500);
		expect(MAX_PRICE).toBe(1_000_000_000);
		expect(MAX_PRICE_DIGITS).toBe(10);
	});
});
