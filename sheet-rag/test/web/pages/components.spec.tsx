import { describe, it, expect } from "vitest";
import type { SiteSettings } from "../../../src/db/settings";
import { Disclaimer } from "../../../src/web/pages/components/Disclaimer";
import { FeeNote } from "../../../src/web/pages/components/FeeNote";
import { PriceBlock, formatPrice } from "../../../src/web/pages/components/PriceBlock";

const base: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Giá chỉ mang tính tham khảo, vui lòng xác nhận lại.",
	disclaimerEn: "Prices are indicative, please confirm before booking.",
};

describe("components (TASK-8)", () => {
	it("Disclaimer shows the text of the page language", async () => {
		const vi = await (<Disclaimer lang="vi" settings={base} />).toString();
		const en = await (<Disclaimer lang="en" settings={base} />).toString();
		expect(vi).toContain("data-disclaimer");
		expect(vi).toContain(base.disclaimerVi);
		expect(vi).not.toContain(base.disclaimerEn);
		expect(en).toContain("data-disclaimer");
		expect(en).toContain(base.disclaimerEn);
		expect(en).not.toContain(base.disclaimerVi);
	});

	it("Disclaimer falls back to the other language and throws when both are empty", async () => {
		const onlyEn = { ...base, disclaimerVi: "" };
		const html = await (<Disclaimer lang="vi" settings={onlyEn} />).toString();
		expect(html).toContain(base.disclaimerEn);

		const onlyVi = { ...base, disclaimerEn: "" };
		const html2 = await (<Disclaimer lang="en" settings={onlyVi} />).toString();
		expect(html2).toContain(base.disclaimerVi);

		const none = { ...base, disclaimerVi: "", disclaimerEn: "" };
		expect(() => (<Disclaimer lang="en" settings={none} />).toString()).toThrow(
			"disclaimer text missing",
		);
	});

	it("Disclaimer escapes html", async () => {
		const evil = { ...base, disclaimerEn: "<b>bold</b> & more" };
		const html = await (<Disclaimer lang="en" settings={evil} />).toString();
		expect(html).not.toContain("<b>");
		expect(html).toContain("&lt;b&gt;");
		expect(html).toContain("&amp;");
	});

	it("FeeNote appears only when the flag is on and uses the percentage", async () => {
		const on = await (<FeeNote lang="en" settings={base} />).toString();
		expect(on).toContain("data-fee-note");
		expect(on).toContain("Includes 10% service fee");

		const off = await (
			<FeeNote lang="en" settings={{ ...base, showFeeNote: false }} />
		).toString();
		expect(off).toBe("");

		const decimal = await (
			<FeeNote lang="en" settings={{ ...base, serviceFeePercent: 12.5 }} />
		).toString();
		expect(decimal).toContain("12.5%");
	});

	it("PriceBlock includes the formatted amount, data-price and the fee note", async () => {
		const en = await (
			<PriceBlock lang="en" settings={base} amount={1375000} />
		).toString();
		expect(en).toContain("data-price");
		expect(en).toContain("1,375,000");
		expect(en).toContain("Includes 10% service fee");
		expect(en).not.toContain("data-disclaimer");

		const vi = await (
			<PriceBlock lang="vi" settings={{ ...base, serviceFeePercent: 12.5 }} amount={1375000} />
		).toString();
		expect(vi).toContain("1.375.000");
		expect(vi).toContain("12.5%");
		expect(vi).toContain("Đã bao gồm");

		const noFee = await (
			<PriceBlock lang="en" settings={{ ...base, showFeeNote: false }} amount={1375000} />
		).toString();
		expect(noFee).toContain("data-price");
		expect(noFee).not.toContain("service fee");
		expect(noFee).not.toContain("data-fee-note");
	});

	it("PriceBlock renders nothing for a null amount", async () => {
		const html = await (<PriceBlock lang="en" settings={base} amount={null} />).toString();
		expect(html).toBe("");
	});

	it("formatPrice follows the language", () => {
		expect(formatPrice(1375000, "vi")).toContain("1.375.000");
		expect(formatPrice(1375000, "vi")).toContain("₫");
		expect(formatPrice(1375000, "en")).toContain("1,375,000");
		expect(formatPrice(1375000, "en")).toContain("VND");
	});
});
