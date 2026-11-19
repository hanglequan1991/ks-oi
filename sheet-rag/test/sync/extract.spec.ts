import { describe, expect, it } from "vitest";
import {
	EXTRACTOR_MODEL,
	EXTRACTOR_VERSION,
	createAiExtractor,
	createPassthroughExtractor,
	pickExtractor,
} from "../../src/sync/extract";
import { createFakeAi } from "../fakes/extractor";

const reply = (value: unknown) => ({ response: JSON.stringify(value) });

describe("extract", () => {
	it("passthrough returns raw text and splits facilities", async () => {
		const extractor = createPassthroughExtractor();

		const raw = "  Khách sạn  gần biển.\n\nYên tĩnh  ";
		await expect(extractor.extract({ text: raw, kind: "description" })).resolves.toEqual({
			descriptionVi: raw,
		});

		await expect(
			extractor.extract({ text: "Wifi, Hồ bơi,\n  Bãi đỗ xe ,,", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Wifi", "Hồ bơi", "Bãi đỗ xe"] });
	});

	it("pickExtractor chooses by binding", async () => {
		const passthrough = await pickExtractor({}).extract({
			text: "Wifi, Gym",
			kind: "facilities",
		});
		expect(passthrough).toEqual({ facilities: ["Wifi", "Gym"] });

		const ai = createFakeAi([reply({ facilities: ["Spa"] })]);
		const viaAi = await pickExtractor({ AI: ai }).extract({
			text: "Spa and sauna",
			kind: "facilities",
		});
		expect(viaAi).toEqual({ facilities: ["Spa"] });
		expect(ai.calls).toHaveLength(1);
		expect(ai.calls[0].model).toBe(EXTRACTOR_MODEL);
	});

	it("ai extractor returns validated values", async () => {
		const ai = createFakeAi([
			reply({ descriptionVi: "Phòng đẹp, view biển.", facilities: ["Wifi", "Spa"] }),
		]);
		const extractor = createAiExtractor(ai);

		await expect(
			extractor.extract({ text: "Nice room, sea view. Wifi and spa.", kind: "description" }),
		).resolves.toEqual({ descriptionVi: "Phòng đẹp, view biển.", facilities: ["Wifi", "Spa"] });
		expect(ai.calls).toHaveLength(1);
		expect(ai.calls[0].model).toBe(EXTRACTOR_MODEL);
		expect(typeof EXTRACTOR_VERSION).toBe("string");
		expect(EXTRACTOR_VERSION.length).toBeGreaterThan(0);
	});

	it("ai extractor accepts a bare JSON string reply", async () => {
		const ai = createFakeAi([JSON.stringify({ facilities: ["Gym"] })]);
		await expect(
			createAiExtractor(ai).extract({ text: "Gym", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Gym"] });
	});

	it("invalid json twice falls back with warning", async () => {
		const ai = createFakeAi([{ response: "not json {" }, { response: "still { not json" }]);
		const extractor = createAiExtractor(ai);

		await expect(
			extractor.extract({ text: "Wifi, Gym", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Wifi", "Gym"], warning: "extractor_fallback" });
		expect(ai.calls).toHaveLength(2);
	});

	it("invalid json once then valid json succeeds on retry", async () => {
		const ai = createFakeAi([{ response: "oops" }, reply({ facilities: ["Gym"] })]);
		await expect(
			createAiExtractor(ai).extract({ text: "Gym", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Gym"] });
		expect(ai.calls).toHaveLength(2);
	});

	it("ai throwing falls back and does not throw", async () => {
		const ai = createFakeAi([new Error("workers ai unavailable")]);
		const extractor = createAiExtractor(ai);

		await expect(
			extractor.extract({ text: "Quiet street", kind: "description" }),
		).resolves.toEqual({ descriptionVi: "Quiet street", warning: "extractor_fallback" });
	});

	it("oversized fields rejected by validator", async () => {
		const longText = "x".repeat(4001);
		const longFacility = "y".repeat(81);
		const tooManyFacilities = Array.from({ length: 81 }, (_, i) => `f${i}`);

		const cases: unknown[] = [
			{ descriptionVi: longText },
			{ facilities: [longFacility] },
			{ facilities: tooManyFacilities },
		];

		for (const bad of cases) {
			const ai = createFakeAi([reply(bad), reply(bad)]);
			const result = await createAiExtractor(ai).extract({
				text: "Gym, Spa",
				kind: "facilities",
			});
			expect(result).toEqual({ facilities: ["Gym", "Spa"], warning: "extractor_fallback" });
			expect(ai.calls).toHaveLength(2);
		}
	});

	it("extractor model constant is the llama 3.3 70b fp8 fast model", () => {
		expect(EXTRACTOR_MODEL).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
	});

	it("extractor version is extract-v2", () => {
		expect(EXTRACTOR_VERSION).toBe("extract-v2");
	});

	it("ai extractor sends the model and json_schema response_format", async () => {
		const ai = createFakeAi([reply({ facilities: ["Gym"] })]);
		await createAiExtractor(ai).extract({ text: "Gym", kind: "facilities" });

		expect(ai.calls).toHaveLength(1);
		const input = ai.calls[0].input as {
			messages: unknown[];
			response_format: {
				type: string;
				json_schema: { name: string; schema: Record<string, any> };
			};
		};
		expect(ai.calls[0].model).toBe(EXTRACTOR_MODEL);
		expect(Array.isArray(input.messages)).toBe(true);
		expect(input.response_format.type).toBe("json_schema");
		expect(typeof input.response_format.json_schema.name).toBe("string");

		const schema = input.response_format.json_schema.schema;
		expect(schema.type).toBe("object");
		expect(schema.additionalProperties).toBe(false);
		expect(schema.properties.descriptionVi).toEqual({ type: ["string", "null"] });
		expect(schema.properties.facilities).toEqual({
			type: "array",
			items: { type: "string" },
		});
	});

	it("retry call also sends response_format", async () => {
		const ai = createFakeAi([{ response: "oops" }, reply({ facilities: ["Gym"] })]);
		await expect(
			createAiExtractor(ai).extract({ text: "Gym", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Gym"] });

		expect(ai.calls).toHaveLength(2);
		for (const call of ai.calls) {
			expect(call.model).toBe(EXTRACTOR_MODEL);
			expect((call.input as { response_format: { type: string } }).response_format.type).toBe(
				"json_schema",
			);
		}
	});

	it("ai extractor accepts an object response from json mode", async () => {
		const ai = createFakeAi([{ response: { facilities: ["Gym"] } }]);
		await expect(
			createAiExtractor(ai).extract({ text: "Gym", kind: "facilities" }),
		).resolves.toEqual({ facilities: ["Gym"] });
		expect(ai.calls).toHaveLength(1);
	});

	it("accepts values at the exact limits", async () => {
		const ai = createFakeAi([
			reply({
				descriptionVi: "d".repeat(4000),
				facilities: Array.from({ length: 80 }, () => "f".repeat(80)),
			}),
		]);
		const result = await createAiExtractor(ai).extract({ text: "x", kind: "description" });
		expect(result.warning).toBeUndefined();
		expect(result.descriptionVi).toHaveLength(4000);
		expect(result.facilities).toHaveLength(80);
	});
});
