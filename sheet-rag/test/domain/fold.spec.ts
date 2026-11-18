import { describe, it, expect } from "vitest";
import {
	foldText,
	searchTokens,
	likePrefixPattern,
	likeContainsPattern,
} from "../../src/domain/fold";

describe("foldText", () => {
	it("foldText removes accents, maps d with stroke and normalises spaces", () => {
		expect(foldText("Mộng Hotel")).toBe("mong hotel");
		expect(foldText("Đà Nẵng")).toBe("da nang");
		expect(foldText("  ĐÔNG   đô ")).toBe("dong do");
		expect(foldText("MỘNG HOTEL")).toBe(foldText("mộng hotel"));
		expect(foldText("mong hotel")).toBe("mong hotel");
	});

	it("foldText strips search-syntax and control characters", () => {
		const out = foldText("a%b_c\"d*e(f)\\g'h;--");
		for (const ch of ['%', '_', '"', '*', '(', ')', '\\', "'", ';', '-']) {
			expect(out).not.toContain(ch);
		}
		expect(out).toBe("a b c d e f g h");
		expect(foldText("%_\"*()\\';--")).toBe("");
		expect(foldText("hello 😀 world")).toBe("hello world");
		expect(foldText("a\u0007b\u0000c")).toBe("a b c");
	});
});

describe("searchTokens", () => {
	it("searchTokens splits, drops empties and caps at 6", () => {
		expect(searchTokens("  Mộng   Hotel ")).toEqual(["mong", "hotel"]);
		expect(searchTokens("")).toEqual([]);
		expect(searchTokens("one two three four five six seven eight")).toEqual([
			"one", "two", "three", "four", "five", "six",
		]);
		expect(searchTokens("a b c d", 2)).toEqual(["a", "b"]);
	});
});

describe("like patterns", () => {
	it("like patterns escape percent, underscore and backslash", () => {
		expect(likePrefixPattern("mo%ng")).toBe("mo\\%ng%");
		expect(likePrefixPattern("a_b")).toBe("a\\_b%");
		expect(likePrefixPattern("a\\b")).toBe("a\\\\b%");
		expect(likePrefixPattern("x%y_z\\w")).toBe("x\\%y\\_z\\\\w%");
		expect(likeContainsPattern("mong")).toBe("%mong%");
		expect(likeContainsPattern("m%o")).toBe("%m\\%o%");
		expect(likeContainsPattern("m_o\\")).toBe("%m\\_o\\\\%");

		// No unescaped % except the leading and trailing wildcards.
		const unescapedPercent = (s: string) => s.replace(/\\./g, "").match(/%/g)?.length ?? 0;
		expect(unescapedPercent(likePrefixPattern("%%%"))).toBe(1);
		expect(unescapedPercent(likeContainsPattern("%%%"))).toBe(2);
	});
});
