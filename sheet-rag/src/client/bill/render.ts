// DOM builder for the bill page (technical design 18.5). Not unit tested; the
// guard test (TASK-36) and the Playwright TCs cover it. User text reaches the
// DOM only through textContent, value and setAttribute. No HTML string injection.
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
	isEdited: "is-edited",
	noteMarkers: "note-markers",
	rowTitle: "row-title",
	badgeEdited: "badge-edited",
	btnReset: "btn-reset",
	printOnly: "print-only",
	noteLabel: "note-label",
	noteField: "note-field",
} as const;

interface Bound {
	handlers: RowHandlers;
	labels: Labels;
}

// Handlers and labels of each rendered row item, so patchRow can create controls later.
const bound = new WeakMap<HTMLElement, Bound>();

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

/** Print mirror: always the next sibling of the control it mirrors. */
function makeMirror(doc: Document, value: string): HTMLSpanElement {
	const mirror = doc.createElement("span");
	mirror.classList.add(C.printOnly);
	mirror.textContent = value;
	return mirror;
}

function makeInput(
	doc: Document,
	aria: string,
	placeholder: string,
	value: string,
	inputmode?: string,
): HTMLInputElement {
	const input = doc.createElement("input");
	input.type = "text";
	input.autocomplete = "off";
	input.setAttribute("aria-label", aria);
	if (placeholder) input.setAttribute("placeholder", placeholder);
	if (inputmode) input.setAttribute("inputmode", inputmode);
	input.value = value;
	return input;
}

/** Input, its mirror and the (empty) listbox, inside a .combo wrapper. */
function makeCombo(
	doc: Document,
	cell: HTMLElement,
	input: HTMLInputElement,
	listLabel: string,
	hint?: string,
): void {
	const combo = doc.createElement("div");
	combo.classList.add(C.combo);
	const list = doc.createElement("ul");
	list.classList.add(C.comboList);
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-label", listLabel);
	if (hint) list.setAttribute("data-hint", hint);
	combo.appendChild(input);
	combo.appendChild(makeMirror(doc, input.value));
	combo.appendChild(list);
	cell.appendChild(combo);
}

/** Edited badge and reset button, filled into the note block's markers (empty unless showReset). */
function fillMarkers(doc: Document, markers: HTMLElement, row: RowView, info: Bound): void {
	markers.replaceChildren();
	if (!row.showReset) return;

	const badge = doc.createElement("span");
	badge.classList.add(C.badgeEdited);
	badge.textContent = text(info.labels, "edited");
	markers.appendChild(badge);

	const reset = doc.createElement("button");
	reset.type = "button";
	reset.classList.add(C.btnReset);
	reset.textContent = row.resetText;
	reset.addEventListener("click", (e) => info.handlers.onReset(row.id, e));
	markers.appendChild(reset);
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
	if (labels.notePlaceholder) field.setAttribute("placeholder", labels.notePlaceholder);
	field.value = view.noteText;
	field.addEventListener("input", (e) => h.onNote(view.id, e));
	note.appendChild(field);
	note.appendChild(makeMirror(doc, view.noteText));

	const markers = doc.createElement("div");
	markers.classList.add(C.noteMarkers);
	fillMarkers(doc, markers, view, { handlers: h, labels });
	note.appendChild(markers);
	return note;
}

function buildRow(doc: Document, view: RowView, labels: Labels, h: RowHandlers): HTMLElement {
	const id = view.id;
	const item = doc.createElement("div");
	item.classList.add(C.item);
	item.setAttribute("data-row-id", id);
	bound.set(item, { handlers: h, labels });

	const row = doc.createElement("div");
	row.classList.add(C.row);

	const index = makeCell(doc, C.index, text(labels, "colIndex"));
	index.appendChild(makeValue(doc, "index", view.indexText));
	const rowTitle = makeValue(doc, "rowTitle", view.rowTitle);
	rowTitle.classList.add(C.rowTitle);
	index.appendChild(rowTitle);
	row.appendChild(index);

	const hotel = makeCell(doc, C.hotel, text(labels, "colHotel"));
	const hotelInput = makeInput(doc, view.hotelAria, text(labels, "hotelPlaceholder"), view.hotelText);
	hotelInput.addEventListener("input", (e) => h.onHotelInput(id, e));
	hotelInput.addEventListener("keydown", (e) => h.onHotelKey(id, e));
	hotelInput.addEventListener("focus", (e) => h.onHotelFocus(id, e));
	makeCombo(doc, hotel, hotelInput, text(labels, "listboxHotel"), text(labels, "comboHint"));
	row.appendChild(hotel);

	const room = makeCell(doc, C.room, text(labels, "colRoom"));
	const roomInput = makeInput(doc, view.roomAria, text(labels, "roomPlaceholder"), view.roomText);
	roomInput.addEventListener("input", (e) => h.onRoomInput(id, e));
	roomInput.addEventListener("keydown", (e) => h.onRoomKey(id, e));
	roomInput.addEventListener("focus", (e) => h.onRoomFocus(id, e));
	makeCombo(doc, room, roomInput, text(labels, "listboxRoom"));
	row.appendChild(room);

	const night = makeCell(doc, C.night, text(labels, "colNight"));
	const nightInput = makeInput(doc, view.nightAria, "", view.nightsText, "numeric");
	nightInput.addEventListener("input", (e) => h.onNights(id, e));
	night.appendChild(nightInput);
	night.appendChild(makeMirror(doc, view.nightsText));
	row.appendChild(night);

	const price = makeCell(doc, C.price, text(labels, "colPricing"));
	const priceInput = makeInput(
		doc,
		view.priceAria,
		text(labels, "pricePlaceholder"),
		view.priceText,
		"numeric",
	);
	priceInput.addEventListener("input", (e) => h.onPrice(id, e));
	price.appendChild(priceInput);
	price.appendChild(makeMirror(doc, view.priceText));
	row.appendChild(price);

	const total = makeCell(doc, C.total, text(labels, "colTotal"));
	total.appendChild(makeValue(doc, "total", view.totalText));
	row.appendChild(total);

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

/** Classes and attributes that depend on the view, applied on build and patch. */
function applyRowState(item: HTMLElement, view: RowView): void {
	item.classList.toggle(C.isEdited, view.showReset);
	item.querySelector<HTMLElement>(`.${C.note}`)?.classList.toggle(C.isEmpty, view.noteEmpty);
	item
		.querySelector<HTMLElement>(`.${C.room}`)
		?.setAttribute("data-has-list", String(view.roomHasList));
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

/**
 * Updates one row in place: values of unfocused inputs, mirrors, totals, the
 * edited marker and the note state. rowEl is the row's .bill-item element.
 */
export function patchRow(doc: Document, rowEl: HTMLElement, row: RowView): void {
	const info = bound.get(rowEl);

	const patchControl = (cls: string, value: string, aria: string): void => {
		const control = rowEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(
			`.${cls} input, .${cls} textarea`,
		);
		if (!control) return;
		if (doc.activeElement !== control) control.value = value;
		control.setAttribute("aria-label", aria);
		const mirror = control.nextElementSibling;
		if (mirror) mirror.textContent = value;
	};

	patchControl(C.hotel, row.hotelText, row.hotelAria);
	patchControl(C.room, row.roomText, row.roomAria);
	patchControl(C.night, row.nightsText, row.nightAria);
	patchControl(C.price, row.priceText, row.priceAria);
	patchControl(C.note, row.noteText, row.noteAria);

	const markers = rowEl.querySelector<HTMLElement>(`.${C.noteMarkers}`);
	if (markers && info) fillMarkers(doc, markers, row, info);

	const total = rowEl.querySelector<HTMLElement>('[data-field="total"]');
	if (total) total.textContent = row.totalText;
	const index = rowEl.querySelector<HTMLElement>('[data-field="index"]');
	if (index) index.textContent = row.indexText;
	const rowTitle = rowEl.querySelector<HTMLElement>('[data-field="rowTitle"]');
	if (rowTitle) rowTitle.textContent = row.rowTitle;

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
