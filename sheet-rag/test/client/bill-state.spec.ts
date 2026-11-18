import { describe, it, expect } from "vitest";
import {
	createInitialState,
	reduce,
	createStore,
	emptyRow,
	effectivePrice,
	rowTotal,
	billTotal,
	canAddRow,
	canRemoveRow,
	type BillState,
	type BillAction,
	type RoomOption,
} from "../../src/client/bill/state";
import { MAX_ROWS, MAX_PRICE } from "../../src/domain/money";

function run(state: BillState, ...actions: BillAction[]): BillState {
	return actions.reduce((s, a) => reduce(s, a), state);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
		Object.freeze(value);
	}
	return value;
}

describe("bill state", () => {
	it("starts with one empty row", () => {
		const s = createInitialState("a");
		expect(s.rows).toHaveLength(1);
		const row = s.rows[0];
		expect(row.id).toBe("a");
		expect(row.nights).toBe(1);
		expect(row.hotelText).toBe("");
		expect(row.hotelSlug).toBeNull();
		expect(row.roomText).toBe("");
		expect(row.roomId).toBeNull();
		expect(row.defaultPrice).toBeNull();
		expect(row.price).toBeNull();
		expect(row.priceEdited).toBe(false);
		expect(row.note).toBe("");
		expect(s.open).toBeNull();
		expect(emptyRow("x")).toEqual({
			id: "x",
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
	});

	it("note is capped at 500 and kept as plain text", () => {
		let s = createInitialState("a");
		s = reduce(s, { type: "setNote", rowId: "a", note: "x".repeat(600) });
		expect(Array.from(s.rows[0].note)).toHaveLength(500);
		const raw = "<b>Bold</b> & co";
		s = reduce(s, { type: "setNote", rowId: "a", note: raw });
		expect(s.rows[0].note).toBe(raw);
	});

	it("free text hotel and room are kept", () => {
		let s = createInitialState("a");
		s = reduce(s, { type: "setHotelText", rowId: "a", text: "Nha nghi X" });
		expect(s.rows[0].hotelText).toBe("Nha nghi X");
		expect(s.rows[0].hotelSlug).toBeNull();
		s = reduce(s, { type: "setRoomText", rowId: "a", text: "Phong doi" });
		expect(s.rows[0].roomText).toBe("Phong doi");
		expect(s.rows[0].roomId).toBeNull();
		expect(s.rows[0].defaultPrice).toBeNull();
	});

	it("changing the hotel clears the room, same hotel keeps it", () => {
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "pickHotel", rowId: "a", slug: "h1", name: "Hotel 1" },
			{ type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 500 },
		);
		const same = reduce(s, { type: "pickHotel", rowId: "a", slug: "h1", name: "Hotel 1" });
		expect(same.rows[0].roomText).toBe("Deluxe");
		expect(same.rows[0].roomId).toBe("r1");
		expect(same.rows[0].defaultPrice).toBe(500);

		const other = reduce(s, { type: "pickHotel", rowId: "a", slug: "h2", name: "Hotel 2" });
		expect(other.rows[0].hotelSlug).toBe("h2");
		expect(other.rows[0].hotelText).toBe("Hotel 2");
		expect(other.rows[0].roomText).toBe("");
		expect(other.rows[0].roomId).toBeNull();
		expect(other.rows[0].defaultPrice).toBeNull();

		// Typing free text after a picked hotel also clears the room.
		const typed = reduce(s, { type: "setHotelText", rowId: "a", text: "Hotel 1x" });
		expect(typed.rows[0].hotelSlug).toBeNull();
		expect(typed.rows[0].roomId).toBeNull();
		expect(typed.rows[0].defaultPrice).toBeNull();
	});

	it("picked room sets the default price and totals; no price gives no total", () => {
		let s = createInitialState("a");
		s = reduce(s, { type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 1375000 });
		s = reduce(s, { type: "setNights", rowId: "a", nights: 2 });
		expect(effectivePrice(s.rows[0])).toBe(1375000);
		expect(rowTotal(s.rows[0])).toBe(2750000);

		s = reduce(s, { type: "pickRoom", rowId: "a", roomId: "r2", name: "Basic", price: null });
		expect(effectivePrice(s.rows[0])).toBe(0);
		expect(rowTotal(s.rows[0])).toBeNull();
	});

	it("edited price, reset, and room change keep the rules", () => {
		let s = createInitialState("a");
		s = reduce(s, { type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 1000 });

		s = reduce(s, { type: "setPrice", rowId: "a", value: 1200 });
		expect(s.rows[0].priceEdited).toBe(true);
		expect(s.rows[0].price).toBe(1200);
		expect(effectivePrice(s.rows[0])).toBe(1200);

		// Typing the default again clears the edit.
		s = reduce(s, { type: "setPrice", rowId: "a", value: 1000 });
		expect(s.rows[0].priceEdited).toBe(false);
		expect(s.rows[0].price).toBeNull();

		// Reset returns to the default.
		s = reduce(s, { type: "setPrice", rowId: "a", value: 900 });
		s = reduce(s, { type: "resetPrice", rowId: "a" });
		expect(s.rows[0].priceEdited).toBe(false);
		expect(s.rows[0].price).toBeNull();
		expect(effectivePrice(s.rows[0])).toBe(1000);

		// A null edit with a default present is an edited, missing price.
		s = reduce(s, { type: "setPrice", rowId: "a", value: null });
		expect(s.rows[0].priceEdited).toBe(true);
		expect(s.rows[0].price).toBeNull();
		expect(rowTotal(s.rows[0])).toBeNull();
		s = reduce(s, { type: "resetPrice", rowId: "a" });

		// Edited price survives a room change.
		s = reduce(s, { type: "setPrice", rowId: "a", value: 1500 });
		s = reduce(s, { type: "pickRoom", rowId: "a", roomId: "r3", name: "Suite", price: 2000 });
		expect(s.rows[0].priceEdited).toBe(true);
		expect(s.rows[0].price).toBe(1500);
		expect(s.rows[0].defaultPrice).toBe(2000);

		// Null edit with no default present is not an edit.
		const bare = reduce(createInitialState("b"), { type: "setPrice", rowId: "b", value: null });
		expect(bare.rows[0].priceEdited).toBe(false);
		expect(bare.rows[0].price).toBeNull();

		// Value is capped at MAX_PRICE.
		const capped = reduce(createInitialState("c"), { type: "setPrice", rowId: "c", value: MAX_PRICE * 10 });
		expect(capped.rows[0].price).toBe(MAX_PRICE);
	});

	it("row total and bill total", () => {
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 100 },
			{ type: "setNights", rowId: "a", nights: 3 },
			{ type: "addRow", id: "b" },
			{ type: "pickRoom", rowId: "b", roomId: "r2", name: "Basic", price: null },
			{ type: "addRow", id: "c" },
			{ type: "pickRoom", rowId: "c", roomId: "r3", name: "Suite", price: 50 },
			{ type: "setNights", rowId: "c", nights: 2 },
		);
		expect(rowTotal(s.rows[0])).toBe(300);
		expect(rowTotal(s.rows[1])).toBeNull();
		expect(billTotal(s)).toBe(300 + 100);
	});

	it("add and remove rows respect 30 and 1", () => {
		let s = createInitialState("r0");
		for (let i = 1; i < MAX_ROWS; i++) {
			expect(canAddRow(s)).toBe(true);
			s = reduce(s, { type: "addRow", id: `r${i}` });
		}
		expect(s.rows).toHaveLength(MAX_ROWS);
		expect(s.rows.map((r) => r.id)).toEqual(Array.from({ length: MAX_ROWS }, (_, i) => `r${i}`));
		expect(canAddRow(s)).toBe(false);
		const full = reduce(s, { type: "addRow", id: "extra" });
		expect(full.rows).toHaveLength(MAX_ROWS);
		expect(full.rows.some((r) => r.id === "extra")).toBe(false);

		// Remove keeps order.
		const removed = reduce(s, { type: "removeRow", rowId: "r1" });
		expect(removed.rows).toHaveLength(MAX_ROWS - 1);
		expect(removed.rows[0].id).toBe("r0");
		expect(removed.rows[1].id).toBe("r2");
		expect(canRemoveRow(removed)).toBe(true);

		// Unknown id does nothing.
		expect(reduce(s, { type: "removeRow", rowId: "nope" }).rows).toHaveLength(MAX_ROWS);

		// One row cannot be removed.
		const one = createInitialState("only");
		expect(canRemoveRow(one)).toBe(false);
		expect(reduce(one, { type: "removeRow", rowId: "only" }).rows).toHaveLength(1);
	});

	it("clear all leaves one empty row", () => {
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "pickHotel", rowId: "a", slug: "h1", name: "Hotel 1" },
			{ type: "addRow", id: "b" },
			{ type: "openCombo", rowId: "b", cell: "room" },
		);
		s = reduce(s, { type: "clearAll", id: "z" });
		expect(s.rows).toHaveLength(1);
		expect(s.rows[0].id).toBe("z");
		expect(s.rows[0].hotelText).toBe("");
		expect(s.rows[0].nights).toBe(1);
		expect(s.open).toBeNull();
	});

	it("nights are clamped to 1 to 365", () => {
		let s = createInitialState("a");
		s = reduce(s, { type: "setNights", rowId: "a", nights: 0 });
		expect(s.rows[0].nights).toBe(1);
		s = reduce(s, { type: "setNights", rowId: "a", nights: 1000 });
		expect(s.rows[0].nights).toBe(365);
		s = reduce(s, { type: "setNights", rowId: "a", nights: 12.7 });
		expect(s.rows[0].nights).toBe(12);
	});

	it("applyRooms refreshes defaults only for unedited rows of that hotel", () => {
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "pickHotel", rowId: "a", slug: "h1", name: "Hotel 1" },
			{ type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 100 },
			{ type: "addRow", id: "b" },
			{ type: "pickHotel", rowId: "b", slug: "h1", name: "Hotel 1" },
			{ type: "pickRoom", rowId: "b", roomId: "r2", name: "Basic", price: 50 },
			{ type: "setPrice", rowId: "b", value: 75 },
			{ type: "addRow", id: "c" },
			{ type: "pickHotel", rowId: "c", slug: "h2", name: "Hotel 2" },
			{ type: "pickRoom", rowId: "c", roomId: "r1", name: "Deluxe", price: 300 },
		);
		const rooms: RoomOption[] = [{ id: "r1", name: "Deluxe", price: 150 }];
		const out = reduce(s, { type: "applyRooms", slug: "h1", rooms });

		// Unedited row, room still present: default refreshed.
		expect(out.rows[0].defaultPrice).toBe(150);
		expect(out.rows[0].price).toBeNull();
		// Edited row, room vanished: room nulled, edited price kept, text kept.
		expect(out.rows[1].roomId).toBeNull();
		expect(out.rows[1].defaultPrice).toBeNull();
		expect(out.rows[1].roomText).toBe("Basic");
		expect(out.rows[1].price).toBe(75);
		expect(out.rows[1].priceEdited).toBe(true);
		// Other hotel untouched.
		expect(out.rows[2]).toEqual(s.rows[2]);
	});

	it("reducer is pure and store notifies subscribers", () => {
		const frozen = deepFreeze(createInitialState("a"));
		expect(() =>
			reduce(frozen, { type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 10 }),
		).not.toThrow();
		expect(() => reduce(frozen, { type: "addRow", id: "b" })).not.toThrow();
		expect(frozen.rows[0].roomId).toBeNull();
		expect(frozen.rows).toHaveLength(1);

		const store = createStore(createInitialState("a"));
		const seen: number[] = [];
		const unsubscribe = store.subscribe((s) => seen.push(s.rows.length));
		store.dispatch({ type: "addRow", id: "b" });
		expect(seen).toEqual([2]);
		expect(store.get().rows).toHaveLength(2);
		unsubscribe();
		store.dispatch({ type: "addRow", id: "c" });
		expect(seen).toEqual([2]);
		expect(store.get().rows).toHaveLength(3);
	});
});
