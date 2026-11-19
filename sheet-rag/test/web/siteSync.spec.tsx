import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import site, { syncDepsFor } from "../../src/site";
import { createPublicGoogleSource } from "../../src/sync/publicGoogleSource";
import { parseSheetRows } from "../../src/sync/rowParser";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { createFakeSheetSource, type FakeSheetSource } from "../fakes/sheetSource";
import type { SheetTab } from "../../src/sync/sheetSource";

// Scheduled handler, POST /internal/sync and the stub parser of the hotel-dictionary
// Worker (TASK-56). The real src/site.ts and a fake D1 with the real migrations. The
// Google source factory is mocked so no network is used; parseSkipTabs and
// SheetConfigError stay real.

vi.mock("../../src/sync/publicGoogleSource", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/sync/publicGoogleSource")>()),
	createPublicGoogleSource: vi.fn(),
}));

const FOLDER = "FOLDER-ID-REAL-123";
const TOKEN = "SYNC-TOKEN-TEST-456";
const TAB: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "1", tabName: "Biển Xanh" };

type Env = Record<string, unknown> & { DB: D1Database };

async function makeEnv(extra: Record<string, unknown> = {}): Promise<{ db: FakeD1; env: Env }> {
	const db = createFakeD1();
	await applyMigrations(db);
	const env: Env = {
		DB: db as unknown as D1Database,
		ASSETS: { fetch: vi.fn(async () => new Response("asset")) } as unknown as Fetcher,
		DRIVE_FOLDER_ID: FOLDER,
		...extra,
	};
	return { db, env };
}

function makeCtx() {
	const pending: Promise<unknown>[] = [];
	const ctx = {
		waitUntil: vi.fn((p: Promise<unknown>) => {
			pending.push(p);
		}),
		passThroughOnException: vi.fn(),
	} as unknown as ExecutionContext;
	return { ctx, settle: () => Promise.all(pending) };
}

function fakeSource(opts: { listThrows?: boolean } = {}): FakeSheetSource {
	const source = createFakeSheetSource({
		files: [{ fileId: "file-1", fileName: "Đà Nẵng" }],
		tabs: [TAB],
		csv: { "file-1:1": "stars=4" },
	});
	if (opts.listThrows) {
		source.listFiles = async () => {
			throw new Error("boom");
		};
	}
	return source;
}

async function count(db: FakeD1, table: string): Promise<number> {
	const res = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all<{ n: number }>();
	return Number(res.results[0].n);
}

const mockedFactory = vi.mocked(createPublicGoogleSource);

beforeEach(() => {
	mockedFactory.mockReset();
	mockedFactory.mockImplementation(() => fakeSource());
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("site: scheduled handler", () => {
	it("scheduled runs the sync with a configured source and swallows errors", async () => {
		const { db, env } = await makeEnv({ SKIP_TABS: '["Đà Nẵng/Mỹ Khê"]' });
		const { ctx, settle } = makeCtx();

		site.scheduled({} as ScheduledController, env as never, ctx);
		await settle();

		expect(mockedFactory).toHaveBeenCalledWith(
			expect.objectContaining({
				folderId: FOLDER,
				skipTabs: ["Đà Nẵng/Mỹ Khê"],
				fetchFn: expect.any(Function),
			}),
		);
		expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
		const runs = await db.prepare("SELECT kind FROM sync_runs").all<{ kind: string }>();
		expect(runs.results.map((r) => r.kind)).toEqual(["scheduled"]);

		// A source that throws must not make the handler throw or reject.
		mockedFactory.mockImplementation(() => fakeSource({ listThrows: true }));
		const failing = makeCtx();
		expect(() => site.scheduled({} as ScheduledController, env as never, failing.ctx)).not.toThrow();
		await expect(failing.settle()).resolves.toBeDefined();
	});

	it("scheduled with unset, placeholder or invalid DRIVE_FOLDER_ID or SKIP_TABS skips and does not throw", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const cases: Record<string, unknown>[] = [
			{ DRIVE_FOLDER_ID: undefined },
			{ DRIVE_FOLDER_ID: "" },
			{ DRIVE_FOLDER_ID: "   " },
			{ DRIVE_FOLDER_ID: "REPLACE_WITH_DRIVE_FOLDER_ID" },
			{ SKIP_TABS: "not json" },
			{ SKIP_TABS: '{"File/Tab": true}' },
			{ SKIP_TABS: "[1, 2]" },
		];
		for (const extra of cases) {
			mockedFactory.mockClear();
			errorSpy.mockClear();
			const { db, env } = await makeEnv(extra);
			const { ctx, settle } = makeCtx();

			expect(() => site.scheduled({} as ScheduledController, env as never, ctx), JSON.stringify(extra)).not.toThrow();
			await settle();

			expect(mockedFactory, JSON.stringify(extra)).not.toHaveBeenCalled();
			expect(await count(db, "sync_runs"), JSON.stringify(extra)).toBe(0);
			expect(errorSpy, JSON.stringify(extra)).toHaveBeenCalled();
		}
	});
});

describe("site: budget, limits and counting wrappers (TASK-71)", () => {
	function lastFactoryOptions(): { fetchFn: typeof fetch } {
		const calls = mockedFactory.mock.calls;
		return calls[calls.length - 1][0] as unknown as { fetchFn: typeof fetch };
	}

	it("syncDepsFor passes parsed limits and a shared budget", async () => {
		const { db, env } = await makeEnv({ MAX_TABS_PER_RUN: "7", SUBREQUEST_BUDGET: "12" });
		const deps = syncDepsFor(env.DB, env as never);
		expect(deps.limits).toEqual({ maxTabsPerRun: 7, subrequestBudget: 12 });
		expect(deps.budget).toBeDefined();
		expect(deps.budget?.remaining).toBe(12);
		expect(typeof deps.nowMs?.()).toBe("number");
		expect(db).toBeDefined();

		// Unset, blank or invalid values give the defaults 25 tabs and 40 subrequests (AC3).
		for (const extra of [{}, { MAX_TABS_PER_RUN: "", SUBREQUEST_BUDGET: "" }, { MAX_TABS_PER_RUN: "x", SUBREQUEST_BUDGET: "-3" }]) {
			const { env: e } = await makeEnv(extra);
			const d = syncDepsFor(e.DB, e as never);
			expect(d.limits, JSON.stringify(extra)).toEqual({ maxTabsPerRun: 25, subrequestBudget: 40 });
		}

		// One budget per call: a second call gets a fresh counter.
		const first = syncDepsFor(env.DB, env as never);
		const second = syncDepsFor(env.DB, env as never);
		expect(first.budget).not.toBe(second.budget);
	});

	it("db calls through the deps spend budget", async () => {
		const { env } = await makeEnv({ SUBREQUEST_BUDGET: "10" });
		const deps = syncDepsFor(env.DB, env as never);
		expect(deps.budget?.used).toBe(0);
		await deps.db.prepare("SELECT COUNT(*) AS n FROM hotels").first();
		expect(deps.budget?.used).toBe(1);
	});

	it("fetch through the source spends budget", async () => {
		const stub = vi.fn(async () => new Response("ok"));
		vi.stubGlobal("fetch", stub);
		try {
			const { env } = await makeEnv({ SUBREQUEST_BUDGET: "10" });
			const deps = syncDepsFor(env.DB, env as never);
			const { fetchFn } = lastFactoryOptions();
			const res = await fetchFn("https://example.test/page");
			expect(await res.text()).toBe("ok");
			expect(stub).toHaveBeenCalledTimes(1);
			expect(deps.budget?.used).toBe(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("wrapped fetch keeps a safe receiver", async () => {
		const stub = function (this: unknown) {
			if (this !== globalThis) throw new TypeError("Illegal invocation");
			return Promise.resolve(new Response("ok"));
		};
		vi.stubGlobal("fetch", stub);
		try {
			const { env } = await makeEnv();
			syncDepsFor(env.DB, env as never);
			const { fetchFn } = lastFactoryOptions();
			await expect(fetchFn("https://example.test/page")).resolves.toBeInstanceOf(Response);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("scheduled and manual still skip on unconfigured folder id and never throw", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const extra of [{ DRIVE_FOLDER_ID: undefined }, { DRIVE_FOLDER_ID: "  " }, { DRIVE_FOLDER_ID: "REPLACE_WITH_DRIVE_FOLDER_ID" }]) {
			mockedFactory.mockClear();
			const { db, env } = await makeEnv({ ...extra, SYNC_TOKEN: TOKEN });
			const { ctx, settle } = makeCtx();
			expect(() => site.scheduled({} as ScheduledController, env as never, ctx), JSON.stringify(extra)).not.toThrow();
			await settle();
			expect(mockedFactory, JSON.stringify(extra)).not.toHaveBeenCalled();
			expect(await count(db, "sync_runs"), JSON.stringify(extra)).toBe(0);

			const res = await site.fetch(
				new Request("https://example.test/internal/sync", {
					method: "POST",
					headers: { "CF-Connecting-IP": "8.8.8.8", Authorization: `Bearer ${TOKEN}` },
				}),
				env as never,
				makeCtx().ctx,
			);
			expect(res.status, JSON.stringify(extra)).not.toBe(200);
			expect(mockedFactory, JSON.stringify(extra)).not.toHaveBeenCalled();
			expect(await count(db, "sync_runs"), JSON.stringify(extra)).toBe(0);
		}
		expect(errorSpy).toHaveBeenCalled();
	});
});

describe("site: POST /internal/sync", () => {
	function post(env: Env, headers: Record<string, string> = {}) {
		return site.fetch(
			new Request("https://example.test/internal/sync", {
				method: "POST",
				headers: { "CF-Connecting-IP": "9.9.9.9", ...headers },
			}),
			env as never,
			makeCtx().ctx,
		);
	}

	it("POST /internal/sync is 404 without SYNC_TOKEN and 200 with the token", async () => {
		const unset = await makeEnv();
		const res404 = await post(unset.env, { Authorization: `Bearer ${TOKEN}` });
		expect(res404.status).toBe(404);

		const empty = await makeEnv({ SYNC_TOKEN: "" });
		expect((await post(empty.env, { Authorization: "Bearer " })).status).toBe(404);

		const { env } = await makeEnv({ SYNC_TOKEN: TOKEN });
		const denied = await post(env, { Authorization: "Bearer wrong" });
		expect(denied.status).toBe(401);

		const res = await post(env, { Authorization: `Bearer ${TOKEN}` });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// AC9: counts and failure codes only. The parser is a stub, so the tab is reported.
		expect(body).toMatchObject({ failed: 1, failures: [{ tab: TAB.tabName, reason: "parser_not_configured" }] });
		const text = JSON.stringify(body);
		expect(text).not.toContain("http");
		expect(text).not.toContain(TOKEN);
		expect(text).not.toContain(FOLDER);
	});
});

describe("stub parser (src/sync/rowParser.ts)", () => {
	it("stub parser reports parser_not_configured and publishes nothing", async () => {
		expect(parseSheetRows("stars=4\nprice=1500000", TAB)).toEqual({
			ok: false,
			reason: "parser_not_configured",
		});

		const { db, env } = await makeEnv();
		const { ctx, settle } = makeCtx();
		site.scheduled({} as ScheduledController, env as never, ctx);
		await settle();

		expect(await count(db, "hotels")).toBe(0);
		expect(await count(db, "sync_runs")).toBe(1);
	});
});
