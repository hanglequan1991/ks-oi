import { describe, expect, it } from "vitest";
import { contentHash, hotelIdFor, sha256Hex } from "../../src/sync/hash";

describe("hash helpers", () => {
	it("sha256Hex known vector and hotelIdFor is 16 hex and stable", async () => {
		expect(await sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		const id = await hotelIdFor("file123", "0");
		expect(id).toMatch(/^[0-9a-f]{16}$/);
		expect(id).toBe((await sha256Hex("file123:0")).slice(0, 16));
		expect(await hotelIdFor("file123", "0")).toBe(id);
	});

	it("contentHash changes with version and with csv", async () => {
		const base = await contentHash("a,b", "v1");
		expect(base).toBe(await sha256Hex("v1\na,b"));
		expect(await contentHash("a,b", "v2")).not.toBe(base);
		expect(await contentHash("a,c", "v1")).not.toBe(base);
	});
});
