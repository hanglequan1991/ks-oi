// DOM builder for the bill page (technical design 18.5). Not unit tested; the
// guard test (TASK-36) and the Playwright TCs cover it. User text reaches the
// DOM only through textContent, value and setAttribute. Never innerHTML.
// Imports only from its own folder (design 3.4).

import type { BillView, RowView, Labels } from "./viewModel";

export interface RowHandlers {
	onHotelInput: (rowId: string, event: Event) => void;
	onHotelKey: (rowId: string, event: Event) => void;
	onHotelFocus: (rowId: string, event: Event) => void;
	onRoomInput: (rowId: string, event: Event) => void;
	onRoomKey: (rowId: string, event: Event) => void;
	onRoomFocus: (rowId: string, event: Event) => void;
	onNights: (rowId: string, event: Event) => void;
	onPrice: (rowId: string, event: Event) => void;
	onReset: (rowId: string, event: Event) => void;
	onNote: (rowId: string, event: Event) => void;
	onRemove: (rowId: string, event: Event) => void;
}

// Every class name this file uses. All of them must exist in public/bill.css (TASK-33).
const C = {
	item: "bill-item",
	row: "bill-row",
	note: "bill-note",
	isEmpty: "is-empty",
	cellLabel: "cell-label",
	index: "c-index",
	hotel: "c-hotel",
	room: "c-room",
	night: "c-night",
	price: "c-price",
	total: "c-total",
	remove: "c-remove",
	combo: "combo",
	comboList: "combo-list",
	comboOption: "combo-option",
	badgeEdited: "badge-edited",
	btnReset: "btn-reset",
	printOnly: "print-only",
	noteLabel: "note-label",
	noteField: "note-field",
} as const;

// Handlers of each rendered row item, so patchRow can create controls later.
const bound = new WeakMap<HTMLElement, RowHandlers>();

function text(labels: Labels, key: string): string {
	return labels[key] ?? "";
}

function makeCell(doc: Document, cls: string, labelText: string): HTMLDivElement {
	const cell = doc.createElement("div");
	cell.classList.add(cls);
	const label = doc.createElement("span");
	label.classList.add(C.cellLabel);
	label.textContent = labelText;
	cell.appendChild(label);
	return cell;
}

function makeValue(doc: Document, field: string, value: string): HTMLSpanElement {
	const span = doc.createElement("span");
	span.setAttribute("data-field", field);
	span.textContent = value;
	return span;
}

function makeMirror(doc: Document, value: string): HTMLSpanElement {
	const mirror = doc.createElement("span");
	mirror.classList.add(C.printOnly);
	mirror.textContent = value;
	return mirror;
}

function makeInput(
	doc: Document,
	attrs: { aria: string; placeholder: string; inputmode?: string },
	value: string,
): HTMLInputElement {
	const input = doc.createElement("input");
	input.type = "text";
	input.autocomplete = "off";
	input.setAttribute("aria-label", attrs.aria);
	input.setAttribute("placeholder", attrs.placeholder);
	if (attrs.inputmode) input.setAttribute("inputmode", attrs.inputmode);
	input.value = value;
	return input;
}

function makeCombo(
	doc: Document,
	wrapper: HTMLDivElement,
	input: HTMLInputElement,
	listLabel: string,
): void {
	const combo = doc.createElement("div");
	combo.classList.add(C.combo);
	const list = doc.createElement("ul");
	list.classList.add(C.comboList);
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-label", listLabel);
	combo.appendChild(input);
	combo.appendChild(makeMirror(doc, input.value));
	combo.appendChild(list);
	wrapper.appendChild(combo);
}

function buildRow(doc: Document, view: RowView, labels: Labels, h: RowHandlers): HTMLElement {
	const id = view.id;
	const item = doc.createElement("div");
	item.classList.add(C.item);
	item.setAttribute("data-row-id", id);
	bound.set(item, h);

	const row = doc.createElement("div");
	row.classList.add(C.row);

	const index = makeCell(doc, C.index, text(labels, "colIndex"));
	index.appendChild(makeValue(doc, "index", view.indexText));
	row.appendChild(index);

	// Hotel combo.
	const hotel = makeCell(doc, C.hotel, text(labels, "colHotel"));
	const hotelInput = makeInput(
		doc,
		{ aria: view.hotelAria, placeholder: text(labels, "hotelPlaceholder") },
		view.hotelText,
	);
	hotelInput.addEventListener("input", (e) => h.onHotelInput(id, e));
	hotelInput.addEventListener("keydown", (e) => h.onHotelKey(id, e));
	hotelInput.addEventListener("focus", (e) => h.onHotelFocus(id, e));
	makeCombo(doc, hotel, hotelInput, text(labels, "listboxHotel"));
	row.appendChild(hotel);

	// Room combo. data-has-list tells the wiring whether a room list exists.
	const room = makeCell(doc, C.room, text(labels, "colRoom"));
	room.setAttribute("data-has-list", String(view.roomHasList));
	const roomInput = makeInput(
		doc,
		{ aria: view.roomAria, placeholder: text(labels, "roomPlaceholder") },
		view.roomText,
	);
	roomInput.addEventListener("input", (e) => h.onRoomInput(id, e));
	roomInput.addEventListener("keydown", (e) => h.onRoomKey(id, e));
	roomInput.addEventListener("focus", (e) => h.onRoomFocus(id, e));
	makeCombo(doc, room, roomInput, text(labels, "listboxRoom"));
	row.appendChild(room);

	// Nights.
	const night = makeCell(doc, C.night, text(labels, "colNight"));
	const nightInput = makeInput(
		doc,
		{ aria: view.nightAria, placeholder: "", inputmode: "numeric" },
		view.nightsText,
	);
	nightInput.addEventListener("input", (e) => h.onNights(id, e));
	night.appendChild(nightInput);
	night.appendChild(makeMirror(doc, view.nightsText));
	row.appendChild(night);

	// Price, with the edited badge and the reset button.
	const price = makeCell(doc, C.price, text(labels, "colPricing"));
	const priceInput = makeInput(
		doc,
		{ aria: view.priceAria, placeholder: text(labels, "pricePlaceholder"), inputmode: "numeric" },
		view.priceText,
	);
	priceInput.addEventListener("input", (e) => h.onPrice(id, e));
	price.appendChild(priceInput);
	price.appendChild(makeMirror(doc, view.priceText));
	if (view.showReset) appendMarkers(doc, price, labels, id, h);
	row.appendChild(price);

	row.appendChild(makeCell(doc, C.total, text(labels, "colTotal")));
	row.lastElementChild?.appendChild(makeValue(doc, "total", view.totalText));

	// Remove.
	const remove = makeCell(doc, C.remove, "");
	const button = doc.createElement("button");
	button.type = "button";
	button.textContent = "×";
	button.addEventListener("click", (e) => h.onRemove(id, e));
	remove.appendChild(button);
	row.appendChild(remove);

	item.appendChild(row);
	item.appendChild(buildNote(doc, view, labels, h));
	applyRowState(item, view);
	return item;
}

function appendMarkers(
	doc: Document,
	price: HTMLElement,
	labels: Labels,
	rowId: string,
	h: RowHandlers,
): void {
	const badge = doc.createElement("span");
	badge.classList.add(C.badgeEdited);
	badge.textContent = text(labels, "edited");
	price.appendChild(badge);

	const reset = doc.createElement("button");
	reset.type = "button";
	reset.classList.add(C.btnReset);
	reset.textContent = text(labels, "useDefault");
	reset.addEventListener("click", (e) => h.onReset(rowId, e));
	price.appendChild(reset);
}

function buildNote(doc: Document, view: RowView, labels: Labels, h: RowHandlers): HTMLElement {
	const note = doc.createElement("div");
	note.classList.add(C.note);

	const label = doc.createElement("span");
	label.classList.add(C.noteLabel);
	label.textContent = text(labels, "noteLabel");
	note.appendChild(label);

	const field = doc.createElement("textarea");
	field.classList.add(C.noteField);
	field.setAttribute("maxlength", "500");
	field.setAttribute("aria-label", view.noteAria);
	field.setAttribute("placeholder", text(labels, "notePlaceholder"));
	field.value = view.noteText;
	field.addEventListener("input", (e) => h.onNote(view.id, e));
	note.appendChild(field);
	note.appendChild(makeMirror(doc, view.noteText));
	return note;
}

/** Classes and attributes that depend on the view, applied on build and patch. */
function applyRowState(item: HTMLElement, view: RowView): void {
	const note = item.querySelector<HTMLElement>(`.${C.note}`);
	note?.classList.toggle(C.isEmpty, view.noteEmpty);
	const room = item.querySelector<HTMLElement>(`.${C.room}`);
	room?.setAttribute("data-has-list", String(view.roomHasList));
	const button = item.querySelector<HTMLButtonElement>(`.${C.remove} button`);
	if (button) {
		button.disabled = !view.canRemove;
		button.setAttribute("aria-label", view.removeAria);
	}
}

/** Full rebuild of the row list (rows added, removed, cleared, hydrated, picked). */
export function renderRows(
	doc: Document,
	host: HTMLElement,
	view: BillView,
	labels: Labels,
	h: RowHandlers,
): void {
	host.replaceChildren();
	for (const row of view.rows) {
		host.appendChild(buildRow(doc, row, labels, h));
	}
}

/** Only the values, totals, markers and mirrors of one row. Focused inputs keep their value. */
export function patchRow(doc: Document, rowEl: HTMLElement, row: RowView): void {
	const labelsHandlers = bound.get(rowEl);

	const setInput = (cls: string, value: string, aria: string): void => {
		const input = rowEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.${cls} input, .${cls} textarea`);
		if (!input) return;
		if (doc.activeElement !== input) input.value = value;
		input.setAttribute("aria-label", aria);
		input.nextElementSibling?.textContent !== undefined &&
			(input.nextElementSibling!.textContent = value);
	};

	setInput(C.hotel, row.hotelText, row.hotelAria);
	setInput(C.room, row.roomText, row.roomAria);
	setInput(C.night, row.nightsText, row.nightAria);
	setInput(C.price, row.priceText, row.priceAria);

	const priceCell = rowEl.querySelector<HTMLElement>(`.${C.price}`);
	if (priceCell) {
		const badge = priceCell.querySelector(`.${C.badgeEdited}`);
		const reset = priceCell.querySelector(`.${C.btnReset}`);
		if (row.showReset && (!badge || !reset) && labelsHandlers) {
			// Markers are created on demand with the handlers stored at build time.
			badge?.remove();
			reset?.remove();
			const fresh = doc.createElement("span");
			fresh.classList.add(C.badgeEdited);
			fresh.textContent = "";
			priceCell.appendChild(fresh);
			const btn = doc.createElement("button");
			btn.type = "button";
			btn.classList.add(C.btnReset);
			btn.addEventListener("click", (e) => labelsHandlers.onReset(row.id, e));
			priceCell.appendChild(btn);
		} else if (!row.showReset) {
			badge?.remove();
			reset?.remove();
		}
	}

	const note = rowEl.querySelector<HTMLTextAreaElement>(`.${C.noteField}`);
	if (note) {
		if (doc.activeElement !== note) note.value = row.noteText;
		note.setAttribute("aria-label", row.noteAria);
	}
	const mirror = note?.nextElementSibling;
	if (mirror) mirror.textContent = row.noteText;

	const total = rowEl.querySelector<HTMLElement>('[data-field="total"]');
	if (total) total.textContent = row.totalText;
	const index = rowEl.querySelector<HTMLElement>('[data-field="index"]');
	if (index) index.textContent = row.indexText;

	applyRowState(rowEl, row);
}

/** Grand total, add button state and the limit hint. */
export function renderSummary(doc: Document, view: BillView, labels: Labels): void {
	void labels;
	const total = doc.querySelector<HTMLElement>("[data-bill-summary]");
	if (total) total.textContent = view.grandTotalText;
	const add = doc.querySelector<HTMLButtonElement>('[data-action="add"]');
	if (add) add.disabled = !view.canAdd;
	const hint = doc.querySelector<HTMLElement>("[data-add-hint]");
	if (hint) hint.textContent = view.addHint;
}

/** Suggestion list for a combo: one li per option, aria-selected on the active one. */
export function renderOptions(
	doc: Document,
	list: HTMLElement,
	options: { value: string; label: string; meta?: string }[],
	activeIndex: number,
	idFor: (i: number) => string,
): void {
	list.replaceChildren();
	options.forEach((opt, i) => {
		const li = doc.createElement("li");
		li.classList.add(C.comboOption);
		li.id = idFor(i);
		li.setAttribute("role", "option");
		li.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
		li.setAttribute("data-value", opt.value);
		li.textContent = opt.label;
		if (opt.meta !== undefined) {
			const meta = doc.createElement("span");
			meta.setAttribute("data-field", "meta");
			meta.textContent = opt.meta;
			li.appendChild(meta);
		}
		list.appendChild(li);
	});
}
