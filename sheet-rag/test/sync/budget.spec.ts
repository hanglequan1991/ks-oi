import { describe, expect, it } from "vitest";
import {
	DEFAULT_MAX_TABS_PER_RUN,
	DEFAULT_SUBREQUEST_BUDGET,
	createDeadline,
	createSubrequestBudget,
	countingFetch,
	parseRunLimits,
} from "../../src/sync/budget";

describe("parseRunLimits", () => {
	it("parseRunLimits returns defaults when unset or blank", () => {
		expect(DEFAULT_SUBREQUEST_BUDGET).toBe(40);
		expect(DEFAULT_MAX_TABS_PER_RUN).toBe(25);
		expect(parseRunLimits({})).toEqual({ subrequestBudget: 40, maxTabsPerRun: 25 });
		expect(
			parseRunLimits({ SUBREQUEST_BUDGET: "", MAX_TABS_PER_RUN: "   " }),
		).toEqual({ subrequestBudget: 40, maxTabsPerRun: 25 });
	});

	it("parseRunLimits rejects junk, zero, negative and fractional values", () => {
		const defaults = { subrequestBudget: 40, maxTabsPerRun: 25 };
		for (const bad of ["abc", "12abc", "0", "-3", "2.5", "NaN", "Infinity", "1e3x"]) {
			expect(parseRunLimits({ SUBREQUEST_BUDGET: bad, MAX_TABS_PER_RUN: bad })).toEqual(
				defaults,
			);
		}
	});

	it("parseRunLimits accepts valid values and caps them", () => {
		expect(parseRunLimits({ SUBREQUEST_BUDGET: "1000", MAX_TABS_PER_RUN: "500" })).toEqual({
			subrequestBudget: 1000,
			maxTabsPerRun: 500,
		});
		expect(parseRunLimits({ SUBREQUEST_BUDGET: " 7 ", MAX_TABS_PER_RUN: "3" })).toEqual({
			subrequestBudget: 7,
			maxTabsPerRun: 3,
		});
		expect(parseRunLimits({ SUBREQUEST_BUDGET: "5000", MAX_TABS_PER_RUN: "9999" })).toEqual({
			subrequestBudget: 1000,
			maxTabsPerRun: 500,
		});
	});
});

describe("subrequest budget", () => {
	it("budget counts spend, remaining never below zero, canAfford and exhausted", () => {
		const budget = createSubrequestBudget(3);
		expect(budget.used).toBe(0);
		expect(budget.remaining).toBe(3);
		expect(budget.exhausted).toBe(false);
		expect(budget.canAfford(3)).toBe(true);
		expect(budget.canAfford(4)).toBe(false);

		budget.spend();
		budget.spend(2);
		expect(budget.used).toBe(3);
		expect(budget.remaining).toBe(0);
		expect(budget.exhausted).toBe(true);
		expect(budget.canAfford(1)).toBe(false);
		expect(budget.canAfford(0)).toBe(true);
	});

	it("budget keeps counting past the limit without throwing", () => {
		const budget = createSubrequestBudget(2);
		expect(() => budget.spend(5)).not.toThrow();
		expect(budget.used).toBe(5);
		expect(budget.remaining).toBe(0);
		expect(budget.exhausted).toBe(true);
		expect(() => budget.spend()).not.toThrow();
		expect(budget.used).toBe(6);
	});
});

describe("countingFetch", () => {
	it("countingFetch spends once per call including failing calls and passes results through", async () => {
		const budget = createSubrequestBudget(10);
		const response = new Response("ok");
		const calls: unknown[] = [];
		const fakeFetch = ((input: unknown, init: unknown) => {
			calls.push([input, init]);
			if (input === "boom") return Promise.reject(new TypeError("network down"));
			if (input === "sync") throw new RangeError("sync failure");
			return Promise.resolve(response);
		}) as unknown as typeof fetch;

		const counted = countingFetch(fakeFetch, budget);
		expect(await counted("https://example.test/a", { method: "GET" })).toBe(response);
		expect(budget.used).toBe(1);
		await expect(counted("boom")).rejects.toThrow("network down");
		expect(budget.used).toBe(2);
		expect(() => counted("sync")).toThrow("sync failure");
		expect(budget.used).toBe(3);
		expect(calls).toEqual([
			["https://example.test/a", { method: "GET" }],
			["boom", undefined],
			["sync", undefined],
		]);
	});
});

describe("createDeadline", () => {
	it("deadline reports soft at 8 minutes and hard at 10 minutes with injected clock", () => {
		const minute = 60_000;
		let now = 1_000_000;
		const deadline = createDeadline(1_000_000, () => now);

		expect(deadline.elapsedMs()).toBe(0);
		expect(deadline.softExceeded()).toBe(false);
		expect(deadline.hardExceeded()).toBe(false);

		now = 1_000_000 + 8 * minute - 1;
		expect(deadline.softExceeded()).toBe(false);

		now = 1_000_000 + 8 * minute;
		expect(deadline.elapsedMs()).toBe(8 * minute);
		expect(deadline.softExceeded()).toBe(true);
		expect(deadline.hardExceeded()).toBe(false);

		now = 1_000_000 + 10 * minute;
		expect(deadline.hardExceeded()).toBe(true);
		expect(deadline.softExceeded()).toBe(true);
	});

	it("accepts custom soft and hard limits", () => {
		let now = 0;
		const deadline = createDeadline(0, () => now, { softMs: 100, hardMs: 200 });
		now = 100;
		expect(deadline.softExceeded()).toBe(true);
		expect(deadline.hardExceeded()).toBe(false);
		now = 200;
		expect(deadline.hardExceeded()).toBe(true);
	});
});
