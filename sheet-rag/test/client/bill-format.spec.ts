import { describe, it, expect } from "vitest";
import {
	separatorFor,
	reformatPriceInput,
	totalLabel,
	priceLabel,
	fillTemplate,
	dateLabel,
	nightsText,
} from "../../src/client/bill/format";

describe("bill format helpers (TASK-31)", () => {
	it("price input shows separators for each language and caps length", () => {
		expect(separatorFor("vi")).toBe(".");
		expect(separatorFor("en")).toBe(",");

		expect(reformatPriceInput("1375000", 7, "vi")).toMatchObject({ text: "1.375.000", value: 1375000 });
		expect(reformatPriceInput("1375000", 7, "en")).toMatchObject({ text: "1,375,000", value: 1375000 });
		expect(reformatPriceInput("12a3", 4, "vi")).toMatchObject({ text: "123", value: 123 });

		const pasted = reformatPriceInput("12345678901", 11, "vi");
		expect(pasted.value).toBe(1000000000);
		expect(pasted.text).toBe("1.000.000.000");
	});

	it("caret stays after the same digit", () => {
		// raw "1.3750": caret 5 is after the 4th digit (5); in "13.750" that is position 5.
		const afterFourth = reformatPriceInput("1.3750", 5, "vi");
		expect(afterFourth.text).toBe("13.750");
		expect(afterFourth.caret).toBe(5);

		// caret 6 is the end of "1.3750", after the 5th digit; end of "13.750" is 6.
		const atEnd = reformatPriceInput("1.3750", 6, "vi");
		expect(atEnd.text).toBe("13.750");
		expect(atEnd.caret).toBe(6);

		// clearing everything
		const cleared = reformatPriceInput("", 0, "vi");
		expect(cleared).toEqual({ text: "", value: null, caret: 0 });
	});

	it("total label shows a dash only when there is no price", () => {
		expect(totalLabel(null, "vi")).toBe("—");
		expect(totalLabel(0, "vi")).toBe("0");
		expect(totalLabel(2750000, "en")).toBe("2,750,000");
	});

	it("nights text keeps up to 3 digits within 1 to 365", () => {
		expect(nightsText("abc")).toEqual({ text: "", value: null });
		expect(nightsText("")).toEqual({ text: "", value: null });
		expect(nightsText("0012")).toEqual({ text: "12", value: 12 });
		expect(nightsText("1234")).toEqual({ text: "123", value: 123 });
		expect(nightsText("999")).toEqual({ text: "365", value: 365 });
		expect(nightsText("0")).toEqual({ text: "1", value: 1 });
	});

	it("date label per language", () => {
		const date = new Date(2026, 10, 18);
		expect(dateLabel(date, "vi")).toBe("18/11/2026");
		expect(dateLabel(date, "en")).toBe("2026-11-18");
		expect(dateLabel(new Date(2026, 0, 5), "vi")).toBe("05/01/2026");
	});

	it("fillTemplate inserts values literally", () => {
		expect(fillTemplate("Hotel, row {n}", { n: 3 })).toBe("Hotel, row 3");
		expect(fillTemplate("{x}", { x: "<b>hi</b>" })).toBe("<b>hi</b>");
		expect(fillTemplate("{x}", { x: "a $& b $1" })).toBe("a $& b $1");
		expect(fillTemplate("{a}", { a: "{b}", b: "no" })).toBe("{b}");
		expect(fillTemplate("Hi {missing}", { n: 1 })).toBe("Hi {missing}");
	});

	it("total label and price label use the language separator", () => {
		expect(priceLabel(null, "vi")).toBe("");
		expect(priceLabel(1250000, "vi")).toBe("1.250.000");
		expect(priceLabel(1250000, "en")).toBe("1,250,000");
	});
});
