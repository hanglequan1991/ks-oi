import { describe, it, expect } from "vitest";
import { MAX_ROWS, MAX_NIGHTS, MAX_NOTE } from "../../src/domain/money";
import { parseBillConfig } from "../../src/client/bill/config";

function json(v: unknown): string {
	return JSON.stringify(v);
}

const LABELS = {
	colIndex: "#",
	colHotel: "Khách sạn",
	draftSaved: "Đã lưu",
};

describe("parseBillConfig", () => {
	it("valid config is parsed", () => {
		const cfg = parseBillConfig(
			json({ lang: "vi", labels: LABELS, maxRows: MAX_ROWS, maxNights: MAX_NIGHTS, maxNote: MAX_NOTE }),
		);
		expect(cfg).not.toBeNull();
		expect(cfg?.lang).toBe("vi");
		expect(cfg?.labels.colIndex).toBe("#");
		expect(cfg?.labels.colHotel).toBe("Khách sạn");
		expect(cfg?.labels.draftSaved).toBe("Đã lưu");
		expect(cfg?.maxRows).toBe(MAX_ROWS);
		expect(cfg?.maxNights).toBe(MAX_NIGHTS);
		expect(cfg?.maxNote).toBe(MAX_NOTE);
	});

	it("accepts lang en", () => {
		expect(parseBillConfig(json({ lang: "en", labels: {} }))?.lang).toBe("en");
	});

	it("limits come from the code, not the page", () => {
		const cfg = parseBillConfig(
			json({ lang: "en", labels: {}, maxRows: 9999, maxNights: 9999, maxNote: 9999 }),
		);
		expect(cfg).not.toBeNull();
		expect(cfg?.maxRows).toBe(MAX_ROWS);
		expect(cfg?.maxNights).toBe(MAX_NIGHTS);
		expect(cfg?.maxNote).toBe(MAX_NOTE);
	});

	it("bad config never throws and falls back", () => {
		expect(parseBillConfig(null)).toBeNull();
		expect(parseBillConfig(undefined)).toBeNull();
		expect(parseBillConfig("")).toBeNull();
		expect(parseBillConfig("{not json")).toBeNull();
		expect(parseBillConfig(json([1, 2]))).toBeNull();
		expect(parseBillConfig(json("text"))).toBeNull();
		expect(parseBillConfig(json({ lang: "fr", labels: {} }))).toBeNull();
		expect(parseBillConfig(json({ labels: {} }))).toBeNull();
		expect(parseBillConfig(json({ lang: "en" }))).toBeNull();
		expect(parseBillConfig(json({ lang: "en", labels: null }))).toBeNull();
		expect(parseBillConfig(json({ lang: "en", labels: [] }))).toBeNull();
		expect(parseBillConfig("x".repeat(200_000))).toBeNull();

		const cfg = parseBillConfig(
			json({ lang: "en", labels: { colIndex: 5, colHotel: null, colRoom: "Room", draftSaved: { a: 1 } } }),
		);
		expect(cfg).not.toBeNull();
		expect(cfg?.labels.colIndex).toBe("colIndex");
		expect(cfg?.labels.colHotel).toBe("colHotel");
		expect(cfg?.labels.draftSaved).toBe("draftSaved");
		expect(cfg?.labels.colRoom).toBe("Room");
		expect(Object.values(cfg?.labels ?? {}).every((v) => typeof v === "string")).toBe(true);
	});

	it("missing label keys fall back to the key name", () => {
		const cfg = parseBillConfig(json({ lang: "en", labels: { colIndex: "No." } }));
		expect(cfg?.labels.colIndex).toBe("No.");
		expect(cfg?.labels.colNight).toBe("colNight");
		expect(cfg?.labels.clearConfirm).toBe("clearConfirm");
		expect(Object.values(cfg?.labels ?? {}).includes("undefined")).toBe(false);
	});

	it("long label values are cut and the key count is bounded", () => {
		const big: Record<string, string> = { colIndex: "y".repeat(5000) };
		for (let i = 0; i < 300; i++) big[`extra${i}`] = "z";
		const cfg = parseBillConfig(json({ lang: "vi", labels: big }));
		expect(cfg).not.toBeNull();
		expect(cfg!.labels.colIndex.length).toBeLessThanOrEqual(500);
		expect(Object.keys(cfg!.labels).length).toBeLessThan(400);
	});

	it("a __proto__ label key does not pollute the labels object", () => {
		const cfg = parseBillConfig('{"lang":"en","labels":{"__proto__":{"polluted":"yes"}}}');
		expect(cfg).not.toBeNull();
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(cfg!.labels)).toBe(Object.prototype);
	});
});
