import { describe, it, expect } from "vitest";
import { validateHotel } from "../../src/sync/validate";
import type { ParsedHotel, ParsedRoom } from "../../src/sync/record";

function room(overrides: Partial<ParsedRoom> = {}): ParsedRoom {
	return {
		name: "Deluxe Room",
		basePrice: 1200000,
		rules: [],
		...overrides,
	};
}

function hotel(overrides: Partial<ParsedHotel> = {}): ParsedHotel {
	return {
		stars: 4,
		address: "1 Le Loi",
		area: "Hai Chau",
		descriptionVi: "Khách sạn đẹp",
		descriptionEn: "A nice hotel",
		images: ["https://example.com/a.jpg"],
		facilities: ["pool"],
		rooms: [room()],
		hotelRules: ["No smoking"],
		...overrides,
	};
}

function codes(result: ReturnType<typeof validateHotel>): string[] {
	return result.ok ? [] : result.errors.map((e) => e.code);
}

describe("validateHotel", () => {
	it("valid record passes, null price allowed", () => {
		const result = validateHotel(hotel());
		expect(result.ok).toBe(true);

		const nullPrice = validateHotel(
			hotel({ rooms: [room({ basePrice: null })] }),
		);
		expect(nullPrice.ok).toBe(true);
	});

	it("price 0, negative, 1.5, NaN each give price_invalid", () => {
		for (const basePrice of [0, -5, 1.5, Number.NaN]) {
			const result = validateHotel(hotel({ rooms: [room({ basePrice })] }));
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].code).toBe("price_invalid");
			expect(result.errors[0].field).toBe("rooms[0].basePrice");
		}
	});

	it("stars 0 and 6 and 3.5 give stars_range, null passes", () => {
		for (const stars of [0, 6, 3.5]) {
			const result = validateHotel(hotel({ stars }));
			expect(result.ok).toBe(false);
			expect(codes(result)).toEqual(["stars_range"]);
		}
		expect(validateHotel(hotel({ stars: null })).ok).toBe(true);
		expect(validateHotel(hotel({ stars: 1 })).ok).toBe(true);
		expect(validateHotel(hotel({ stars: 5 })).ok).toBe(true);
	});

	it("http and garbage image urls give image_not_https", () => {
		for (const url of ["http://example.com/a.jpg", "not a url", ""]) {
			const result = validateHotel(hotel({ images: [url] }));
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].code).toBe("image_not_https");
			expect(result.errors[0].field).toBe("images[0]");
		}
	});

	it("duplicate room name (case and accent differences) gives room_duplicate", () => {
		const result = validateHotel(
			hotel({
				rooms: [
					room({ name: "Phòng Đôi" }),
					room({ name: "PHONG DOI" }),
				],
			}),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].code).toBe("room_duplicate");
		expect(result.errors[0].field).toBe("rooms[1].name");
	});

	it("room with empty name gives room_name_empty", () => {
		const result = validateHotel(hotel({ rooms: [room({ name: "   " })] }));
		expect(codes(result)).toEqual(["room_name_empty"]);
	});

	it("several errors are all reported in stable order", () => {
		const input = hotel({
			stars: 9,
			images: ["http://example.com/x.jpg", "https://example.com/ok.jpg", "junk"],
			rooms: [
				room({ name: "Suite", basePrice: -1 }),
				room({ name: "suite", basePrice: 10 }),
				room({ name: "", basePrice: 0 }),
			],
		});
		const first = validateHotel(input);
		const second = validateHotel(input);
		expect(first).toEqual(second);
		expect(first.ok).toBe(false);
		if (first.ok) return;
		expect(first.errors.map((e) => [e.code, e.field])).toEqual([
			["stars_range", "stars"],
			["image_not_https", "images[0]"],
			["image_not_https", "images[2]"],
			["price_invalid", "rooms[0].basePrice"],
			["room_duplicate", "rooms[1].name"],
			["room_name_empty", "rooms[2].name"],
			["price_invalid", "rooms[2].basePrice"],
		]);
	});

	it("missing description and facilities only warn", () => {
		const result = validateHotel(
			hotel({
				descriptionVi: null,
				descriptionEn: null,
				facilities: [],
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.warnings.map((w) => w.code)).toEqual([
			"description_missing",
			"facilities_missing",
		]);
	});

	it("warnings do not block a record with errors", () => {
		const result = validateHotel(
			hotel({ stars: 0, descriptionVi: null, descriptionEn: null, facilities: [] }),
		);
		expect(result.ok).toBe(false);
		expect(result.warnings.map((w) => w.code)).toEqual([
			"description_missing",
			"facilities_missing",
		]);
	});
});
