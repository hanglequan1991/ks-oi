import { describe, it, expect } from "vitest";
import {
	parseListParams,
	parseSuggestParams,
	parseLang,
} from "../../../src/web/api/params";
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../../../src/web/api/types";

const qs = (init: string) => new URLSearchParams(init);

function expectInvalid(
	result: { ok: boolean; code?: string; message?: string },
	name: string,
) {
	expect(result.ok).toBe(false);
	expect(result.code).toBe("invalid_param");
	expect(result.message).toContain(name);
}

describe("list params", () => {
	it("oversized page size is limited to 50", () => {
		expect(MAX_PAGE_SIZE).toBe(50);
		expect(DEFAULT_PAGE_SIZE).toBe(20);
		const r = parseListParams(qs("limit=500"));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.limit).toBe(50);
		const exact = parseListParams(qs("limit=50"));
		expect(exact.ok && exact.value.limit).toBe(50);
		const missing = parseListParams(qs(""));
		expect(missing.ok && missing.value.limit).toBe(20);
	});

	it("invalid limit values are rejected naming limit", () => {
		for (const v of ["abc", "0", "-3", "2.5"]) {
			expectInvalid(parseListParams(qs(`limit=${v}`)), "limit");
		}
	});

	it("invalid stars, city, facility, sort, page, lang and long q are rejected", () => {
		for (const v of ["6", "0", "x", "4,x"]) {
			expectInvalid(parseListParams(qs(`stars=${v}`)), "stars");
		}
		for (const v of ["Da Nang", "a;b"]) {
			expectInvalid(parseListParams(new URLSearchParams([["city", v]])), "city");
		}
		expectInvalid(parseListParams(new URLSearchParams([["facility", "Pool!"]])), "facility");
		const eleven = Array.from({ length: 11 }, (_, i) => ["facility", `f${i}`] as [string, string]);
		expectInvalid(parseListParams(new URLSearchParams(eleven)), "facility");
		expectInvalid(parseListParams(qs("sort=price_desc")), "sort");
		for (const v of ["0", "abc"]) {
			expectInvalid(parseListParams(qs(`page=${v}`)), "page");
		}
		expectInvalid(parseListParams(qs("lang=fr")), "lang");
		expectInvalid(parseListParams(new URLSearchParams([["q", "a".repeat(101)]])), "q");
	});

	it("valid filters are parsed and deduplicated", () => {
		const r = parseListParams(
			new URLSearchParams([
				["city", "da-nang"],
				["stars", "4,5"],
				["facility", "pool"],
				["facility", "parking"],
				["facility", "pool,gym"],
				["q", "  beach hotel  "],
				["sort", "price"],
				["page", "3"],
				["lang", "en"],
			]),
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.city).toBe("da-nang");
		expect(r.value.stars).toEqual([4, 5]);
		expect(r.value.facilities).toEqual(["pool", "parking", "gym"]);
		expect(r.value.q).toBe("beach hotel");
		expect(r.value.sort).toBe("price");
		expect(r.value.page).toBe(3);
		expect(r.value.lang).toBe("en");
	});

	it("defaults when params are absent", () => {
		const r = parseListParams(qs(""));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.sort).toBe("name");
		expect(r.value.page).toBe(1);
		expect(r.value.lang).toBe("vi");
		expect(r.value.facilities).toEqual([]);
		expect(r.value.city).toBeUndefined();
		expect(r.value.q).toBeUndefined();
		expect(r.value.stars).toBeUndefined();
	});

	it("blank q is treated as absent", () => {
		const r = parseListParams(qs("q=%20%20"));
		expect(r.ok && r.value.q).toBeUndefined();
	});
});

describe("suggest params", () => {
	it("suggest accepts limit 1 to 10 and defaults to 8", () => {
		const d = parseSuggestParams(qs("q=ha"));
		expect(d.ok && d.value.limit).toBe(8);
		expect(d.ok && d.value.q).toBe("ha");
		expect(d.ok && d.value.lang).toBe("vi");
		for (const v of ["1", "10"]) {
			const r = parseSuggestParams(qs(`q=ha&limit=${v}`));
			expect(r.ok && r.value.limit).toBe(Number(v));
		}
		for (const v of ["0", "11"]) {
			expectInvalid(parseSuggestParams(qs(`q=ha&limit=${v}`)), "limit");
		}
		expectInvalid(parseSuggestParams(qs("q=ha&limit=abc")), "limit");
	});

	it("suggest accepts q of 1 and 60 characters", () => {
		expect(parseSuggestParams(qs("q=a")).ok).toBe(true);
		expect(parseSuggestParams(qs(`q=${"a".repeat(60)}`)).ok).toBe(true);
	});

	it("suggest rejects empty, blank and over-long text", () => {
		const cases = [
			qs(""),
			qs("q="),
			qs("q=%20%20%20"),
			qs(`q=${"a".repeat(61)}`),
		];
		for (const c of cases) {
			const r = parseSuggestParams(c);
			expect(r.ok).toBe(false);
			expect(r.ok === false && r.code).toBe("invalid_q");
		}
	});

	it("suggest passes search-syntax characters through without throwing", () => {
		const raw = 'a"b*c%d(e)f';
		let r: ReturnType<typeof parseSuggestParams> | undefined;
		expect(() => {
			r = parseSuggestParams(new URLSearchParams([["q", raw]]));
		}).not.toThrow();
		expect(r?.ok).toBe(true);
		if (r?.ok) expect(r.value.q).toBe(raw);
	});
});

describe("parseLang", () => {
	it("accepts vi and en, defaults to vi, rejects others", () => {
		expect(parseLang(qs("")))
			.toEqual({ ok: true, value: "vi" });
		expect(parseLang(qs("lang=en"))).toEqual({ ok: true, value: "en" });
		expectInvalid(parseLang(qs("lang=fr")), "lang");
	});
});
