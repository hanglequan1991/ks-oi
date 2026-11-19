import { describe, it, expect } from "vitest";
import { vi } from "../../../src/web/i18n/vi";
import { en } from "../../../src/web/i18n/en";

const BILL_KEYS = [
	"title",
	"intro",
	"privacyNote",
	"noscript",
	"colIndex",
	"colHotel",
	"colRoom",
	"colNight",
	"colPricing",
	"colTotal",
	"noteLabel",
	"notePlaceholder",
	"hotelPlaceholder",
	"roomPlaceholder",
	"pricePlaceholder",
	"hotelAria",
	"roomAria",
	"nightAria",
	"priceAria",
	"noteAria",
	"totalAria",
	"rowLabel",
	"removeRow",
	"removeRowAria",
	"addRow",
	"addRowLimit",
	"clearAll",
	"clearConfirm",
	"clearDraft",
	"draftSaved",
	"draftRestored",
	"edited",
	"useDefault",
	"enterPrice",
	"grandTotal",
	"print",
	"printTitle",
	"printDate",
	"noResults",
	"loadFailed",
	"listboxHotel",
	"listboxRoom",
	"comboHint",
] as const;

type Dict = Record<string, unknown>;

function billValue(dict: unknown, key: string): string | undefined {
	const bill = (dict as Dict).bill as Dict | undefined;
	const v = bill?.[key];
	return typeof v === "string" ? v : undefined;
}

function billTexts(dict: unknown): Array<[string, string]> {
	const bill = (dict as Dict).bill as Dict | undefined;
	if (!bill) return [];
	return Object.entries(bill).filter((e): e is [string, string] => typeof e[1] === "string");
}

describe("bill dictionary group (TASK-27)", () => {
	it("every bill key exists in both languages", () => {
		for (const key of BILL_KEYS) {
			const viText = billValue(vi, key);
			const enText = billValue(en, key);
			expect(viText, `vi bill.${key} missing`).toBeTruthy();
			expect(enText, `en bill.${key} missing`).toBeTruthy();
			expect(viText?.trim(), `vi bill.${key} is empty`).not.toBe("");
			expect(enText?.trim(), `en bill.${key} is empty`).not.toBe("");
		}
		expect(billValue(vi, "colHotel")).toContain("Khách sạn");
	});

	it("note label has no row number", () => {
		expect(billValue(en, "noteLabel")).toBe("NOTE");
		expect(billValue(vi, "noteLabel")).toBe("GHI CHÚ");
		expect(billValue(en, "noteLabel")).not.toContain("{");
		expect(billValue(vi, "noteLabel")).not.toContain("{");
	});

	it("noscript text mentions JavaScript in both languages", () => {
		expect(billValue(en, "noscript")).toContain("JavaScript");
		expect(billValue(vi, "noscript")).toContain("JavaScript");
	});

	it("no phone, zalo or call wording in bill texts", () => {
		const banned = [/phone/i, /zalo/i, /call/i, /gọi/i, /điện thoại/i, /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/];
		for (const dict of [vi, en]) {
			for (const [key, text] of billTexts(dict)) {
				for (const re of banned) {
					expect(text, `bill.${key} matches ${re}`).not.toMatch(re);
				}
			}
		}
	});

	it("comboHint exists in both languages and updated labels are non-empty", () => {
		expect(billValue(vi, "comboHint")).toBe("Không có trong danh sách? Cứ nhập tên khách sạn.");
		expect(billValue(en, "comboHint")).toBe("Not in the list? Just type the hotel name.");

		expect(billValue(vi, "title")).toBe("Bảng tính chi phí lưu trú");
		expect(billValue(vi, "printTitle")).toBe("Bảng tính chi phí lưu trú");
		expect(billValue(vi, "intro")).toBe("Chọn khách sạn và phòng, nhập số đêm, giá được điền sẵn và có thể sửa.");
		expect(billValue(en, "intro")).toBe("Choose a hotel and room, enter the nights; the price is filled in and can be edited.");
		expect(billValue(vi, "colPricing")).toBe("Đơn giá (VND)");
		expect(billValue(en, "colPricing")).toBe("Price (VND)");
		expect(billValue(vi, "edited")).toBe("Đã sửa giá");
		expect(billValue(en, "edited")).toBe("Price edited");
		expect(billValue(vi, "draftSaved")).toBe("Đã lưu bản nháp trên trình duyệt này");
		expect(billValue(en, "draftSaved")).toBe("Draft saved in this browser");

		for (const key of ["title", "intro", "colPricing", "edited", "draftSaved", "printTitle", "comboHint"]) {
			expect(billValue(vi, key)?.trim(), `vi ${key}`).not.toBe("");
			expect(billValue(en, key)?.trim(), `en ${key}`).not.toBe("");
		}
	});

	it("limit and row placeholders are present", () => {
		expect(billValue(en, "addRowLimit")).toContain("{max}");
		expect(billValue(vi, "addRowLimit")).toContain("{max}");
		expect(billValue(en, "removeRowAria")).toContain("{n}");
		expect(billValue(vi, "removeRowAria")).toContain("{n}");
	});
});
