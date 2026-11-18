import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	createBillApi,
	createSuggester,
	type HotelOption,
} from "../../src/client/bill/api";
import {
	createInitialState,
	reduce,
	type BillState,
} from "../../src/client/bill/state";

interface Call {
	url: string;
	init: RequestInit;
	signal: AbortSignal | undefined;
}

// Fake fetch: records every call, answers with the scripted response.
// Rejects with AbortError when the signal aborts while the request is pending.
function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const signal = init?.signal ?? undefined;
		calls.push({ url, init: init ?? {}, signal });
		return new Promise<Response>((resolveFn, rejectFn) => {
			const onAbort = () => {
				const err = new Error("aborted");
				err.name = "AbortError";
				rejectFn(err);
			};
			if (signal?.aborted) return onAbort();
			signal?.addEventListener("abort", onAbort);
			Promise.resolve(respond(url)).then(
				(r) => {
					signal?.removeEventListener("abort", onAbort);
					resolveFn(r);
				},
				(e) => rejectFn(e),
			);
		});
	}) as unknown as typeof fetch;
	return { fn, calls };
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

// Manual timers: nothing runs until advance() is called.
function fakeTimers() {
	let now = 0;
	let nextId = 1;
	const pending = new Map<number, { at: number; fn: () => void }>();
	return {
		timers: {
			set(fn: () => void, ms: number): unknown {
				const id = nextId++;
				pending.set(id, { at: now + ms, fn });
				return id;
			},
			clear(h: unknown): void {
				pending.delete(h as number);
			},
		},
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...pending.entries()]) {
				if (t.at <= now) {
					pending.delete(id);
					t.fn();
				}
			}
		},
		count: () => pending.size,
	};
}

// Lets queued promise callbacks and Response body reads finish.
async function flush() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

const SUGGEST_OK = { items: [{ slug: "mong-hotel", name: "Mộng Hotel", city: "Đà Nẵng" }] };

describe("bill api", () => {
	it("suggest calls the endpoint with an encoded query", async () => {
		const f = fakeFetch(() => json(SUGGEST_OK));
		const api = createBillApi({ fetch: f.fn, lang: "vi" });
		const items = await api.suggestHotels("mo");
		expect(f.calls.map((c) => c.url)).toEqual(["/api/suggest?q=mo&limit=8&lang=vi"]);
		expect(items).toEqual([{ slug: "mong-hotel", name: "Mộng Hotel", city: "Đà Nẵng" }]);

		f.calls.length = 0;
		await api.suggestHotels("a b&c#d é");
		expect(f.calls[0].url).toBe(
			`/api/suggest?q=${encodeURIComponent("a b&c#d é")}&limit=8&lang=vi`,
		);
		expect(f.calls[0].url.split("&limit")[0]).not.toMatch(/[ &#é]/);
	});

	it("rooms come with final prices or null", async () => {
		const f = fakeFetch(() =>
			json({
				slug: "mong-hotel",
				rooms: [
					{ id: "r1", name: "Deluxe", price: { amount: 1375000, currency: "VND", unit: "night" }, base_price: 1250000 },
					{ id: "r2", name: "Standard", price: null },
					{ id: "r3", name: "Bad", price: { amount: 1.5 } },
				],
			}),
		);
		const api = createBillApi({ fetch: f.fn, lang: "vi" });
		const rooms = await api.loadRooms("mong-hotel");
		expect(rooms).toEqual([
			{ id: "r1", name: "Deluxe", price: 1375000 },
			{ id: "r2", name: "Standard", price: null },
			{ id: "r3", name: "Bad", price: null },
		]);
		expect(f.calls[0].url).toBe("/api/hotels/mong-hotel?lang=vi");
	});

	it("only plain GET requests without bill data are made", async () => {
		const f = fakeFetch((url) =>
			url.startsWith("/api/suggest") ? json(SUGGEST_OK) : json({ rooms: [] }),
		);
		const api = createBillApi({ fetch: f.fn, lang: "vi" });

		// Bill state with a private note; the note is typed only into the bill state.
		const note = "SECRET-NOTE-42 ghi chú riêng";
		let state: BillState = createInitialState("row-1");
		state = reduce(state, { type: "setNote", rowId: "row-1", note });
		expect(state.rows[0].note).toBe(note);

		await api.suggestHotels("mo");
		await api.loadRooms("mong-hotel");
		await api.loadRooms("mong-hotel-2");

		expect(f.calls.length).toBe(3);
		for (const c of f.calls) {
			expect(c.init.method).toBe("GET");
			expect(c.init.body).toBeUndefined();
			expect((c.init as { credentials?: unknown }).credentials).toBe("omit");
			expect(Object.keys(c.init).sort()).toEqual(["credentials", "method", "signal"]);
			expect(c.url).not.toContain(note);
			expect(c.url).not.toContain("SECRET");
		}

		const src = readFileSync(
			resolve(__dirname, "../../src/client/bill/api.ts"),
			"utf8",
		);
		expect(src).not.toMatch(/POST/);
		expect(src).not.toMatch(/sendBeacon/);
		expect(src).not.toMatch(/localStorage/);
	});

	it("room lists are cached and failures are retried", async () => {
		let fail = true;
		const f = fakeFetch(() =>
			fail ? json({ error: { code: "x", message: "y" } }, 500) : json({ rooms: [{ id: "r1", name: "Deluxe", price: null }] }),
		);
		const api = createBillApi({ fetch: f.fn, lang: "vi" });

		await expect(api.loadRooms("mong-hotel")).rejects.toThrow();
		expect(f.calls.length).toBe(1);

		// The failed load is evicted: the next call makes a new request.
		fail = false;
		const first = await api.loadRooms("mong-hotel");
		expect(f.calls.length).toBe(2);
		expect(first).toEqual([{ id: "r1", name: "Deluxe", price: null }]);

		// Cached: the second call for the same slug makes no request.
		const second = await api.loadRooms("mong-hotel");
		expect(f.calls.length).toBe(2);
		expect(second).toEqual(first);
	});

	it("suggester debounces and aborts older requests", async () => {
		const f = fakeFetch((url) => json({ items: [{ slug: url, name: url, city: "c" }] }));
		const api = createBillApi({ fetch: f.fn, lang: "vi" });
		const t = fakeTimers();
		const sug = createSuggester({ api, delayMs: 300, timers: t.timers });

		const results: HotelOption[][] = [];
		const errors: number[] = [];
		const onResult = (items: HotelOption[]) => results.push(items);
		const onError = () => errors.push(1);

		// Three quick requests within the debounce window: one fetch, last text.
		sug.request("m", onResult, onError);
		t.advance(100);
		sug.request("mo", onResult, onError);
		t.advance(100);
		sug.request("mon", onResult, onError);
		t.advance(299);
		expect(f.calls.length).toBe(0);
		t.advance(1);
		expect(f.calls.length).toBe(1);
		expect(f.calls[0].url).toContain("q=mon&");
		await flush();
		expect(results.length).toBe(1);

		// A new request while one is in flight aborts the first.
		sug.request("mong", onResult, onError);
		t.advance(300);
		expect(f.calls.length).toBe(2);
		const firstSignal = f.calls[1].signal!;
		expect(firstSignal.aborted).toBe(false);

		sug.request("mong h", onResult, onError);
		expect(firstSignal.aborted).toBe(true);
		t.advance(300);
		expect(f.calls.length).toBe(3);
		await flush();

		// Only the latest result reaches onResult; the aborted one never does.
		expect(results.length).toBe(2);
		expect(results[1][0].slug).toContain("q=mong%20h");
		expect(errors.length).toBe(0);
	});

	it("empty, long, failed and malformed cases are handled", async () => {
		let body: unknown = { items: [] };
		let status = 200;
		const f = fakeFetch(() => json(body, status));
		const api = createBillApi({ fetch: f.fn, lang: "vi" });

		// Empty and whitespace-only queries make no request.
		expect(await api.suggestHotels("")).toEqual([]);
		expect(await api.suggestHotels("   ")).toEqual([]);
		expect(f.calls.length).toBe(0);

		// 100 characters are sent as 60.
		await api.suggestHotels("a".repeat(100));
		expect(f.calls[0].url).toBe(`/api/suggest?q=${"a".repeat(60)}&limit=8&lang=vi`);

		// Malformed items are dropped and extra fields are not copied.
		body = {
			items: [
				{ slug: "ok", name: "Ok", city: "Hà Nội", base_price: 999 },
				{ slug: 5, name: "No slug string", city: "x" },
				{ slug: "no-name", city: "x" },
				null,
				"junk",
			],
		};
		const items = await api.suggestHotels("ok");
		expect(items).toEqual([{ slug: "ok", name: "Ok", city: "Hà Nội" }]);
		expect(Object.keys(items[0]).sort()).toEqual(["city", "name", "slug"]);

		// A 500 rejects; the suggester calls onError exactly once.
		status = 500;
		body = { error: { code: "internal", message: "boom" } };
		const t = fakeTimers();
		const sug = createSuggester({ api, delayMs: 10, timers: t.timers });
		let errorCount = 0;
		let resultCount = 0;
		sug.request("zz", () => resultCount++, () => errorCount++);
		t.advance(10);
		await flush();
		await flush();
		expect(errorCount).toBe(1);
		expect(resultCount).toBe(0);
	});

	it("english page sends lang=en", async () => {
		const f = fakeFetch((url) =>
			url.startsWith("/api/suggest") ? json(SUGGEST_OK) : json({ rooms: [] }),
		);
		const api = createBillApi({ fetch: f.fn, lang: "en" });
		await api.suggestHotels("mo");
		await api.loadRooms("mong-hotel");
		expect(f.calls[0].url).toContain("lang=en");
		expect(f.calls[1].url).toBe("/api/hotels/mong-hotel?lang=en");
	});
});
