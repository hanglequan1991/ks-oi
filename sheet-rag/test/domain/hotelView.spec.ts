import { describe, it, expect } from "vitest";
import {
	priceView,
	toHotelListItem,
	toHotelDetail,
	toCityItem,
	type HotelListRow,
	type HotelRow,
	type RoomRow,
	type RuleRow,
	type FacilityRow,
	type ImageRow,
	type PricingOpts,
} from "../../src/domain/hotelView";

const ON: PricingOpts = { feePercent: 10, showFeeNote: true };
const OFF: PricingOpts = { feePercent: 10, showFeeNote: false };
const DISCLAIMER = { disclaimerVi: "Giá tạm tính", disclaimerEn: "Indicative price" };

const BASE_A = 1_250_000;
const BASE_B = 980_000;

function collectKeys(value: unknown, out: string[] = []): string[] {
	if (Array.isArray(value)) {
		for (const v of value) collectKeys(v, out);
	} else if (value !== null && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			out.push(k);
			collectKeys(v, out);
		}
	}
	return out;
}

function collectNumbers(value: unknown, out: number[] = []): number[] {
	if (typeof value === "number") out.push(value);
	else if (Array.isArray(value)) for (const v of value) collectNumbers(v, out);
	else if (value !== null && typeof value === "object")
		for (const v of Object.values(value)) collectNumbers(v, out);
	return out;
}

const hotelRow: HotelRow = {
	id: "h1",
	slug: "hotel-one",
	name: "Hotel One",
	city_slug: "hanoi",
	city_name_vi: "Hà Nội",
	city_name_en: "Hanoi",
	stars: 4,
	address: "1 Some Street",
	area: "Old Quarter",
	lat: 21.03,
	lng: 105.85,
	description_vi: "Mô tả tiếng Việt",
	description_en: "English description",
	synced_at: "2026-11-01T10:00:00Z",
};

const rooms: RoomRow[] = [
	{
		id: "r1",
		name: "Deluxe",
		bed_type: "double",
		size_m2: 30,
		max_guests: 2,
		view: "city",
		description: "Nice room",
		base_price: BASE_A,
		position: 1,
	},
	{
		id: "r2",
		name: "Suite",
		bed_type: "king",
		size_m2: 60,
		max_guests: 3,
		view: null,
		description: null,
		base_price: BASE_B,
		position: 2,
	},
	{
		id: "r3",
		name: "Basic",
		bed_type: null,
		size_m2: null,
		max_guests: null,
		view: null,
		description: null,
		base_price: null,
		position: 3,
	},
];

const rules: RuleRow[] = [
	{ room_id: null, raw_text: "  Hotel rule\n\n", synced_at: "2026-11-02T08:00:00Z" },
	{ room_id: "r1", raw_text: "\tRoom one rule  \n", synced_at: "2026-11-03T08:00:00Z" },
];

const facilities: FacilityRow[] = [
	{ code: "wifi", label_vi: "Wifi", label_en: "Wi-Fi", confirmed: 1 },
	{ code: "pool", label_vi: "Hồ bơi", label_en: "", confirmed: 0 },
];

const images: ImageRow[] = [
	{ url: "https://img/2.jpg", alt_vi: "Ảnh 2", position: 2 },
	{ url: "https://img/1.jpg", alt_vi: null, position: 1 },
];

describe("hotelView", () => {
	it("priceView adds the fee and rounds to 1000", () => {
		// AC6
		const price = priceView(BASE_A, ON);
		expect(price).toEqual({
			amount: 1_375_000,
			currency: "VND",
			unit: "night",
			includesFeePercent: 10,
		});
	});

	it("priceView returns null for a missing price, never zero", () => {
		// AC8
		expect(priceView(null, ON)).toBeNull();
		expect(priceView(undefined, ON)).toBeNull();
		expect(priceView(null, OFF)).toBeNull();
	});

	it("serialized output never contains a base price key or value", () => {
		// AC7
		const listRow: HotelListRow = {
			slug: "hotel-one",
			name: "Hotel One",
			city_slug: "hanoi",
			city_name_vi: "Hà Nội",
			city_name_en: null,
			stars: 4,
			address: null,
			area: null,
			min_base_price: BASE_B,
			image_url: null,
		};
		const outputs: unknown[] = [
			toHotelListItem(listRow, "en", ON),
			toHotelDetail(
				{ hotel: hotelRow, rooms, rules, facilities, images },
				"en",
				{ ...ON, ...DISCLAIMER },
			),
			toCityItem({ slug: "hanoi", name_vi: "Hà Nội", name_en: "Hanoi" }, "en"),
		];
		const forbidden = ["base_price", "basePrice", "min_base_price", "base"];
		for (const out of outputs) {
			const keys = collectKeys(out);
			for (const key of forbidden) expect(keys).not.toContain(key);
			const numbers = collectNumbers(out);
			expect(numbers).not.toContain(BASE_A);
			expect(numbers).not.toContain(BASE_B);
			expect(JSON.stringify(out)).not.toMatch(/"base_?[pP]rice"|"base"\s*:/);
		}
	});

	it("fee outside 0 to 100 is clamped", () => {
		// AC9
		expect(priceView(BASE_A, { feePercent: 150, showFeeNote: false })?.amount).toBe(
			priceView(BASE_A, { feePercent: 100, showFeeNote: false })?.amount,
		);
		expect(priceView(BASE_A, { feePercent: -5, showFeeNote: false })?.amount).toBe(
			BASE_A,
		);
	});

	it("fee percentage appears only when the fee note is on", () => {
		// AC10
		const on = priceView(BASE_A, ON);
		const off = priceView(BASE_A, OFF);
		expect(on?.includesFeePercent).toBe(10);
		expect(off).not.toBeNull();
		expect("includesFeePercent" in (off as object)).toBe(false);
	});

	it("detail keeps rule text and sync dates unchanged at both levels", () => {
		// AC4
		const detail = toHotelDetail(
			{ hotel: hotelRow, rooms, rules, facilities, images },
			"vi",
			{ ...ON, ...DISCLAIMER },
		);
		expect(detail.bookingRules).toEqual({
			text: "  Hotel rule\n\n",
			syncedAt: "2026-11-02T08:00:00Z",
		});
		const r1 = detail.rooms.find((r) => r.id === "r1");
		expect(r1?.bookingRules).toEqual({
			text: "\tRoom one rule  \n",
			syncedAt: "2026-11-03T08:00:00Z",
		});
		const r2 = detail.rooms.find((r) => r.id === "r2");
		expect(r2?.bookingRules).toBeNull();
		expect(detail.dataUpdatedAt).toBe("2026-11-01T10:00:00Z");
		expect(detail.facilities).toEqual([
			{ code: "wifi", label: "Wifi", confirmed: true },
			{ code: "pool", label: "Hồ bơi", confirmed: false },
		]);
		expect(detail.images.map((i) => i.url)).toEqual([
			"https://img/2.jpg",
			"https://img/1.jpg",
		]);
		expect(detail.images[0].alt).toBe("Ảnh 2");
		expect(detail.rooms.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
		expect(detail.rooms[0].price?.amount).toBe(1_375_000);
		expect(detail.rooms[2].price).toBeNull();
	});

	it("english fields fall back to Vietnamese when missing", () => {
		// AC7
		const en = toHotelDetail(
			{ hotel: hotelRow, rooms, rules, facilities, images },
			"en",
			{ ...ON, ...DISCLAIMER },
		);
		expect(en.city.name).toBe("Hanoi");
		expect(en.description).toBe("English description");
		expect(en.facilities[0].label).toBe("Wi-Fi");
		expect(en.facilities[1].label).toBe("Hồ bơi");
		expect(en.disclaimer).toBe(DISCLAIMER.disclaimerEn);
		expect(en.name).toBe("Hotel One");

		const noEn = toHotelDetail(
			{
				hotel: { ...hotelRow, city_name_en: null, description_en: "" },
				rooms,
				rules,
				facilities,
				images,
			},
			"en",
			{ ...ON, ...DISCLAIMER },
		);
		expect(noEn.city.name).toBe("Hà Nội");
		expect(noEn.description).toBe("Mô tả tiếng Việt");

		const vi = toHotelDetail(
			{ hotel: hotelRow, rooms, rules, facilities, images },
			"vi",
			{ ...ON, ...DISCLAIMER },
		);
		expect(vi.disclaimer).toBe(DISCLAIMER.disclaimerVi);
		expect(vi.city.name).toBe("Hà Nội");
	});

	it("list item carries the lowest final price or null", () => {
		// AC1, AC2
		const base: HotelListRow = {
			slug: "hotel-one",
			name: "Hotel One",
			city_slug: "hanoi",
			city_name_vi: "Hà Nội",
			city_name_en: "Hanoi",
			stars: 4,
			address: "1 Some Street",
			area: "Old Quarter",
			min_base_price: BASE_A,
			image_url: "https://img/1.jpg",
		};
		const item = toHotelListItem(base, "en", ON);
		expect(item.price?.amount).toBe(1_375_000);
		expect(item.image).toBe("https://img/1.jpg");
		expect(item.city).toEqual({ slug: "hanoi", name: "Hanoi" });

		const none = toHotelListItem({ ...base, min_base_price: null }, "en", ON);
		expect(none.price).toBeNull();
	});

	it("city item names in both languages", () => {
		// AC8
		const row = { slug: "hanoi", name_vi: "Hà Nội", name_en: "Hanoi" };
		expect(toCityItem(row, "en")).toEqual({
			slug: "hanoi",
			name: "Hanoi",
			nameVi: "Hà Nội",
			nameEn: "Hanoi",
		});
		expect(toCityItem(row, "vi").name).toBe("Hà Nội");
		const noEn = toCityItem({ slug: "hue", name_vi: "Huế", name_en: null }, "en");
		expect(noEn.name).toBe("Huế");
		expect(noEn.nameEn).toBeNull();
		expect(noEn.nameVi).toBe("Huế");
	});
});
