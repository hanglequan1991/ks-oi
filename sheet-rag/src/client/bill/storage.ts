// Bill page draft storage (technical design 18.7).
// The draft lives only in localStorage under DRAFT_KEY. Storage can be blocked
// or hold corrupt data, so every access is wrapped and every field is checked.
// Storage and timers are passed in so tests can use fakes in plain Node.
// Imports only ./state and src/domain/money.ts.

import { MAX_NOTE, MAX_PRICE, MAX_ROWS, MIN_NIGHTS, MAX_NIGHTS } from "../../domain/money";
import type { BillRow } from "./state";

export const DRAFT_KEY = "hd_bill_v1";

const DRAFT_VERSION = 1;
const MAX_TEXT = 200;
const MAX_SLUG = 100;
const MAX_ID = 64;

export interface StorageLike {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
	removeItem(k: string): void;
}

/** Cuts a string to `max` code points. */
function cut(s: string, max: number): string {
	return Array.from(s).slice(0, max).join("");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Integer within 0..MAX_PRICE, otherwise null. */
function priceOrNull(v: unknown): number | null {
	if (typeof v !== "number" || !Number.isInteger(v)) return null;
	if (v < 0 || v > MAX_PRICE) return null;
	return v;
}

function nightsOf(v: unknown): number {
	if (typeof v !== "number" || !Number.isInteger(v)) return MIN_NIGHTS;
	return Math.min(MAX_NIGHTS, Math.max(MIN_NIGHTS, v));
}

function idOf(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const len = Array.from(v).length;
	return len >= 1 && len <= MAX_ID ? v : null;
}

/** Validates stored rows field by field. Never throws; unusable rows are dropped. */
export function sanitizeRows(input: unknown, makeId: () => string): BillRow[] {
	if (!Array.isArray(input)) return [];
	const out: BillRow[] = [];
	const seen = new Set<string>();
	for (const entry of input.slice(0, MAX_ROWS)) {
		if (!isPlainObject(entry)) continue;
		let id = idOf(entry.id);
		let attempts = 0;
		while ((id === null || seen.has(id)) && attempts < 10) {
			id = idOf(makeId());
			attempts++;
		}
		if (id === null || seen.has(id)) continue;
		seen.add(id);

		const price = priceOrNull(entry.price);
		const priceEdited =
			entry.priceEdited === true && (entry.price === null || price !== null);

		out.push({
			id,
			hotelText: typeof entry.hotelText === "string" ? cut(entry.hotelText, MAX_TEXT) : "",
			hotelSlug:
				typeof entry.hotelSlug === "string" && entry.hotelSlug !== ""
					? cut(entry.hotelSlug, MAX_SLUG)
					: null,
			roomText: typeof entry.roomText === "string" ? cut(entry.roomText, MAX_TEXT) : "",
			roomId:
				typeof entry.roomId === "string" && entry.roomId !== ""
					? cut(entry.roomId, MAX_ID)
					: null,
			defaultPrice: priceOrNull(entry.defaultPrice),
			price,
			priceEdited,
			nights: nightsOf(entry.nights),
			note: typeof entry.note === "string" ? cut(entry.note, MAX_NOTE) : "",
		});
	}
	return out;
}

function removeQuietly(storage: StorageLike): void {
	try {
		storage.removeItem(DRAFT_KEY);
	} catch {
		// Blocked storage: nothing more to do.
	}
}

/** Returns the saved rows and savedAt, or null. Corrupt or old data is removed. */
export function loadDraft(
	storage: StorageLike | null,
	makeId: () => string,
): { rows: BillRow[]; savedAt: string } | null {
	if (storage === null) return null;
	try {
		const raw = storage.getItem(DRAFT_KEY);
		if (raw === null) return null;
		const parsed: unknown = (() => {
			try {
				return JSON.parse(raw);
			} catch {
				return undefined;
			}
		})();
		if (
			!isPlainObject(parsed) ||
			parsed.v !== DRAFT_VERSION ||
			typeof parsed.savedAt !== "string" ||
			!Array.isArray(parsed.rows)
		) {
			removeQuietly(storage);
			return null;
		}
		return { rows: sanitizeRows(parsed.rows, makeId), savedAt: parsed.savedAt };
	} catch {
		removeQuietly(storage);
		return null;
	}
}

/** True for an untouched page: one row with no text, no price, one night, no note. */
export function isBlankDraft(rows: BillRow[]): boolean {
	if (rows.length !== 1) return false;
	const r = rows[0];
	return (
		r.hotelText === "" &&
		r.roomText === "" &&
		r.note === "" &&
		r.hotelSlug === null &&
		r.roomId === null &&
		r.price === null &&
		r.defaultPrice === null &&
		r.nights === MIN_NIGHTS
	);
}

/** Stores the draft. A blank draft removes the key. False when blocked, blank or failed. */
export function saveDraft(storage: StorageLike | null, rows: BillRow[], now: Date): boolean {
	if (storage === null) return false;
	try {
		if (rows.length === 0 || isBlankDraft(rows)) {
			storage.removeItem(DRAFT_KEY);
			return false;
		}
		const clean = sanitizeRows(rows, () => `r${Math.random().toString(36).slice(2, 10)}`);
		const value = JSON.stringify({
			v: DRAFT_VERSION,
			savedAt: now.toISOString(),
			rows: clean,
		});
		storage.setItem(DRAFT_KEY, value);
		return true;
	} catch {
		return false;
	}
}

/** Removes the stored draft. False when blocked or failed. */
export function clearDraft(storage: StorageLike | null): boolean {
	if (storage === null) return false;
	try {
		storage.removeItem(DRAFT_KEY);
		return true;
	} catch {
		return false;
	}
}

/** Debounced save: schedule() restarts the timer, flush() saves now, cancel() drops it. */
export function createSaver(
	save: () => void,
	delayMs: number,
	timers: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void },
): { schedule(): void; flush(): void; cancel(): void } {
	let handle: unknown = null;
	let pending = false;

	const drop = () => {
		if (pending) timers.clear(handle);
		handle = null;
		pending = false;
	};

	return {
		schedule() {
			drop();
			pending = true;
			handle = timers.set(() => {
				pending = false;
				handle = null;
				save();
			}, delayMs);
		},
		flush() {
			if (!pending) return;
			drop();
			save();
		},
		cancel() {
			drop();
		},
	};
}
