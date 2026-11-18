import { describe, it, expect } from "vitest";
import { vi } from "../../src/web/i18n/vi";
import { en } from "../../src/web/i18n/en";

type Leaves = Array<[string, string]>;

function leaves(obj: unknown, prefix = ""): Leaves {
	if (typeof obj === "string") return [[prefix, obj]];
	const out: Leaves = [];
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		out.push(...leaves(v, prefix ? `${prefix}.${k}` : k));
	}
	return out;
}

function placeholders(s: string): string[] {
	return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("i18n dictionary parity (AC6)", () => {
	it("vi and en have the same keys", () => {
		const viKeys = leaves(vi).map(([k]) => k).sort();
		const enKeys = leaves(en).map(([k]) => k).sort();
		expect(enKeys).toEqual(viKeys);
		expect(viKeys).toContain("common.siteName");
		expect(viKeys).toContain("price.feeNote");
		expect(viKeys).toContain("errors.tooManyRequests");
	});

	it("no empty strings and same placeholders", () => {
		const enMap = new Map(leaves(en));
		for (const [key, viText] of leaves(vi)) {
			const enText = enMap.get(key);
			expect(viText.trim(), `vi ${key} is empty`).not.toBe("");
			expect(enText?.trim(), `en ${key} is empty`).not.toBe("");
			expect(placeholders(enText ?? ""), `placeholders of ${key}`).toEqual(
				placeholders(viText),
			);
		}
	});
});
