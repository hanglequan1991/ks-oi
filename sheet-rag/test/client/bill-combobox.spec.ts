import { describe, it, expect } from "vitest";
import {
	filterOptions,
	comboStep,
	comboAria,
	type ComboState,
	type Option,
} from "../../src/client/bill/combobox";

const closed: ComboState = { open: false, active: -1 };
const openAt = (active: number): ComboState => ({ open: true, active });
const optionId = (i: number) => `opt-${i}`;

describe("combobox", () => {
	it("hotel options are found by typed text in order", () => {
		const options: Option[] = [
			{ value: "1", label: "Sea Hotel" },
			{ value: "2", label: "Hotel Sea View" },
			{ value: "3", label: "Mountain Lodge" },
			{ value: "4", label: "Sea Breeze" },
		];
		const found = filterOptions(options, "sea");
		// prefix matches first ("Sea Hotel", "Sea Breeze"), then the rest in original order
		expect(found.map((o) => o.value)).toEqual(["1", "4", "2"]);
		expect(filterOptions(options, "lodge").map((o) => o.value)).toEqual(["3"]);
		expect(filterOptions(options, "")).toHaveLength(4);
	});

	it("accents and case are optional", () => {
		const hotel: Option[] = [{ value: "m", label: "Mộng Hotel" }];
		expect(filterOptions(hotel, "mong")).toHaveLength(1);
		expect(filterOptions(hotel, "MONG")).toHaveLength(1);
		expect(filterOptions(hotel, "mộng")).toHaveLength(1);

		const cities: Option[] = [
			{ value: "a", label: "Da Nang" },
			{ value: "b", label: "Đà Nẵng" },
			{ value: "c", label: "Hue" },
		];
		expect(filterOptions(cities, "đà nẵng").map((o) => o.value)).toEqual([
			"a",
			"b",
		]);
		expect(filterOptions(cities, "xyz")).toEqual([]);
	});

	it("room options narrow by all typed words", () => {
		const rooms: Option[] = [
			{ value: "1", label: "Deluxe Sea View" },
			{ value: "2", label: "Deluxe City View" },
			{ value: "3", label: "Standard Sea View" },
			{ value: "4", label: "Sea Deluxe Suite" },
		];
		expect(filterOptions(rooms, "deluxe").map((o) => o.value)).toEqual([
			"1",
			"2",
			"4",
		]);
		// "Sea Deluxe Suite" is a prefix match for "sea deluxe", so it ranks first
		expect(filterOptions(rooms, "sea deluxe").map((o) => o.value)).toEqual([
			"4",
			"1",
		]);
	});

	it("no options means no list and no pick", () => {
		expect(comboAria(openAt(0), { listId: "l", optionId, count: 0 })).toMatchObject({
			"aria-expanded": "false",
		});
		const down = comboStep(closed, { type: "arrowDown" }, 0);
		expect(down.state.active).toBe(-1);
		expect(down.pick).toBeNull();
		const enter = comboStep(openAt(-1), { type: "enter" }, 0);
		expect(enter.pick).toBeNull();
		expect(enter.preventDefault).toBe(false);
		const clamped = comboStep(openAt(3), { type: "optionsChanged" }, 0);
		expect(clamped.state).toEqual({ open: false, active: -1 });
	});

	it("keyboard moves, wraps, picks and closes", () => {
		const opts = { listId: "l", optionId, count: 3 };

		const down = comboStep(closed, { type: "arrowDown" }, 3);
		expect(down.state).toEqual({ open: true, active: 0 });
		expect(down.preventDefault).toBe(true);

		let s = down.state;
		s = comboStep(s, { type: "arrowDown" }, 3).state;
		expect(s.active).toBe(1);
		s = comboStep(s, { type: "arrowDown" }, 3).state;
		expect(s.active).toBe(2);
		s = comboStep(s, { type: "arrowDown" }, 3).state;
		expect(s.active).toBe(0); // wraps to first

		const up = comboStep(openAt(0), { type: "arrowUp" }, 3);
		expect(up.state.active).toBe(2); // wraps to last
		expect(comboStep(closed, { type: "arrowUp" }, 3).state).toEqual({
			open: true,
			active: 2,
		});

		expect(comboStep(openAt(0), { type: "end" }, 3).state.active).toBe(2);
		expect(comboStep(openAt(2), { type: "home" }, 3).state.active).toBe(0);

		expect(comboAria(openAt(1), opts)).toEqual({
			role: "combobox",
			"aria-autocomplete": "list",
			"aria-expanded": "true",
			"aria-controls": "l",
			"aria-activedescendant": "opt-1",
		});
		expect(comboAria(closed, opts)["aria-expanded"]).toBe("false");

		const enter = comboStep(openAt(1), { type: "enter" }, 3);
		expect(enter.pick).toBe(1);
		expect(enter.state.open).toBe(false);
		expect(enter.preventDefault).toBe(true);

		const esc = comboStep(openAt(1), { type: "escape" }, 3);
		expect(esc.state).toEqual({ open: false, active: -1 });
		expect(esc.preventDefault).toBe(true);
		expect(comboStep(closed, { type: "escape" }, 3).preventDefault).toBe(false);

		expect(comboStep(openAt(1), { type: "blur" }, 3).state.open).toBe(false);
	});

	it("enter without a highlighted option keeps free text", () => {
		const typed = comboStep(closed, { type: "input" }, 5);
		expect(typed.state).toEqual({ open: true, active: -1 });
		const enter = comboStep(typed.state, { type: "enter" }, 5);
		expect(enter.pick).toBeNull();
		expect(enter.preventDefault).toBe(false);
		expect(comboStep(closed, { type: "focus" }, 5).state).toEqual(closed);
	});

	it("special characters in the query are safe", () => {
		const options: Option[] = [
			{ value: "1", label: "Hotel (Central)" },
			{ value: "2", label: "Plain Hotel" },
		];
		const plain = filterOptions(options, "central").map((o) => o.value);
		expect(plain).toEqual(["1"]);
		// regex metacharacters are not interpreted: they only add noise that folding removes
		for (const q of ["central (", "central [", "central *", "central \\"]) {
			expect(() => filterOptions(options, q)).not.toThrow();
			expect(filterOptions(options, q).map((o) => o.value)).toEqual(plain);
		}
		// a query made only of symbols folds to empty and returns the plain list
		expect(() => filterOptions(options, "[*+?(")).not.toThrow();
		expect(filterOptions(options, "[*+?(")).toEqual(filterOptions(options, ""));
	});
});
