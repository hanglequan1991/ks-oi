import { describe, it, expect } from "vitest";
import {
	t,
	format,
	langFromPath,
	stripLangPrefix,
	pathForLang,
	DEFAULT_LANG,
	LANGS,
} from "../../../src/web/i18n/t";

describe("i18n helpers (TASK-7)", () => {
	it("langFromPath detects the language prefix", () => {
		expect(langFromPath("/bill")).toBe("vi");
		expect(langFromPath("/en/bill")).toBe("en");
		expect(langFromPath("/en")).toBe("en");
		expect(langFromPath("/english")).toBe("vi");
	});

	it("default language is Vietnamese", () => {
		expect(DEFAULT_LANG).toBe("vi");
		expect(langFromPath("/")).toBe("vi");
		expect(LANGS).toEqual(["vi", "en"]);
	});

	it("fee note text formats with the percentage", () => {
		expect(format(t("en", "price.feeNote"), { percent: 10 })).toBe(
			"Includes 10% service fee",
		);
		expect(format(t("vi", "price.feeNote"), { percent: 10 })).toContain("10%");
	});

	it("t returns the key for unknown keys", () => {
		expect(t("en", "no.such.key")).toBe("no.such.key");
		expect(t("vi", "common")).toBe("common");
	});

	it("stripLangPrefix and pathForLang round-trip", () => {
		expect(stripLangPrefix("/en/bill")).toBe("/bill");
		expect(stripLangPrefix("/en")).toBe("/");
		expect(stripLangPrefix("/en/")).toBe("/");
		expect(stripLangPrefix("/english")).toBe("/english");

		expect(pathForLang("/bill", "en")).toBe("/en/bill");
		expect(pathForLang("/en/bill", "vi")).toBe("/bill");
		expect(pathForLang("/", "en")).toBe("/en/");
		expect(pathForLang("/en/", "vi")).toBe("/");

		for (const p of ["/", "/bill", "/hotel/x"]) {
			expect(pathForLang(pathForLang(p, "en"), "vi")).toBe(p);
		}
	});
});
