import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildView } from "../../src/client/bill/viewModel";
import {
	createInitialState,
	reduce,
	type BillState,
	type BillAction,
} from "../../src/client/bill/state";
import { MAX_ROWS } from "../../src/domain/money";

const LABELS: Record<string, string> = {
	noteLabel: "NOTE",
	noteAria: "Note, row {n}",
	hotelAria: "Hotel, row {n}",
	roomAria: "Room, row {n}",
	nightAria: "Nights, row {n}",
	priceAria: "Price, row {n}",
	removeRowAria: "Remove row {n}",
	addRowLimit: "Maximum {max} rows",
};

const VIEW_SRC = fileURLToPath(new URL("../../src/client/bill/viewModel.ts", import.meta.url));
const RENDER_SRC = fileURLToPath(new URL("../../src/client/bill/render.ts", import.meta.url));
const CSS_SRC = fileURLToPath(new URL("../../public/bill.css", import.meta.url));

function run(state: BillState, ...actions: BillAction[]): BillState {
	return actions.reduce((s, a) => reduce(s, a), state);
}

/** A state with `n` rows: row "r0" is the first, ids r1.. are added after it. */
function rowsState(n: number): BillState {
	let s = createInitialState("r0");
	for (let i = 1; i < n; i++) s = reduce(s, { type: "addRow", id: `r${i}` });
	return s;
}

describe("bill view model (TASK-35)", () => {
	it("rows are numbered in order and renumbered after removal", () => {
		const s = rowsState(3);
		expect(buildView(s, LABELS, "en").rows.map((r) => r.indexText)).toEqual(["1", "2", "3"]);
		const removed = reduce(s, { type: "removeRow", rowId: "r1" });
		expect(buildView(removed, LABELS, "en").rows.map((r) => r.indexText)).toEqual(["1", "2"]);
		expect(buildView(removed, LABELS, "en").rows.map((r) => r.id)).toEqual(["r0", "r2"]);
	});

	it("visible note label has no row number but aria text has", () => {
		const view = buildView(rowsState(2), LABELS, "en");
		const row = view.rows[1];
		expect(row.noteAria).toBe("Note, row 2");
		expect(LABELS.noteLabel).toBe("NOTE");
		expect(Object.keys(row)).not.toContain("noteLabel");
		for (const value of Object.values(row)) {
			if (typeof value === "string") expect(value).not.toMatch(/NOTE\s*\d/);
		}
	});

	it("user text is passed through unchanged and render code never uses html injection", () => {
		const script = "<script>alert(1)</script>";
		const hotel = 'Nha "Bao" & Co';
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "setNote", rowId: "a", note: script },
			{ type: "setHotelText", rowId: "a", text: hotel },
		);
		const row = buildView(s, LABELS, "vi").rows[0];
		expect(row.noteText).toBe(script);
		expect(row.hotelText).toBe(hotel);

		for (const file of [VIEW_SRC, RENDER_SRC]) {
			const src = readFileSync(file, "utf8");
			expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
		}
	});

	it("room list only for a picked hotel", () => {
		let s = createInitialState("a");
		expect(buildView(s, LABELS, "en").rows[0].roomHasList).toBe(false);

		s = reduce(s, { type: "setHotelText", rowId: "a", text: "Free text hotel" });
		expect(buildView(s, LABELS, "en").rows[0].roomHasList).toBe(false);

		s = reduce(s, { type: "pickHotel", rowId: "a", slug: "h1", name: "Hotel 1" });
		expect(buildView(s, LABELS, "en").rows[0].roomHasList).toBe(true);
	});

	it("total text shows a dash without a price and grouped numbers with one", () => {
		let s = createInitialState("a");
		expect(buildView(s, LABELS, "vi").rows[0].totalText).toBe("—");

		s = run(
			s,
			{ type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 1375000 },
			{ type: "setNights", rowId: "a", nights: 2 },
		);
		expect(buildView(s, LABELS, "vi").rows[0].totalText).toBe("2.750.000");
		expect(buildView(s, LABELS, "en").rows[0].totalText).toBe("2,750,000");
	});

	it("edited marker and reset only for an edited price on a room with a default", () => {
		let s = createInitialState("a");
		// No room: typed price has nothing to reset to, so no marker.
		s = reduce(s, { type: "setPrice", rowId: "a", value: 500 });
		let row = buildView(s, LABELS, "en").rows[0];
		expect(row.edited).toBe(false);
		expect(row.showReset).toBe(false);

		// Room with a default, unedited: no marker.
		s = run(
			createInitialState("b"),
			{ type: "pickRoom", rowId: "b", roomId: "r1", name: "Deluxe", price: 1000 },
		);
		row = buildView(s, LABELS, "en").rows[0];
		expect(row.edited).toBe(false);
		expect(row.showReset).toBe(false);

		// Edited price on a room with a default: marker and reset.
		s = reduce(s, { type: "setPrice", rowId: "b", value: 1200 });
		row = buildView(s, LABELS, "en").rows[0];
		expect(row.edited).toBe(true);
		expect(row.showReset).toBe(true);

		// After reset both are false again.
		s = reduce(s, { type: "resetPrice", rowId: "b" });
		row = buildView(s, LABELS, "en").rows[0];
		expect(row.edited).toBe(false);
		expect(row.showReset).toBe(false);
	});

	it("grand total sums the rows", () => {
		let s = createInitialState("a");
		s = run(
			s,
			{ type: "pickRoom", rowId: "a", roomId: "r1", name: "Deluxe", price: 1000 },
			{ type: "setNights", rowId: "a", nights: 2 },
			{ type: "addRow", id: "b" },
			{ type: "pickRoom", rowId: "b", roomId: "r2", name: "Basic", price: null },
			{ type: "addRow", id: "c" },
			{ type: "pickRoom", rowId: "c", roomId: "r3", name: "Suite", price: 500 },
		);
		// 2 * 1000 + null (0) + 1 * 500
		expect(buildView(s, LABELS, "en").grandTotalText).toBe("2,500");
		expect(buildView(s, LABELS, "vi").grandTotalText).toBe("2.500");
		expect(buildView(createInitialState("z"), LABELS, "en").grandTotalText).toBe("0");
	});

	it("add and remove availability", () => {
		const full = rowsState(MAX_ROWS);
		const fullView = buildView(full, LABELS, "en");
		expect(fullView.canAdd).toBe(false);
		expect(fullView.addHint).toBe("Maximum 30 rows");

		const almost = rowsState(MAX_ROWS - 1);
		const almostView = buildView(almost, LABELS, "en");
		expect(almostView.canAdd).toBe(true);
		expect(almostView.addHint).toBe("");

		const one = buildView(createInitialState("only"), LABELS, "en");
		expect(one.rows[0].canRemove).toBe(false);
		expect(one.canAdd).toBe(true);

		const two = buildView(rowsState(2), LABELS, "en");
		expect(two.rows.every((r) => r.canRemove)).toBe(true);
	});

	it("empty note is flagged", () => {
		let s = createInitialState("a");
		expect(buildView(s, LABELS, "en").rows[0].noteEmpty).toBe(true);
		s = reduce(s, { type: "setNote", rowId: "a", note: "Breakfast incl." });
		const row = buildView(s, LABELS, "en").rows[0];
		expect(row.noteEmpty).toBe(false);
		expect(row.noteText).toBe("Breakfast incl.");
	});

	it("render.ts uses only classes defined in bill.css", () => {
		const css = readFileSync(CSS_SRC, "utf8");
		const src = readFileSync(RENDER_SRC, "utf8");

		// Class names are declared once in the C object; every use goes through it
		// or is a quoted literal. Both must exist as selectors in bill.css.
		const block = src.match(/const C = \{([\s\S]*?)\} as const;/);
		expect(block, "render.ts must declare const C = {...} as const").not.toBeNull();
		const names = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		expect(names.length).toBeGreaterThan(0);

		const literals = [...src.matchAll(/classList\.\w+\(\s*"([^"]+)"/g)].map((m) => m[1]);
		for (const name of [...names, ...literals]) {
			for (const token of name.split(/\s+/)) {
				expect(css, `class .${token} is not in bill.css`).toContain(`.${token}`);
			}
		}
		expect(src).not.toMatch(/className\s*=/);
		expect(src).not.toMatch(/\.style\b|setAttribute\(\s*["']style["']/);
	});
});
