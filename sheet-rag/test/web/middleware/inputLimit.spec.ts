import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
	inputLimit,
	SEARCH_MAX_CHARS,
	CHAT_MAX_CHARS,
} from "../../../src/web/middleware/inputLimit";

// Stub handler: stands in for the AI call and records whether it was reached.
function buildApp(opts: Parameters<typeof inputLimit>[0]) {
	const stub = vi.fn(async (c: any) => {
		const text = c.req.header("content-type")?.includes("json")
			? await c.req.json()
			: null;
		return c.json({ ok: true, body: text });
	});
	const app = new Hono();
	app.use("*", inputLimit(opts));
	app.get("/search", stub);
	app.post("/chat", stub);
	app.put("/chat", stub);
	return { app, stub };
}

describe("inputLimit middleware (TASK-13)", () => {
	it("refuses an over-long query field and never reaches the handler", async () => {
		const { app, stub } = buildApp({ queryFields: ["q"], maxChars: 200 });
		const res = await app.request(`/search?q=${"a".repeat(201)}`);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "input_too_long",
			field: "q",
			max: 200,
		});
		expect(stub).not.toHaveBeenCalled();
	});

	it("accepts exactly the maximum length", async () => {
		const { app, stub } = buildApp({ queryFields: ["q"], maxChars: 200 });
		const res = await app.request(`/search?q=${"a".repeat(200)}`);
		expect(res.status).toBe(200);
		expect(stub).toHaveBeenCalledTimes(1);
	});

	it("refuses an over-long JSON body field and the handler can still read a valid body", async () => {
		const { app, stub } = buildApp({ bodyFields: ["message"], maxChars: 10 });

		const tooLong = await app.request("/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "x".repeat(11) }),
		});
		expect(tooLong.status).toBe(400);
		expect(await tooLong.json()).toEqual({
			error: "input_too_long",
			field: "message",
			max: 10,
		});
		expect(stub).not.toHaveBeenCalled();

		const payload = { message: "hello", extra: { nested: [1, 2, 3] } };
		const ok = await app.request("/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		expect(ok.status).toBe(200);
		expect(stub).toHaveBeenCalledTimes(1);
		expect(await ok.json()).toEqual({ ok: true, body: payload });
	});

	it("refuses a body above maxBodyBytes with 413", async () => {
		const { app, stub } = buildApp({
			bodyFields: ["message"],
			maxChars: 1000,
			maxBodyBytes: 100,
		});
		const body = JSON.stringify({ message: "x".repeat(200) });
		const res = await app.request("/chat", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"content-length": String(new TextEncoder().encode(body).length),
			},
			body,
		});
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "body_too_large" });
		expect(stub).not.toHaveBeenCalled();
	});

	it("counts code points for Vietnamese text and emoji", async () => {
		// Length is counted in Unicode code points ([...str].length), not UTF-16
		// units. "ệ" can be one precomposed code point or "e" + U+0323 + U+0302
		// (two code points); both forms are built here and must count by code point.
		const precomposed = "ệ".repeat(200); // 200 code points, 200 UTF-16 units
		const decomposed = "ệ".repeat(200); // 400 code points, 600 UTF-16 units
		const emoji = "😀".repeat(200); // 200 code points, 400 UTF-16 units
		const emojiPlusOne = "😀".repeat(201);

		expect([...precomposed].length).toBe(200);
		expect([...decomposed].length).toBe(600); // 200 * 3 code points
		expect([...emoji].length).toBe(200);

		const { app } = buildApp({ queryFields: ["q"], maxChars: 200 });

		const ok = await app.request(`/search?q=${encodeURIComponent(precomposed)}`);
		expect(ok.status).toBe(200);

		const emojiOk = await app.request(`/search?q=${encodeURIComponent(emoji)}`);
		expect(emojiOk.status).toBe(200);

		const emojiOver = await app.request(
			`/search?q=${encodeURIComponent(emojiPlusOne)}`,
		);
		expect(emojiOver.status).toBe(400);

		// Decomposed form has more code points than the cap, so it is refused
		// even though its UTF-16 length is also above 200.
		const decomposedOver = await app.request(
			`/search?q=${encodeURIComponent(decomposed)}`,
		);
		expect(decomposedOver.status).toBe(400);
		expect(await decomposedOver.json()).toEqual({
			error: "input_too_long",
			field: "q",
			max: 200,
		});
	});

	it("ignores missing fields, non-strings and invalid JSON", async () => {
		const { app, stub } = buildApp({
			queryFields: ["q"],
			bodyFields: ["message"],
			maxChars: 5,
		});

		// missing query field
		const noQuery = await app.request("/search");
		expect(noQuery.status).toBe(200);

		// missing body field
		const missing = await app.request("/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ other: "x".repeat(50) }),
		});
		expect(missing.status).toBe(200);

		// non-string body field (number, array, object, null)
		for (const value of [123456789, ["x".repeat(50)], { a: "x".repeat(50) }, null]) {
			const res = await app.request("/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: value }),
			});
			expect(res.status).toBe(200);
		}

		// invalid JSON is passed on to the handler, which decides
		const invalid = await app.request("/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not json",
		});
		expect(invalid.status).toBe(500);
		expect(stub).toHaveBeenCalled();
	});

	it("exports the default limits", () => {
		expect(SEARCH_MAX_CHARS).toBe(200);
		expect(CHAT_MAX_CHARS).toBe(1000);
	});
});
