import type { MiddlewareHandler } from "hono";

/** Default cap for the search query, in Unicode code points. */
export const SEARCH_MAX_CHARS = 200;
/** Default cap for a chat message, in Unicode code points. */
export const CHAT_MAX_CHARS = 1000;

/** Default cap for the raw JSON body, in bytes (Content-Length). */
const DEFAULT_MAX_BODY_BYTES = 8192;

export interface InputLimitOptions {
	/** Query-string fields to check (e.g. `["q"]`). */
	queryFields?: string[];
	/** Top-level string fields of a JSON body to check (e.g. `["message"]`). */
	bodyFields?: string[];
	/** Maximum length of each checked field, in Unicode code points. */
	maxChars: number;
	/** Maximum Content-Length of a JSON body, in bytes. Default 8192. */
	maxBodyBytes?: number;
	/** Reserved for localized refusal messages; the response shape is fixed. */
	messages?: Record<string, string>;
}

/**
 * Length in Unicode code points. Iterating a string yields code points, so
 * "e" + combining mark counts as 2 and an emoji counts as 1, unlike `.length`
 * which counts UTF-16 units.
 */
function codePointLength(value: string): number {
	return [...value].length;
}

function tooLong(field: string, max: number) {
	return { error: "input_too_long", field, max } as const;
}

/**
 * Refuses over-long input before the handler (and the AI call) runs.
 * Never calls `next()` on a refusal.
 */
export function inputLimit(opts: InputLimitOptions): MiddlewareHandler {
	const queryFields = opts.queryFields ?? [];
	const bodyFields = opts.bodyFields ?? [];
	const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

	return async (c, next) => {
		for (const field of queryFields) {
			const value = c.req.query(field);
			if (value !== undefined && codePointLength(value) > opts.maxChars) {
				return c.json(tooLong(field, opts.maxChars), 400);
			}
		}

		const method = c.req.method;
		const contentType = c.req.header("content-type") ?? "";
		const isJson = contentType.toLowerCase().includes("application/json");
		if (bodyFields.length > 0 && (method === "POST" || method === "PUT") && isJson) {
			const declared = c.req.header("content-length");
			if (declared !== undefined && Number(declared) > maxBodyBytes) {
				return c.json({ error: "body_too_large" }, 413);
			}

			// Read a clone so the handler can still read the full body.
			let parsed: unknown;
			try {
				parsed = await c.req.raw.clone().json();
			} catch {
				// Invalid JSON is the handler's concern, not this middleware's.
				return next();
			}

			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				const record = parsed as Record<string, unknown>;
				for (const field of bodyFields) {
					const value = record[field];
					if (typeof value === "string" && codePointLength(value) > opts.maxChars) {
						return c.json(tooLong(field, opts.maxChars), 400);
					}
				}
			}
		}

		return next();
	};
}
