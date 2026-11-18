// Pure view model for the bill page (technical design 18.5). No DOM.
// Turns BillState into plain strings and flags for render.ts. User text is
// returned unchanged; escaping is the DOM builder's job (textContent only).
// Imports only from its own folder and src/domain/ (design 3.4).

import { MAX_ROWS } from "../../domain/money";
import {
	type BillState,
	type BillRow,
	billTotal,
	canAddRow,
	canRemoveRow,
	rowTotal,
} from "./state";
import { type Lang, fillTemplate, priceLabel, totalLabel } from "./format";

/** The `bill` dictionary group, passed in by main.ts. */
export type Labels = Record<string, string>;

export interface RowView {
	id: string;
	/** 1-based position; renumbered after every removal. */
	index: number;
	indexText: string;
	hotelText: string;
	roomText: string;
	nightsText: string;
	priceText: string;
	/** Em dash when the row has no price. */
	totalText: string;
	edited: boolean;
	showReset: boolean;
	noteText: string;
	noteEmpty: boolean;
	canRemove: boolean;
	hotelAria: string;
	roomAria: string;
	nightAria: string;
	priceAria: string;
	noteAria: string;
	removeAria: string;
	/** True only for a picked hotel (AC15). */
	roomHasList: boolean;
}

export interface BillView {
	rows: RowView[];
	grandTotalText: string;
	canAdd: boolean;
	/** addRowLimit text at MAX_ROWS, else ''. */
	addHint: string;
}

function rowView(row: BillRow, index: number, canRemove: boolean, labels: Labels, lang: Lang): RowView {
	const n = { n: index };
	const edited = row.priceEdited && row.defaultPrice !== null;
	return {
		id: row.id,
		index,
		indexText: String(index),
		hotelText: row.hotelText,
		roomText: row.roomText,
		nightsText: String(row.nights),
		priceText: priceLabel(row.priceEdited ? row.price : row.defaultPrice, lang),
		totalText: totalLabel(rowTotal(row), lang),
		edited,
		showReset: edited,
		noteText: row.note,
		noteEmpty: row.note === "",
		canRemove,
		hotelAria: fillTemplate(labels.hotelAria ?? "", n),
		roomAria: fillTemplate(labels.roomAria ?? "", n),
		nightAria: fillTemplate(labels.nightAria ?? "", n),
		priceAria: fillTemplate(labels.priceAria ?? "", n),
		noteAria: fillTemplate(labels.noteAria ?? "", n),
		removeAria: fillTemplate(labels.removeRowAria ?? "", n),
		roomHasList: row.hotelSlug !== null,
	};
}

export function buildView(state: BillState, labels: Labels, lang: Lang): BillView {
	const removable = canRemoveRow(state);
	const rows = state.rows.map((row, i) => rowView(row, i + 1, removable, labels, lang));
	const atLimit = !canAddRow(state);
	return {
		rows,
		grandTotalText: totalLabel(billTotal(state), lang),
		canAdd: !atLimit,
		addHint: atLimit ? fillTemplate(labels.addRowLimit ?? "", { max: MAX_ROWS }) : "",
	};
}
