import { describe, it, expect } from "vitest";
import {
	DEFAULT_FEE_PERCENT,
	finalPrice,
	parseFeePercent,
	parseBoolSetting,
} from "../../src/domain/pricing";

describe("pricing", () => {
	it("finalPrice adds 10 percent and rounds to the nearest 1000", () => {
		// AC-P1
		expect(finalPrice(1_250_000, 10)).toBe(1_375_000);
		expect(finalPrice(1_234_000, 10)).toBe(1_357_000); // 1,357,400 rounds down
		expect(finalPrice(1_235_000, 10)).toBe(1_359_000); // 1,358,500 rounds up
	});

	it("finalPrice with zero fee returns the base rounded", () => {
		// AC-P1
		expect(finalPrice(1_000_000, 0)).toBe(1_000_000);
		expect(finalPrice(1_000_400, 0)).toBe(1_000_000);
	});

	it("finalPrice clamps fee to 0..100", () => {
		// AC-P2
		expect(finalPrice(1_000_000, 150)).toBe(finalPrice(1_000_000, 100));
		expect(finalPrice(1_000_000, 150)).toBe(2_000_000);
		expect(finalPrice(1_000_000, -20)).toBe(finalPrice(1_000_000, 0));
		expect(finalPrice(1_000_000, -20)).toBe(1_000_000);
	});

	it("parseFeePercent parses and clamps numeric strings", () => {
		// AC-P3
		expect(DEFAULT_FEE_PERCENT).toBe(10);
		expect(parseFeePercent("10")).toEqual({ percent: 10 });
		expect(parseFeePercent("12.5")).toEqual({ percent: 12.5 });
		expect(parseFeePercent(" 15 ")).toEqual({ percent: 15 });
		expect(parseFeePercent("150")).toEqual({ percent: 100 });
		expect(parseFeePercent("-5")).toEqual({ percent: 0 });
	});

	it("parseFeePercent falls back to 10 with a warning on bad input", () => {
		// AC-P4
		for (const raw of ["abc", "", null, undefined]) {
			const result = parseFeePercent(raw);
			expect(result.percent).toBe(10);
			expect(typeof result.warning).toBe("string");
			expect(result.warning!.length).toBeGreaterThan(0);
		}
	});

	it("parseBoolSetting accepts true/false variants and uses the fallback otherwise", () => {
		// AC-P5
		for (const raw of ["true", "TRUE", " true ", "1"]) {
			expect(parseBoolSetting(raw, false)).toBe(true);
		}
		for (const raw of ["false", "0", " FALSE "]) {
			expect(parseBoolSetting(raw, true)).toBe(false);
		}
		for (const raw of ["maybe", "", null, undefined]) {
			expect(parseBoolSetting(raw, true)).toBe(true);
			expect(parseBoolSetting(raw, false)).toBe(false);
		}
	});
});
