// Run limits, subrequest budget counter, counting fetch and wall-clock deadline.
// Pure code: no Cloudflare imports. Time and budgets are injected.

export const DEFAULT_SUBREQUEST_BUDGET = 40;
export const DEFAULT_MAX_TABS_PER_RUN = 25;

const MAX_SUBREQUEST_BUDGET = 1000;
const MAX_TABS_PER_RUN = 500;

const SOFT_DEADLINE_MS = 8 * 60_000;
const HARD_DEADLINE_MS = 10 * 60_000;

export type RunLimits = { subrequestBudget: number; maxTabsPerRun: number };

/** Reads a positive integer from a string. Anything else gives the fallback. */
function positiveInt(raw: string | undefined, fallback: number, cap: number): number {
	if (raw === undefined) return fallback;
	const text = raw.trim();
	if (!/^\+?\d+$/.test(text)) return fallback;
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value <= 0) return fallback;
	return Math.min(value, cap);
}

/** Parses SUBREQUEST_BUDGET and MAX_TABS_PER_RUN. Never throws. */
export function parseRunLimits(env: {
	SUBREQUEST_BUDGET?: string;
	MAX_TABS_PER_RUN?: string;
}): RunLimits {
	return {
		subrequestBudget: positiveInt(
			env.SUBREQUEST_BUDGET,
			DEFAULT_SUBREQUEST_BUDGET,
			MAX_SUBREQUEST_BUDGET,
		),
		maxTabsPerRun: positiveInt(env.MAX_TABS_PER_RUN, DEFAULT_MAX_TABS_PER_RUN, MAX_TABS_PER_RUN),
	};
}

export interface SubrequestBudget {
	spend(n?: number): void;
	readonly used: number;
	readonly remaining: number;
	canAfford(n: number): boolean;
	readonly exhausted: boolean;
}

/** Counts subrequests against a limit. Keeps counting past the limit so reports stay honest. */
export function createSubrequestBudget(limit: number): SubrequestBudget {
	let used = 0;
	const remainingNow = () => Math.max(0, limit - used);
	return {
		spend(n = 1) {
			if (Number.isFinite(n) && n > 0) used += n;
		},
		get used() {
			return used;
		},
		get remaining() {
			return remainingNow();
		},
		canAfford(n: number) {
			return remainingNow() >= n;
		},
		get exhausted() {
			return remainingNow() === 0;
		},
	};
}

/** Wraps fetch so each call spends one subrequest before delegating. Outcomes pass through unchanged. */
export function countingFetch(
	fetchFn: typeof fetch,
	budget: Pick<SubrequestBudget, "spend">,
): typeof fetch {
	const counted = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
		budget.spend(1);
		return fetchFn(...args);
	};
	return counted as typeof fetch;
}

export interface Deadline {
	elapsedMs(): number;
	softExceeded(): boolean;
	hardExceeded(): boolean;
}

/** Wall-clock deadline. Soft: stop starting new tabs. Hard: stop everything. */
export function createDeadline(
	startMs: number,
	nowMs: () => number,
	opts: { softMs?: number; hardMs?: number } = {},
): Deadline {
	const softMs = opts.softMs ?? SOFT_DEADLINE_MS;
	const hardMs = opts.hardMs ?? HARD_DEADLINE_MS;
	const elapsedMs = () => nowMs() - startMs;
	return {
		elapsedMs,
		softExceeded: () => elapsedMs() >= softMs,
		hardExceeded: () => elapsedMs() >= hardMs,
	};
}
