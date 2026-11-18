import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

// Runs public/lang.js inside a bare VM context with fake browser globals.
// No real browser, no DOM: the script only touches window, localStorage,
// location and document.addEventListener.

const LANG_PATH = fileURLToPath(new URL("../../public/lang.js", import.meta.url));
const SOURCE = readFileSync(LANG_PATH, "utf8");

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
	target: unknown;
	defaultPrevented: boolean;
	preventDefault: () => void;
}

interface FakeLink {
	dataset: { lang?: string };
	closest?: (selector: string) => FakeLink | null;
}

interface FakeStorageOptions {
	throwOnGet?: boolean;
	throwOnSet?: boolean;
}

function makeStorage(initial: Record<string, string> = {}, opts: FakeStorageOptions = {}) {
	const data: Record<string, string> = { ...initial };
	const writes: Array<[string, string]> = [];
	const storage = {
		getItem(key: string): string | null {
			if (opts.throwOnGet) throw new Error("blocked");
			return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
		},
		setItem(key: string, value: string): void {
			if (opts.throwOnSet) throw new Error("blocked");
			data[key] = String(value);
			writes.push([key, String(value)]);
		},
	};
	return { storage, data, writes };
}

interface RunOptions {
	pathname: string;
	search?: string;
	hash?: string;
	stored?: Record<string, string>;
	storage?: FakeStorageOptions;
	storageOverride?: unknown;
}

function run(opts: RunOptions) {
	const replaced: string[] = [];
	const listeners: Record<string, Listener[]> = {};
	const { storage, data, writes } = makeStorage(opts.stored, opts.storage);
	const location = {
		pathname: opts.pathname,
		search: opts.search ?? "",
		hash: opts.hash ?? "",
		replace(url: string) {
			replaced.push(url);
		},
	};
	const document = {
		addEventListener(type: string, fn: Listener) {
			(listeners[type] ??= []).push(fn);
		},
	};
	const localStorage = opts.storageOverride !== undefined ? opts.storageOverride : storage;
	const window = { localStorage, location, document };
	const sandbox: Record<string, unknown> = {
		window,
		location,
		document,
		localStorage,
	};
	runInNewContext(SOURCE, sandbox);
	return {
		replaced,
		data,
		writes,
		click(link: FakeLink, extra: Partial<FakeEvent> = {}) {
			const event: FakeEvent = {
				target: link,
				defaultPrevented: false,
				preventDefault() {
					event.defaultPrevented = true;
				},
				...extra,
			};
			for (const fn of listeners["click"] ?? []) fn(event);
			return event;
		},
		listeners,
	};
}

// Fake link that matches the selector a[data-lang] via closest().
function langLink(lang: string): FakeLink {
	const link: FakeLink = { dataset: { lang } };
	link.closest = (selector: string) => (selector === "a[data-lang]" ? link : null);
	return link;
}

describe("public/lang.js", () => {
	it("saved en on a Vietnamese URL redirects to the /en URL keeping search and hash", () => {
		const r = run({ pathname: "/bill", search: "?x=1", hash: "#top", stored: { hd_lang: "en" } });
		expect(r.replaced).toEqual(["/en/bill?x=1#top"]);
	});

	it("saved vi on an English URL redirects to the Vietnamese URL", () => {
		const r = run({ pathname: "/en/bill", search: "?x=1", hash: "#top", stored: { hd_lang: "vi" } });
		expect(r.replaced).toEqual(["/bill?x=1#top"]);
	});

	it("root and /en/ map to each other", () => {
		const toEn = run({ pathname: "/", stored: { hd_lang: "en" } });
		expect(toEn.replaced).toEqual(["/en/"]);
		const toVi = run({ pathname: "/en/", stored: { hd_lang: "vi" } });
		expect(toVi.replaced).toEqual(["/"]);
		const toViBare = run({ pathname: "/en", stored: { hd_lang: "vi" } });
		expect(toViBare.replaced).toEqual(["/"]);
	});

	it("matching language does not redirect", () => {
		expect(run({ pathname: "/", stored: { hd_lang: "vi" } }).replaced).toEqual([]);
		expect(run({ pathname: "/bill", stored: { hd_lang: "vi" } }).replaced).toEqual([]);
		expect(run({ pathname: "/en/bill", stored: { hd_lang: "en" } }).replaced).toEqual([]);
		expect(run({ pathname: "/en/", stored: { hd_lang: "en" } }).replaced).toEqual([]);
	});

	it("clicking a language link remembers the choice and does not prevent navigation", () => {
		const r = run({ pathname: "/bill" });
		const en = r.click(langLink("en"));
		expect(r.data["hd_lang"]).toBe("en");
		expect(en.defaultPrevented).toBe(false);

		const vi = r.click(langLink("vi"));
		expect(r.data["hd_lang"]).toBe("vi");
		expect(vi.defaultPrevented).toBe(false);
		expect(r.replaced).toEqual([]);
	});

	it("nothing stored means no redirect and no write", () => {
		const r = run({ pathname: "/bill" });
		expect(r.replaced).toEqual([]);
		expect(r.writes).toEqual([]);
	});

	it("blocked storage never throws and never redirects", () => {
		expect(() =>
			run({ pathname: "/bill", stored: { hd_lang: "en" }, storage: { throwOnGet: true } }),
		).not.toThrow();

		const getBlocked = run({ pathname: "/bill", stored: { hd_lang: "en" }, storage: { throwOnGet: true } });
		expect(getBlocked.replaced).toEqual([]);

		const throwingGetter = {};
		Object.defineProperty(throwingGetter, "getItem", {
			get() {
				throw new Error("blocked");
			},
		});
		expect(() => run({ pathname: "/bill", storageOverride: throwingGetter })).not.toThrow();
		const getterBlocked = run({ pathname: "/bill", storageOverride: throwingGetter });
		expect(getterBlocked.replaced).toEqual([]);

		const writeBlocked = run({ pathname: "/bill", storage: { throwOnSet: true } });
		expect(() => writeBlocked.click(langLink("en"))).not.toThrow();
		expect(writeBlocked.replaced).toEqual([]);
		const ev = writeBlocked.click(langLink("en"));
		expect(ev.defaultPrevented).toBe(false);
	});

	it("unknown stored value is ignored", () => {
		const r = run({ pathname: "/bill", stored: { hd_lang: "fr" } });
		expect(r.replaced).toEqual([]);
		const r2 = run({ pathname: "/en/bill", stored: { hd_lang: "fr" } });
		expect(r2.replaced).toEqual([]);
	});
});
