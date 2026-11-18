// Bill page state: a pure reducer plus a tiny store (technical design 18.5).
// No DOM, no fetch, no localStorage, no random ids: ids come from the actions.
// Imports only from src/domain/ (design 3.4).

import {
	MAX_ROWS,
	MAX_NOTE,
	MAX_PRICE,
	MIN_NIGHTS,
	clampNights,
	lineTotal,
} from "../../domain/money";

export interface BillRow {
	id: string;
	hotelText: string;
	hotelSlug: string | null;
	roomText: string;
	roomId: string | null;
	defaultPrice: number | null;
	price: number | null;
	priceEdited: boolean;
	nights: number;
	note: string;
}

export interface RoomOption {
	id: string;
	name: string;
	price: number | null; // final price from the API
}

export interface BillState {
	rows: BillRow[];
	open: { rowId: string; cell: "hotel" | "room" } | null;
}

export type BillAction =
	| { type: "addRow"; id: string }
	| { type: "removeRow"; rowId: string }
	| { type: "clearAll"; id: string }
	| { type: "setHotelText"; rowId: string; text: string }
	| { type: "pickHotel"; rowId: string; slug: string; name: string }
	| { type: "setRoomText"; rowId: string; text: string }
	| { type: "pickRoom"; rowId: string; roomId: string; name: string; price: number | null }
	| { type: "setNights"; rowId: string; nights: number }
	| { type: "setPrice"; rowId: string; value: number | null }
	| { type: "resetPrice"; rowId: string }
	| { type: "setNote"; rowId: string; note: string }
	| { type: "applyRooms"; slug: string; rooms: RoomOption[] }
	| { type: "hydrate"; rows: BillRow[]; fallbackId: string }
	| { type: "openCombo"; rowId: string; cell: "hotel" | "room" }
	| { type: "closeCombo" };

export function emptyRow(id: string): BillRow {
	return {
		id,
		hotelText: "",
		hotelSlug: null,
		roomText: "",
		roomId: null,
		defaultPrice: null,
		price: null,
		priceEdited: false,
		nights: MIN_NIGHTS,
		note: "",
	};
}

export function createInitialState(id: string): BillState {
	return { rows: [emptyRow(id)], open: null };
}

export function effectivePrice(row: BillRow): number {
	return row.priceEdited ? (row.price ?? 0) : (row.defaultPrice ?? 0);
}

export function rowTotal(row: BillRow): number | null {
	const missing = row.priceEdited ? row.price === null : row.defaultPrice === null;
	if (missing) return null;
	return lineTotal(row.nights, effectivePrice(row));
}

export function billTotal(state: BillState): number {
	let total = 0;
	for (const row of state.rows) {
		total += rowTotal(row) ?? 0;
	}
	return total;
}

export function canAddRow(s: BillState): boolean {
	return s.rows.length < MAX_ROWS;
}

export function canRemoveRow(s: BillState): boolean {
	return s.rows.length > 1;
}

/** Applies `fn` to the row with `rowId`; unknown id returns the state unchanged. */
function updateRow(state: BillState, rowId: string, fn: (row: BillRow) => BillRow): BillState {
	const index = state.rows.findIndex((r) => r.id === rowId);
	if (index < 0) return state;
	const rows = state.rows.slice();
	rows[index] = fn(state.rows[index]);
	return { ...state, rows };
}

const CLEARED_ROOM = { roomText: "", roomId: null, defaultPrice: null } as const;

export function reduce(state: BillState, action: BillAction): BillState {
	switch (action.type) {
		case "addRow": {
			if (!canAddRow(state)) return state;
			return { ...state, rows: [...state.rows, emptyRow(action.id)] };
		}
		case "removeRow": {
			if (!canRemoveRow(state)) return state;
			if (!state.rows.some((r) => r.id === action.rowId)) return state;
			const open = state.open && state.open.rowId === action.rowId ? null : state.open;
			return { rows: state.rows.filter((r) => r.id !== action.rowId), open };
		}
		case "clearAll":
			return { rows: [emptyRow(action.id)], open: null };

		case "setHotelText":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				hotelText: action.text,
				hotelSlug: null,
				...(row.hotelSlug !== null ? CLEARED_ROOM : {}),
			}));
		case "pickHotel":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				hotelText: action.name,
				hotelSlug: action.slug,
				...(row.hotelSlug !== action.slug ? CLEARED_ROOM : {}),
			}));
		case "setRoomText":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				roomText: action.text,
				roomId: null,
				defaultPrice: null,
			}));
		case "pickRoom":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				roomText: action.name,
				roomId: action.roomId,
				defaultPrice: action.price,
			}));

		case "setNights":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				nights: Math.max(MIN_NIGHTS, clampNights(action.nights)),
			}));
		case "setPrice":
			return updateRow(state, action.rowId, (row) => {
				if (action.value === null) {
					return { ...row, price: null, priceEdited: row.defaultPrice !== null };
				}
				const value = Math.min(action.value, MAX_PRICE);
				if (value === row.defaultPrice) {
					return { ...row, price: null, priceEdited: false };
				}
				return { ...row, price: value, priceEdited: true };
			});
		case "resetPrice":
			return updateRow(state, action.rowId, (row) => ({ ...row, price: null, priceEdited: false }));
		case "setNote":
			return updateRow(state, action.rowId, (row) => ({
				...row,
				note: Array.from(action.note).slice(0, MAX_NOTE).join(""),
			}));

		case "applyRooms":
			return {
				...state,
				rows: state.rows.map((row) => {
					if (row.hotelSlug !== action.slug) return row;
					const room = row.roomId === null ? undefined : action.rooms.find((r) => r.id === row.roomId);
					if (room) return { ...row, defaultPrice: room.price };
					return { ...row, roomId: null, defaultPrice: null };
				}),
			};

		case "hydrate": {
			const rows = action.rows.slice(0, MAX_ROWS);
			return {
				rows: rows.length > 0 ? rows : [emptyRow(action.fallbackId)],
				open: null,
			};
		}
		case "openCombo":
			return { ...state, open: { rowId: action.rowId, cell: action.cell } };
		case "closeCombo":
			return { ...state, open: null };
	}
}

export function createStore(initial: BillState): {
	get(): BillState;
	dispatch(a: BillAction): void;
	subscribe(fn: (s: BillState) => void): () => void;
} {
	let current = initial;
	const listeners = new Set<(s: BillState) => void>();
	return {
		get: () => current,
		dispatch(action) {
			current = reduce(current, action);
			for (const fn of [...listeners]) fn(current);
		},
		subscribe(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
	};
}
