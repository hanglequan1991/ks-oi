// Bill page entry (technical design 18.5). Connects the pure modules to the DOM.
// The only network calls are the two GET calls made by api.ts. The draft is kept
// in the browser through storage.ts. Nothing from the bill is sent anywhere.
// Imports only from its own folder and src/domain/ (design 3.4).

import { type BillConfig, parseBillConfig } from "./config";
import { type BillState, type RoomOption, createInitialState, createStore } from "./state";
import { type BillApi, type HotelOption, createBillApi, createSuggester } from "./api";
import {
	type StorageLike,
	clearDraft,
	createSaver,
	isBlankDraft,
	loadDraft,
	saveDraft,
} from "./storage";
import {
	type ComboEvent,
	type ComboState,
	type Option,
	comboAria,
	comboStep,
	filterOptions,
} from "./combobox";
import { type Labels, buildView } from "./viewModel";
import { type RowHandlers, patchRow, renderOptions, renderRows, renderSummary } from "./render";
import { dateLabel, nightsText, priceLabel, reformatPriceInput } from "./format";

type Cell = "hotel" | "room";

const FALLBACK = "Could not start the billing page";
const SUGGEST_DELAY_MS = 250;
const SAVE_DELAY_MS = 300;

const KEY_EVENTS: Record<string, ComboEvent> = {
	ArrowDown: { type: "arrowDown" },
	ArrowUp: { type: "arrowUp" },
	Enter: { type: "enter" },
	Escape: { type: "escape" },
};

const timers = {
	set: (fn: () => void, ms: number): unknown => window.setTimeout(fn, ms),
	clear: (h: unknown): void => window.clearTimeout(h as number),
};

function makeId(): string {
	return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Storage or null when the browser blocks it. */
function draftStorage(): StorageLike | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function safeId(s: string): string {
	return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

function listIdOf(rowId: string, cell: Cell): string {
	return `bill-${safeId(rowId)}-${cell}-list`;
}

function optionIdOf(rowId: string, cell: Cell, i: number): string {
	return `bill-${safeId(rowId)}-${cell}-opt${i}`;
}

function rowOf(el: Element): string | null {
	return el.closest<HTMLElement>("[data-row-id]")?.dataset.rowId ?? null;
}

/** The row and cell an element belongs to, or null outside a combobox cell. */
function comboAt(el: Element): { rowId: string; cell: Cell } | null {
	const rowId = rowOf(el);
	if (rowId === null) return null;
	if (el.closest(".c-hotel")) return { rowId, cell: "hotel" };
	if (el.closest(".c-room")) return { rowId, cell: "room" };
	return null;
}

function fieldOf(e: Event): HTMLInputElement | HTMLTextAreaElement {
	return e.target as HTMLInputElement | HTMLTextAreaElement;
}

function hotelOption(h: HotelOption): Option {
	return { value: h.slug, label: h.name, ...(h.city ? { meta: h.city } : {}) };
}

function mount(app: HTMLElement, config: BillConfig): void {
	const labels: Labels = config.labels;
	const lang = config.lang;
	const text = (key: string): string => labels[key] ?? "";

	const api: BillApi = createBillApi({ fetch: window.fetch.bind(window), lang });
	const suggester = createSuggester({ api, delayMs: SUGGEST_DELAY_MS, timers });
	const storage = draftStorage();
	const roomCache = new Map<string, RoomOption[]>();
	const rowsHost = document.createElement("div");
	rowsHost.classList.add("bill-rows");
	app.appendChild(rowsHost);

	const statusEl = document.querySelector<HTMLElement>("[data-bill-status]");
	const dateEl = document.querySelector<HTMLElement>("[data-bill-date]");
	const setStatus = (s: string): void => {
		if (statusEl) statusEl.textContent = s;
	};

	// Draft: start from the stored rows when there are any, otherwise one empty row.
	const store = createStore(createInitialState(makeId()));
	const stored = loadDraft(storage, makeId);
	if (stored) store.dispatch({ type: "hydrate", rows: stored.rows, fallbackId: makeId() });
	const restored = stored !== null && stored.rows.length > 0 && !isBlankDraft(stored.rows);

	const saver = createSaver(
		() => {
			if (saveDraft(storage, store.get().rows, new Date())) setStatus(text("draftSaved"));
		},
		SAVE_DELAY_MS,
		timers,
	);

	let cs: ComboState = { open: false, active: -1 };
	let hotelOpts: Option[] = [];
	let shape = "";
	let lastRows: unknown = null;

	function optionsFor(rowId: string, cell: Cell): Option[] {
		if (cell === "hotel") return hotelOpts;
		const row = store.get().rows.find((r) => r.id === rowId);
		if (!row || row.hotelSlug === null) return [];
		const rooms = roomCache.get(row.hotelSlug) ?? [];
		const options = rooms.map((r) => ({
			value: r.id,
			label: r.name,
			meta: priceLabel(r.price, lang),
		}));
		return filterOptions(options, row.roomText);
	}

	function inputFor(rowId: string, cell: Cell): HTMLInputElement | null {
		return rowsHost.querySelector<HTMLInputElement>(
			`[data-row-id="${CSS.escape(rowId)}"] .c-${cell} input`,
		);
	}

	/** Paints every combobox from the state. rebuild=false only moves the highlight. */
	function refreshCombo(rebuild = true): void {
		const open = store.get().open;
		if (!open) cs = { open: false, active: -1 };
		for (const combo of rowsHost.querySelectorAll<HTMLElement>(".combo")) {
			const input = combo.querySelector<HTMLInputElement>("input");
			const list = combo.querySelector<HTMLElement>(".combo-list");
			const at = input ? comboAt(input) : null;
			if (!input || !list || !at) continue;
			const isOpen = open !== null && at.rowId === open.rowId && at.cell === open.cell;
			if (!isOpen) {
				list.hidden = true;
				input.setAttribute("aria-expanded", "false");
				input.removeAttribute("aria-activedescendant");
				continue;
			}
			const opts = optionsFor(at.rowId, at.cell);
			cs = comboStep(cs, { type: "optionsChanged" }, opts.length).state;
			const idFor = (i: number): string => optionIdOf(at.rowId, at.cell, i);
			if (rebuild) renderOptions(document, list, opts, cs.active, idFor);
			Array.from(list.children).forEach((child, i) => {
				child.setAttribute("aria-selected", String(i === cs.active));
			});
			list.hidden = !(cs.open && opts.length > 0);
			const aria = comboAria(cs, {
				listId: listIdOf(at.rowId, at.cell),
				optionId: idFor,
				count: opts.length,
			});
			for (const [k, v] of Object.entries(aria)) {
				if (v === "") input.removeAttribute(k);
				else input.setAttribute(k, v);
			}
		}
	}

	const handlers: RowHandlers = {
		onHotelInput: (rowId, e) => {
			const value = fieldOf(e).value;
			store.dispatch({ type: "setHotelText", rowId, text: value });
			activate(rowId, "hotel");
			cs = { open: true, active: -1 };
			suggester.request(
				value,
				(items) => {
					hotelOpts = items.map(hotelOption);
					cs = { open: true, active: -1 };
					refreshCombo();
				},
				() => {
					hotelOpts = [];
					refreshCombo();
				},
			);
		},
		onHotelKey: (rowId, e) => onKey(rowId, "hotel", e as KeyboardEvent),
		onHotelFocus: (rowId) => openFocus(rowId, "hotel"),
		onRoomInput: (rowId, e) => {
			store.dispatch({ type: "setRoomText", rowId, text: fieldOf(e).value });
			activate(rowId, "room");
			cs = { open: true, active: -1 };
			refreshCombo();
		},
		onRoomKey: (rowId, e) => onKey(rowId, "room", e as KeyboardEvent),
		onRoomFocus: (rowId) => openFocus(rowId, "room"),
		onNights: (rowId, e) => {
			const input = fieldOf(e) as HTMLInputElement;
			const r = nightsText(input.value);
			input.value = r.text;
			if (r.value !== null) store.dispatch({ type: "setNights", rowId, nights: r.value });
		},
		onPrice: (rowId, e) => {
			const input = fieldOf(e) as HTMLInputElement;
			const caret = input.selectionStart ?? input.value.length;
			const r = reformatPriceInput(input.value, caret, lang);
			input.value = r.text;
			input.setSelectionRange(r.caret, r.caret);
			store.dispatch({ type: "setPrice", rowId, value: r.value });
		},
		onReset: (rowId) => store.dispatch({ type: "resetPrice", rowId }),
		onNote: (rowId, e) => store.dispatch({ type: "setNote", rowId, note: fieldOf(e).value }),
		onRemove: (rowId) => store.dispatch({ type: "removeRow", rowId }),
	};

	function render(state: BillState): void {
		const view = buildView(state, labels, lang);
		const newShape = state.rows.map((r) => r.id).join("\n");
		if (newShape !== shape) {
			shape = newShape;
			renderRows(document, rowsHost, view, labels, handlers);
		} else {
			view.rows.forEach((rv, i) => {
				const el = rowsHost.children[i];
				if (el instanceof HTMLElement) patchRow(document, el, rv);
			});
		}
		renderSummary(document, view, labels);
		refreshCombo();
	}

	function activate(rowId: string, cell: Cell): void {
		const cur = store.get().open;
		if (cur && cur.rowId === rowId && cur.cell === cell) return;
		if (cell === "hotel") hotelOpts = [];
		cs = { open: false, active: -1 };
		store.dispatch({ type: "openCombo", rowId, cell });
	}

	function openFocus(rowId: string, cell: Cell): void {
		activate(rowId, cell);
		cs = { open: true, active: -1 };
		refreshCombo();
	}

	function closeCombo(): void {
		cs = { open: false, active: -1 };
		if (store.get().open) store.dispatch({ type: "closeCombo" });
	}

	function pickOption(rowId: string, cell: Cell, opt: Option): void {
		if (cell === "hotel") {
			store.dispatch({ type: "pickHotel", rowId, slug: opt.value, name: opt.label });
			loadRooms(opt.value);
		} else {
			const row = store.get().rows.find((r) => r.id === rowId);
			const room =
				row?.hotelSlug != null
					? roomCache.get(row.hotelSlug)?.find((r) => r.id === opt.value)
					: undefined;
			if (!room) return;
			store.dispatch({
				type: "pickRoom",
				rowId,
				roomId: room.id,
				name: room.name,
				price: room.price,
			});
		}
		// The input keeps focus, so patchRow would skip it: write the picked text here.
		const input = inputFor(rowId, cell);
		if (input) input.value = opt.label;
		closeCombo();
	}

	function onKey(rowId: string, cell: Cell, e: KeyboardEvent): void {
		const ev = KEY_EVENTS[e.key];
		if (!ev) return;
		const opts = optionsFor(rowId, cell);
		const res = comboStep(cs, ev, opts.length);
		cs = res.state;
		if (res.preventDefault) e.preventDefault();
		if (res.pick !== null) {
			const opt = opts[res.pick];
			if (opt) pickOption(rowId, cell, opt);
			return;
		}
		refreshCombo();
	}

	function loadRooms(slug: string): void {
		api.loadRooms(slug).then(
			(rooms) => {
				roomCache.set(slug, rooms);
				store.dispatch({ type: "applyRooms", slug, rooms });
			},
			// A failed load keeps the stored values; nothing alarming is shown.
			() => undefined,
		);
	}

	// Delegated events for the row list: picks, hover, blur and the night default.
	rowsHost.addEventListener("mousedown", (e) => {
		const li = (e.target as Element).closest<HTMLElement>(".combo-option");
		if (!li) return;
		// Keep focus in the input so the blur does not drop the pick.
		e.preventDefault();
		const at = comboAt(li);
		const list = li.parentElement;
		if (!at || !list) return;
		const opt = optionsFor(at.rowId, at.cell)[Array.from(list.children).indexOf(li)];
		if (opt) pickOption(at.rowId, at.cell, opt);
	});

	rowsHost.addEventListener("mouseover", (e) => {
		const li = (e.target as Element).closest<HTMLElement>(".combo-option");
		const list = li?.parentElement;
		const open = store.get().open;
		if (!li || !list || !open) return;
		const at = comboAt(li);
		if (!at || at.rowId !== open.rowId || at.cell !== open.cell) return;
		const index = Array.from(list.children).indexOf(li);
		cs = comboStep(cs, { type: "hover", index }, optionsFor(at.rowId, at.cell).length).state;
		refreshCombo(false);
	});

	rowsHost.addEventListener("focusout", (e) => {
		const field = e.target;
		if (!(field instanceof HTMLInputElement)) return;
		const at = comboAt(field);
		const open = store.get().open;
		if (at && open && at.rowId === open.rowId && at.cell === open.cell) closeCombo();
		if (field.closest(".c-night") && field.value.trim() === "") {
			field.value = "1";
			const rowId = rowOf(field);
			if (rowId !== null) store.dispatch({ type: "setNights", rowId, nights: 1 });
		}
	});

	// Store changes: render; save the draft only when the rows changed.
	lastRows = store.get().rows;
	store.subscribe((state) => {
		render(state);
		if (state.rows !== lastRows) {
			lastRows = state.rows;
			saver.schedule();
		}
	});
	render(store.get());

	const slugs = new Set<string>();
	for (const row of store.get().rows) {
		if (row.hotelSlug !== null) slugs.add(row.hotelSlug);
	}
	for (const slug of slugs) loadRooms(slug);
	if (restored) setStatus(text("draftRestored"));

	document.querySelector('[data-action="add"]')?.addEventListener("click", () => {
		store.dispatch({ type: "addRow", id: makeId() });
	});
	document.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
		if (window.confirm(text("clearConfirm"))) {
			store.dispatch({ type: "clearAll", id: makeId() });
		}
	});
	document.querySelector('[data-action="clear-draft"]')?.addEventListener("click", () => {
		saver.cancel();
		clearDraft(storage);
		store.dispatch({ type: "clearAll", id: makeId() });
		setStatus("");
	});
	document.querySelector('[data-action="print"]')?.addEventListener("click", () => {
		if (dateEl) dateEl.textContent = dateLabel(new Date(), lang);
		window.print();
	});
	window.addEventListener("pagehide", () => saver.flush());
}

function start(): void {
	const app = document.getElementById("bill-app");
	if (!app) return;
	const config = parseBillConfig(document.getElementById("bill-config")?.textContent ?? null);
	if (!config) {
		app.textContent = FALLBACK;
		return;
	}
	mount(app, config);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", start);
} else {
	start();
}
