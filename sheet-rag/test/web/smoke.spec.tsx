import { describe, it, expect } from "vitest";
import { Hono } from "hono";

describe("web test setup (TASK-6)", () => {
	it("renders hono jsx to a string", async () => {
		const html = await (<p>hi</p>).toString();
		expect(html).toBe("<p>hi</p>");
	});

	it("hono app answers app.request without Cloudflare", async () => {
		const app = new Hono().get("/", (c) => c.text("ok"));
		const res = await app.request("/");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("runs with no CLOUDFLARE_API_TOKEN", () => {
		delete process.env.CLOUDFLARE_API_TOKEN;
		expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
	});
});
