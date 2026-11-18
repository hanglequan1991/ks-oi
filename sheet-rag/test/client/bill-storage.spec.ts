import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	DRAFT_KEY,
	sanitizeRows,
	loadDraft,
	saveDraft,
	clearDraft,
	isBlankDraft,
	createSaver,
	type StorageLike,
} from "../../src/client/bill/storage";
import { emptyRow, type BillRow } from "../../src/client/bill/state";

type Call = [string, ...string[]];

function fakeStorage(initial: Record<string, string> = {}) {
	const data = new Map<string, string>(Object.entries(initial));
	const calls: Call[] = [];
	const storage: StorageLike & { data: Map<string, string>; calls: Call[] } = {
		data,
		calls,
		getItem(k) {
			calls.push(["getItem", k]);
			return data.has(k) ? (data.get(k) as string) : null;
		},
		setItem(k, v) {
			calls.push(["setItem", k, v]);
			data.set(k, v);
		},
		removeItem(k) {
			calls.push(["removeItem", k]);
			data.delete(k);
		},
	};
	return storage;
}

function blockedStorage(): StorageLike {
	const boom = () => {
		throw new Error("blocked");
	};
	return { getItem: boom, setItem: boom, removeItem: boom };
}

function fakeTimers() {
	let next = 1;
	const timers = new Map<number, { fn: () => void; ms: number }>();
	return {
		set(fn: () => void, ms: number) {
			const id = next++;
			timers.set(id, { fn, ms });
			return id;
		},
		clear(h: unknown) {
			timers.delete(h as number);
		},
		get count() {
			return timers.size;
		},
		lastMs() {
			return [...timers.values()].at(-1)?.ms;
		},
		fireAll() {
			const list = [...timers.values()];
			timers.clear();
			for (const t of list) t.fn();
		},
	};
}

const NOW = new Date("2026-11-18T10:00:00.000Z");

function makeIds() {
	let n = 0;
	return () => `gen-${++n}`;
}

function rowA(): BillRow {
	return {
		id: "row-a",
		hotelText: "Hotel Alpha",
		hotelSlug: "hotel-alpha",
		roomText: "Deluxe King",
		roomId: "room-1",
		defaultPrice: 1200000,
		price: 1000000,
		priceEdited: true,
		nights: 3,
		note: "Late arrival",
	};
}

function rowB(): BillRow {
	return {
		id: "row-b",
		hotelText: "Beta Inn",
		hotelSlug: "beta-inn",
		roomText: "Twin",
		roomId: "room-7",
		defaultPrice: 450000,
		price: null,
		priceEdited: false,
		nights: 1,
		note: "",
	};
}

function storedDraft(rows: unknown, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({ v: 1, savedAt: NOW.toISOString(), rows, ...extra });
}

describe("bill draft storage", () => {
	it("saved draft loads back with the same rows and savedAt", () => {
		const storage = fakeStorage();
		const rows = [rowA(), rowB()];
		expect(saveDraft(storage, rows, NOW)).toBe(true);

		const loaded = loadDraft(storage, makeIds());
		expect(loaded).not.toBeNull();
		expect(loaded?.savedAt).toBe(NOW.toISOString());
		expect(loaded?.rows).toEqual(rows);
		expect(loaded?.rows[0].priceEdited).toBe(true);
		expect(loaded?.rows[0].note).toBe("Late arrival");
	});

	it("default price and slug round trip, bad defaults become null", () => {
		const storage = fakeStorage();
		expect(saveDraft(storage, [rowA(), rowB()], NOW)).toBe(true);
		const loaded = loadDraft(storage, makeIds());
		expect(loaded?.rows[0].defaultPrice).toBe(1200000);
		expect(loaded?.rows[0].hotelSlug).toBe("hotel-alpha");
		expect(loaded?.rows[1].hotelSlug).toBe("beta-inn");

		const bad = [-5, 1.5, "x"].map((d) => ({ ...rowA(), defaultPrice: d }));
		storage.data.set(DRAFT_KEY, storedDraft(bad));
		const reloaded = loadDraft(storage, makeIds());
		expect(reloaded?.rows.map((r) => r.defaultPrice)).toEqual([null, null, null]);
	});

	it("clearDraft removes the stored draft", () => {
		const storage = fakeStorage();
		saveDraft(storage, [rowA()], NOW);
		expect(storage.data.has(DRAFT_KEY)).toBe(true);
		expect(clearDraft(storage)).toBe(true);
		expect(storage.data.has(DRAFT_KEY)).toBe(false);
		expect(loadDraft(storage, makeIds())).toBeNull();
	});

	it("storage module touches only the draft key and has no network calls", () => {
		const storage = fakeStorage();
		saveDraft(storage, [rowA(), rowB()], NOW);
		loadDraft(storage, makeIds());
		clearDraft(storage);

		expect(storage.calls.length).toBeGreaterThan(0);
		for (const [method, key] of storage.calls) {
			expect(["getItem", "setItem", "removeItem"]).toContain(method);
			expect(key).toBe(DRAFT_KEY);
		}
		expect(DRAFT_KEY).toBe("hd_bill_v1");

		const source = readFileSync(
			fileURLToPath(new URL("../../src/client/bill/storage.ts", import.meta.url)),
			"utf8",
		);
		for (const word of ["fetch", "XMLHttpRequest", "sendBeacon", "WebSocket"]) {
			expect(source).not.toContain(word);
		}
	});

	it("long notes are cut to 500 and markup stays plain text", () => {
		const storage = fakeStorage();
		const long = { ...rowA(), note: "a".repeat(900) };
		const markup = { ...rowB(), note: "<img src=x onerror=alert(1)>" };
		saveDraft(storage, [long, markup], NOW);

		const loaded = loadDraft(storage, makeIds());
		expect(loaded?.rows[0].note.length).toBe(500);
		expect(loaded?.rows[1].note).toBe("<img src=x onerror=alert(1)>");
		expect(typeof loaded?.rows[1].note).toBe("string");
	});

	it("corrupt, oversized and old data is cleaned or ignored", () => {
		const corrupt = [
			"not json{",
			"null",
			"[]",
			'"text"',
			'{"v":2,"savedAt":"x","rows":[]}',
			'{"v":1,"savedAt":"x"}',
		];
		for (const raw of corrupt) {
			const storage = fakeStorage({ [DRAFT_KEY]: raw });
			expect(() => loadDraft(storage, makeIds())).not.toThrow();
			expect(loadDraft(storage, makeIds())).toBeNull();
			expect(storage.data.has(DRAFT_KEY)).toBe(false);
		}

		const hundred = Array.from({ length: 100 }, (_, i) => ({ ...rowB(), id: `r${i}` }));
		const big = fakeStorage({ [DRAFT_KEY]: storedDraft(hundred) });
		expect(loadDraft(big, makeIds())?.rows.length).toBe(30);

		const wrong = fakeStorage({
			[DRAFT_KEY]: storedDraft([
				{ id: "ok", hotelText: 5, roomText: null, note: { x: 1 }, nights: "x", price: "abc", priceEdited: "yes" },
				{ id: 42, hotelText: "h", nights: 2.5, price: 1e9 + 1, defaultPrice: 1e9 + 1, priceEdited: true },
				"not a row",
				null,
			]),
		});
		const got = loadDraft(wrong, makeIds())?.rows ?? [];
		expect(got.length).toBe(2);
		expect(got[0]).toEqual({
			id: "ok",
			hotelText: "",
			hotelSlug: null,
			roomText: "",
			roomId: null,
			defaultPrice: null,
			price: null,
			priceEdited: false,
			nights: 1,
			note: "",
		});
		expect(got[1].id).toBe("gen-1");
		expect(got[1].hotelText).toBe("h");
		expect(got[1].nights).toBe(1);
		expect(got[1].price).toBeNull();
		expect(got[1].defaultPrice).toBeNull();
		expect(got[1].priceEdited).toBe(false);

		const dup = sanitizeRows(
			[
				{ ...rowA(), id: "same" },
				{ ...rowB(), id: "same" },
			],
			makeIds(),
		);
		expect(dup.map((r) => r.id)).toEqual(["same", "gen-1"]);

		expect(sanitizeRows("nope", makeIds())).toEqual([]);
		expect(sanitizeRows([], makeIds())).toEqual([]);
		expect(sanitizeRows([null, 3, "x"], makeIds())).toEqual([]);
	});

	it("blocked or missing storage never throws", () => {
		for (const storage of [blockedStorage(), null]) {
			expect(() => loadDraft(storage, makeIds())).not.toThrow();
			expect(loadDraft(storage, makeIds())).toBeNull();
			expect(() => saveDraft(storage, [rowA()], NOW)).not.toThrow();
			expect(saveDraft(storage, [rowA()], NOW)).toBe(false);
			expect(() => clearDraft(storage)).not.toThrow();
			expect(clearDraft(storage)).toBe(false);
		}
	});

	it("a blank bill is not stored", () => {
		const storage = fakeStorage();
		expect(saveDraft(storage, [emptyRow("x")], NOW)).toBe(false);
		expect(storage.data.has(DRAFT_KEY)).toBe(false);

		storage.data.set(DRAFT_KEY, storedDraft([rowA()]));
		expect(saveDraft(storage, [emptyRow("x")], NOW)).toBe(false);
		expect(storage.data.has(DRAFT_KEY)).toBe(false);

		expect(isBlankDraft([emptyRow("x")])).toBe(true);
		expect(isBlankDraft([emptyRow("x"), emptyRow("y")])).toBe(false);
		expect(isBlankDraft([{ ...emptyRow("x"), note: "n" }])).toBe(false);
		expect(isBlankDraft([{ ...emptyRow("x"), nights: 2 }])).toBe(false);
	});

	it("debounced saver runs once, flush and cancel work", () => {
		const t = fakeTimers();
		let calls = 0;
		const saver = createSaver(() => calls++, 500, t);

		for (let i = 0; i < 5; i++) saver.schedule();
		expect(t.count).toBe(1);
		expect(t.lastMs()).toBe(500);
		expect(calls).toBe(0);
		t.fireAll();
		expect(calls).toBe(1);

		saver.schedule();
		saver.flush();
		expect(calls).toBe(2);
		expect(t.count).toBe(0);
		saver.flush();
		expect(calls).toBe(2);

		saver.schedule();
		saver.cancel();
		t.fireAll();
		expect(calls).toBe(2);
	});
});
