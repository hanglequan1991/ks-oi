// Bill page API client (technical design 18.4 and 18.5).
// Only GET requests with the typed hotel text or a hotel slug. Nothing from the
// bill is ever sent. Prices come only from the API (final price, never a base price).
// Imports only the RoomOption type from ./state.

import type { RoomOption } from "./state";

export interface HotelOption {
	slug: string;
	name: string;
	city: string;
}

export interface BillApi {
	suggestHotels(q: string, signal?: AbortSignal): Promise<HotelOption[]>;
	loadRooms(slug: string): Promise<RoomOption[]>;
}

const MAX_QUERY = 60;
const SUGGEST_LIMIT = 8;

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
	return typeof v === "object" && v !== null;
}

function isAbortError(err: unknown): boolean {
	return isRecord(err) && err.name === "AbortError";
}

function parseHotel(raw: unknown): HotelOption | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.slug !== "string" || typeof raw.name !== "string") return null;
	const city = typeof raw.city === "string" ? raw.city : "";
	return { slug: raw.slug, name: raw.name, city };
}

function parseRoom(raw: unknown): RoomOption | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
	let price: number | null = null;
	if (isRecord(raw.price)) {
		const amount = raw.price.amount;
		if (typeof amount === "number" && Number.isInteger(amount) && amount >= 0) {
			price = amount;
		}
	}
	return { id: raw.id, name: raw.name, price };
}

export function createBillApi(o: {
	fetch: typeof fetch;
	lang: "vi" | "en";
}): BillApi {
	// Keep a plain reference: calling fetch as a method of `o` breaks in browsers.
	const doFetch = o.fetch;
	const roomCache = new Map<string, Promise<RoomOption[]>>();

	async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
		// Not an inline literal: the Workers RequestInit type has no `credentials` field.
		const init = { method: "GET", signal, credentials: "omit" as const };
		const res = await doFetch(url, init);
		if (!res.ok) throw new Error(`request failed with status ${res.status}`);
		return res.json();
	}

	return {
		async suggestHotels(q: string, signal?: AbortSignal): Promise<HotelOption[]> {
			const text = q.trim().slice(0, MAX_QUERY);
			if (text === "") return [];
			const url =
				`/api/suggest?q=${encodeURIComponent(text)}` +
				`&limit=${SUGGEST_LIMIT}&lang=${encodeURIComponent(o.lang)}`;
			const body = await getJson(url, signal);
			if (!isRecord(body) || !Array.isArray(body.items)) {
				throw new Error("unexpected suggest response");
			}
			const out: HotelOption[] = [];
			for (const raw of body.items) {
				const hotel = parseHotel(raw);
				if (hotel) out.push(hotel);
			}
			return out;
		},

		loadRooms(slug: string): Promise<RoomOption[]> {
			const cached = roomCache.get(slug);
			if (cached) return cached;
			const url = `/api/hotels/${encodeURIComponent(slug)}?lang=${encodeURIComponent(o.lang)}`;
			const pending = getJson(url).then((body) => {
				if (!isRecord(body) || !Array.isArray(body.rooms)) {
					throw new Error("unexpected hotel response");
				}
				const rooms: RoomOption[] = [];
				for (const raw of body.rooms) {
					const room = parseRoom(raw);
					if (room) rooms.push(room);
				}
				return rooms;
			});
			roomCache.set(slug, pending);
			// A failed load is evicted so the next call retries.
			pending.catch(() => {
				if (roomCache.get(slug) === pending) roomCache.delete(slug);
			});
			return pending;
		},
	};
}

export function createSuggester(o: {
	api: BillApi;
	delayMs: number;
	timers: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
}): {
	request(q: string, onResult: (items: HotelOption[]) => void, onError: () => void): void;
	cancel(): void;
} {
	let timer: unknown = null;
	let controller: AbortController | null = null;
	let seq = 0;

	function stopPending(): void {
		if (timer !== null) {
			o.timers.clear(timer);
			timer = null;
		}
		if (controller) {
			controller.abort();
			controller = null;
		}
	}

	return {
		request(q, onResult, onError) {
			stopPending();
			const id = ++seq;
			const ctl = new AbortController();
			controller = ctl;
			timer = o.timers.set(() => {
				timer = null;
				o.api.suggestHotels(q, ctl.signal).then(
					(items) => {
						if (id !== seq || ctl.signal.aborted) return;
						onResult(items);
					},
					(err: unknown) => {
						if (id !== seq || ctl.signal.aborted || isAbortError(err)) return;
						onError();
					},
				);
			}, o.delayMs);
		},
		cancel() {
			stopPending();
			seq++;
		},
	};
}
