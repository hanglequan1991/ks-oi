// Pure pricing helpers (technical-design.html section 9). No I/O, no imports.

export const DEFAULT_FEE_PERCENT = 10;

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

export function finalPrice(base: number, feePercent: number): number {
	const pct = clampPercent(feePercent);
	return Math.round((base * (100 + pct)) / 100 / 1000) * 1000; // nearest 1,000 VND
}

export function parseFeePercent(raw: string | null | undefined): {
	percent: number;
	warning?: string;
} {
	const trimmed = typeof raw === "string" ? raw.trim() : "";
	if (trimmed !== "") {
		const value = Number(trimmed);
		if (Number.isFinite(value)) {
			return { percent: clampPercent(value) };
		}
	}
	return {
		percent: DEFAULT_FEE_PERCENT,
		warning: `Invalid service fee percent ${JSON.stringify(raw ?? null)}; using ${DEFAULT_FEE_PERCENT}`,
	};
}

export function parseBoolSetting(
	raw: string | null | undefined,
	fallback: boolean,
): boolean {
	const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
	if (normalized === "true" || normalized === "1") return true;
	if (normalized === "false" || normalized === "0") return false;
	return fallback;
}
