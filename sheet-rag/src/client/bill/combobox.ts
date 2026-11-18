// Combobox decisions for the bill page hotel and room pickers (technical design 18.5).
// Pure functions only: which options match, how keys move the highlight, which ARIA
// attributes to set. The browser wiring applies these results. No DOM, no fetch.
// Imports only from src/domain/ (design 3.4).

import { foldText } from "../../domain/fold";

export interface Option {
	value: string;
	label: string;
	meta?: string;
}

const DEFAULT_LIMIT = 50;

/**
 * Options whose folded label contains every folded query word. Prefix matches
 * of the whole query come first; otherwise the original order is kept.
 * An empty query returns the first `limit` options.
 */
export function filterOptions(
	options: Option[],
	query: string,
	limit: number = DEFAULT_LIMIT,
): Option[] {
	const folded = foldText(query);
	if (folded === "") {
		return options.slice(0, limit);
	}
	const tokens = folded.split(" ");

	const prefix: Option[] = [];
	const others: Option[] = [];
	for (const option of options) {
		const label = foldText(option.label);
		if (!tokens.every((token) => label.includes(token))) {
			continue;
		}
		if (label.startsWith(folded)) {
			prefix.push(option);
		} else {
			others.push(option);
		}
	}
	return prefix.concat(others).slice(0, limit);
}

export interface ComboState {
	open: boolean;
	/** Highlighted option index; -1 means nothing is highlighted. */
	active: number;
}

export type ComboEvent =
	| { type: "input" }
	| { type: "focus" }
	| { type: "blur" }
	| { type: "arrowDown" }
	| { type: "arrowUp" }
	| { type: "home" }
	| { type: "end" }
	| { type: "enter" }
	| { type: "escape" }
	| { type: "hover"; index: number }
	| { type: "optionsChanged" };

export interface ComboResult {
	state: ComboState;
	pick: number | null;
	preventDefault: boolean;
}

const CLOSED: ComboState = { open: false, active: -1 };

function result(state: ComboState, pick: number | null = null, preventDefault = false): ComboResult {
	return { state, pick, preventDefault };
}

/** Next state for a key or input event. `count` is the number of current options. */
export function comboStep(state: ComboState, event: ComboEvent, count: number): ComboResult {
	const hasOptions = count > 0;
	const keyPd = hasOptions;

	switch (event.type) {
		case "input":
			return result({ open: true, active: -1 });

		case "focus":
			return result(state);

		case "blur":
			return result({ open: false, active: state.active });

		case "arrowDown": {
			if (!hasOptions) {
				return result(CLOSED);
			}
			if (!state.open) {
				return result({ open: true, active: 0 }, null, keyPd);
			}
			return result({ open: true, active: (state.active + 1) % count }, null, keyPd);
		}

		case "arrowUp": {
			if (!hasOptions) {
				return result(CLOSED);
			}
			if (!state.open) {
				return result({ open: true, active: count - 1 }, null, keyPd);
			}
			const active = state.active <= 0 ? count - 1 : state.active - 1;
			return result({ open: true, active }, null, keyPd);
		}

		case "home":
			if (!hasOptions) {
				return result(CLOSED);
			}
			return result({ open: true, active: 0 }, null, keyPd);

		case "end":
			if (!hasOptions) {
				return result(CLOSED);
			}
			return result({ open: true, active: count - 1 }, null, keyPd);

		case "enter":
			if (state.open && state.active >= 0 && state.active < count) {
				return result(CLOSED, state.active, true);
			}
			return result(state);

		case "escape":
			return result(CLOSED, null, state.open);

		case "hover":
			if (event.index >= 0 && event.index < count) {
				return result({ open: state.open, active: event.index });
			}
			return result(state);

		case "optionsChanged": {
			if (!hasOptions) {
				return result(CLOSED);
			}
			const active = Math.min(Math.max(state.active, -1), count - 1);
			return result({ open: state.open, active });
		}
	}
}

/** ARIA attributes for the combobox element, derived from state and the option count. */
export function comboAria(
	state: ComboState,
	o: { listId: string; optionId: (i: number) => string; count: number },
): Record<string, string> {
	const expanded = state.open && o.count > 0;
	const activeValid = expanded && state.active >= 0 && state.active < o.count;
	return {
		role: "combobox",
		"aria-autocomplete": "list",
		"aria-expanded": expanded ? "true" : "false",
		"aria-controls": o.listId,
		"aria-activedescendant": activeValid ? o.optionId(state.active) : "",
	};
}
