import { describe, expect, it } from "vitest";
import config from "../../vitest.unit.config.mts";

describe("unit config", () => {
	it("unit config includes test/sync specs", () => {
		const include = config.test?.include ?? [];

		expect(include).toContain("test/sync/**/*.spec.ts");
		for (const existing of [
			"test/db/**/*.spec.ts",
			"test/domain/**/*.spec.ts",
			"test/migrations/**/*.spec.ts",
			"test/fakes/**/*.spec.ts",
			"test/web/**/*.spec.{ts,tsx}",
			"test/client/**/*.spec.ts",
		]) {
			expect(include).toContain(existing);
		}
	});
});
