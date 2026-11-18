import { describe, it, expect, vi } from "vitest";
import {
	createApp,
	getSiteSettings,
	RATE_LIMITS,
	type WebEnv,
} from "../../src/web/app";
import type { Hono } from "hono";
import { createMemoryLimiter, type RateLimiter } from "../../src/web/middleware/rateLimit";
import { renderPage } from "../../src/web/render";
import { Layout } from "../../src/web/pages/Layout";
import { PriceBlock } from "../../src/web/pages/components/PriceBlock";
import type { SiteSettings } from "../../src/db/settings";
import { CSP } from "../../src/web/middleware/security";

const SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Vi notice",
	disclaimerEn: "En notice",
};

// Only used by the non-price sample page, whose Layout ignores settings when no price is shown.
const UNUSED_SETTINGS: SiteSettings = {
	serviceFeePercent: 0,
	showFeeNote: false,
	disclaimerVi: "",
	disclaimerEn: "",
};

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": CSP,
	"X-Frame-Options": "DENY",
};

function expectSecurityHeaders(res: Response) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		expect(res.headers.get(name), name).toBe(value);
	}
}

// Stub routes for the guarded paths. Every hit is recorded so tests can prove
// the handler (and with it the AI call) was or was not reached.
function stubRoutes(hits: string[] = []) {
	return (app: Hono<WebEnv>) => {
		const hit = (path: string) => {
			hits.push(path);
		};
		app.all("/search", (c) => {
			hit("/search");
			return c.json({ ok: true });
		});
		app.all("/chat", (c) => {
			hit("/chat");
			return c.json({ ok: true });
		});
		app.get("/api/suggest", (c) => {
			hit("/api/suggest");
			return c.json({ ok: true });
		});
		app.get("/api/hotels", (c) => {
			hit("/api/hotels");
			return c.json({ ok: true });
		});
		app.get("/api/hotels/:id", (c) => {
			hit("/api/hotels/:id");
			return c.json({ ok: true });
		});
		app.get("/api/cities", (c) => {
			hit("/api/cities");
			return c.json({ ok: true });
		});
		app.get("/api/config", (c) => {
			hit("/api/config");
			return c.json({ ok: true });
		});
	};
}

// Sample page without a price: must not read settings.
function samplePage(app: Hono<WebEnv>) {
	app.get("/sample", (c) =>
		renderPage(
			c,
			<Layout
				lang={c.get("lang")}
				path={c.req.path}
				origin={new URL(c.req.url).origin}
				title="Sample"
				settings={UNUSED_SETTINGS}
				showsPrice={false}
			>
				<p>hello</p>
			</Layout>,
		),
	);
}

// Page with a price: reads settings through the request-scoped helper.
function pricePage(app: Hono<WebEnv>) {
	app.get("/price", async (c) => {
		const settings = await getSiteSettings(c);
		return renderPage(
			c,
			<Layout
				lang={c.get("lang")}
				path={c.req.path}
				origin={new URL(c.req.url).origin}
				title="Price"
				settings={settings}
				showsPrice={true}
			>
				<PriceBlock lang={c.get("lang")} settings={settings} amount={1_375_000} />
			</Layout>,
		);
	});
}

const CLIENT_A = { "CF-Connecting-IP": "203.0.113.1" };
const CLIENT_B = { "CF-Connecting-IP": "203.0.113.2" };

function fakeClock(start = 1_000_000) {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
}

describe("web app composition (TASK-14)", () => {
	it("sample page is Vietnamese at normal address and English under /en", async () => {
		const app = createApp({
			getSettings: async () => SETTINGS,
			mount: (a) => samplePage(a),
		});

		const vi = await app.request("/sample");
		expect(vi.status).toBe(200);
		expect(await vi.text()).toContain('<html lang="vi">');

		const en = await app.request("/en/sample");
		expect(en.status).toBe(200);
		expect(await en.text()).toContain('<html lang="en">');
	});

	it("page, json and 404 carry noindex", async () => {
		const app = createApp({
			getSettings: async () => SETTINGS,
			mount: (a) => {
				samplePage(a);
				stubRoutes()(a);
			},
		});

		for (const path of ["/sample", "/api/hotels", "/no-such-page"]) {
			const res = await app.request(path);
			expect(res.headers.get("X-Robots-Tag"), path).toBe("noindex, nofollow");
		}
	});

	it("page, json, 404 and 429 carry security headers", async () => {
		const app = createApp({
			getSettings: async () => SETTINGS,
			limiters: {
				search: { limit: async () => ({ success: false }) },
			},
			mount: (a) => {
				samplePage(a);
				stubRoutes()(a);
			},
		});

		for (const path of ["/sample", "/api/hotels", "/no-such-page", "/search"]) {
			const res = await app.request(path);
			expectSecurityHeaders(res);
		}
		const limited = await app.request("/search?q=hi", { headers: CLIENT_A });
		expect(limited.status).toBe(429);
		expectSecurityHeaders(limited);
	});

	it("search, chat, suggest and data endpoints are rate limited with separate counters", async () => {
		const hits: string[] = [];
		const app = createApp({
			getSettings: async () => SETTINGS,
			mount: stubRoutes(hits),
		});

		// /search: 20 allowed per minute from one IP, the 21st is refused.
		for (let i = 0; i < RATE_LIMITS.search.limit; i++) {
			expect((await app.request("/search?q=hi", { headers: CLIENT_A })).status).toBe(200);
		}
		expect((await app.request("/search?q=hi", { headers: CLIENT_A })).status).toBe(429);

		// /chat has its own counter, untouched by /search.
		expect((await app.request("/chat", { method: "POST", headers: { ...CLIENT_A, "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) })).status).toBe(200);

		// /api/suggest has its own counter.
		expect((await app.request("/api/suggest?q=ha", { headers: CLIENT_A })).status).toBe(200);

		// /api/hotels: data group, 60 per minute; the 61st is refused.
		for (let i = 0; i < RATE_LIMITS.data.limit; i++) {
			expect((await app.request("/api/hotels", { headers: CLIENT_A })).status).toBe(200);
		}
		expect((await app.request("/api/hotels", { headers: CLIENT_A })).status).toBe(429);
		// Data group shares one counter across its routes.
		expect((await app.request("/api/cities", { headers: CLIENT_A })).status).toBe(429);
		// Suggest is a different group and still allowed.
		expect((await app.request("/api/suggest?q=ha", { headers: CLIENT_A })).status).toBe(200);

		// Another IP is not affected.
		expect((await app.request("/search?q=hi", { headers: CLIENT_B })).status).toBe(200);
	});

	it("limited client is accepted again after the window (fake clock)", async () => {
		const clock = fakeClock();
		const app = createApp({
			getSettings: async () => SETTINGS,
			limiters: {
				search: createMemoryLimiter({ limit: 2, windowMs: 60_000, now: clock.now }),
			},
			mount: stubRoutes(),
		});

		expect((await app.request("/search?q=a", { headers: CLIENT_A })).status).toBe(200);
		expect((await app.request("/search?q=a", { headers: CLIENT_A })).status).toBe(200);
		expect((await app.request("/search?q=a", { headers: CLIENT_A })).status).toBe(429);

		clock.advance(60_000);
		expect((await app.request("/search?q=a", { headers: CLIENT_A })).status).toBe(200);
	});

	it("over-long chat and search input never reaches the handler", async () => {
		const hits: string[] = [];
		const app = createApp({
			getSettings: async () => SETTINGS,
			mount: stubRoutes(hits),
		});
		const json = { "content-type": "application/json" };

		const longChat = await app.request("/chat", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ message: "a".repeat(1001) }),
		});
		expect(longChat.status).toBe(400);

		const longSearch = await app.request(`/search?q=${"a".repeat(201)}`);
		expect(longSearch.status).toBe(400);

		expect(hits).toEqual([]);

		// Exactly at the limit is accepted, so the cap is not off by one.
		const okChat = await app.request("/chat", {
			method: "POST",
			headers: json,
			body: JSON.stringify({ message: "a".repeat(1000) }),
		});
		expect(okChat.status).toBe(200);
		expect(hits).toEqual(["/chat"]);
	});

	it("page with prices shows disclaimer and fee note by setting, and pages without prices skip the settings read", async () => {
		const getSettings = vi.fn(async () => SETTINGS);
		const app = createApp({
			getSettings,
			mount: (a) => {
				samplePage(a);
				pricePage(a);
			},
		});

		const withNote = await app.request("/en/price");
		expect(withNote.status).toBe(200);
		const html = await withNote.text();
		expect(html).toContain("En notice");
		expect(html).toContain("Includes 10% service fee");
		expect(getSettings).toHaveBeenCalledTimes(1);

		// Without a price, no settings are read.
		getSettings.mockClear();
		expect((await app.request("/en/sample")).status).toBe(200);
		expect(getSettings).not.toHaveBeenCalled();

		// Fee note switched off: no fee note.
		const noNoteApp = createApp({
			getSettings: async () => ({ ...SETTINGS, showFeeNote: false }),
			mount: pricePage,
		});
		const noNote = await (await noNoteApp.request("/en/price")).text();
		expect(noNote).toContain("En notice");
		expect(noNote).not.toContain("service fee");
		expect(noNote).not.toContain("data-fee-note");
	});

	it("settings failure gives a 500 with headers", async () => {
		const app = createApp({
			getSettings: async () => {
				throw new Error("db down");
			},
			mount: pricePage,
		});
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await app.request("/price");
			expect(res.status).toBe(500);
			expectSecurityHeaders(res);
			expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		} finally {
			errSpy.mockRestore();
		}
	});

	it("uses default memory limiters when none are injected", async () => {
		const app = createApp({ getSettings: async () => SETTINGS, mount: stubRoutes() });
		const statuses: number[] = [];
		for (let i = 0; i <= RATE_LIMITS.search.limit; i++) {
			statuses.push((await app.request("/search?q=x", { headers: CLIENT_B })).status);
		}
		expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);
		expect(statuses.at(-1)).toBe(429);
	});

	it("injected limiter failing open does not block (no limiter -> fail open)", async () => {
		const broken: RateLimiter = {
			limit: async () => {
				throw new Error("binding down");
			},
		};
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const app = createApp({
				getSettings: async () => SETTINGS,
				limiters: { search: broken },
				mount: stubRoutes(),
			});
			expect((await app.request("/search?q=x", { headers: CLIENT_A })).status).toBe(200);
		} finally {
			warn.mockRestore();
		}
	});
});
