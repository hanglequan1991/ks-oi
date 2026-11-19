// Optional free-text extraction for hotel descriptions and facilities.
// The passthrough extractor stores raw text. The AI extractor asks a Workers AI
// model for a cleaned Vietnamese description and a facilities list. It never
// sees booking rules, prices or image URLs, and it never throws: on a bad
// reply it falls back to the passthrough result with a warning.

export const EXTRACTOR_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Bump when the model or the request shape changes, so cached results are not reused across them.
export const EXTRACTOR_VERSION = "extract-v2";

const MAX_TEXT = 4000;
const MAX_FACILITIES = 80;
const MAX_FACILITY_LENGTH = 80;

export type ExtractKind = "description" | "facilities";

export type ExtractInput = { text: string; kind: ExtractKind };

export type ExtractResult = {
	descriptionVi?: string | null;
	facilities?: string[];
	/** Set only when the AI reply was unusable and the passthrough result was used. */
	warning?: "extractor_fallback";
};

export interface FreeTextExtractor {
	extract(input: ExtractInput): Promise<ExtractResult>;
}

/** The part of the Workers AI binding this module uses. */
export type AiLike = { run(model: string, input: unknown): Promise<unknown> };

export function createPassthroughExtractor(): FreeTextExtractor {
	return {
		async extract({ text, kind }: ExtractInput): Promise<ExtractResult> {
			if (kind === "description") {
				return { descriptionVi: text };
			}
			return { facilities: splitFacilities(text) };
		},
	};
}

export function pickExtractor(env: { AI?: AiLike }): FreeTextExtractor {
	return env.AI ? createAiExtractor(env.AI) : createPassthroughExtractor();
}

export function createAiExtractor(ai: AiLike): FreeTextExtractor {
	const passthrough = createPassthroughExtractor();

	return {
		async extract(input: ExtractInput): Promise<ExtractResult> {
			try {
				// One retry on a bad reply. A thrown error from the binding is not
				// retried: it falls back at once.
				for (let attempt = 0; attempt < 2; attempt++) {
					let reply: unknown;
					try {
						reply = await ai.run(EXTRACTOR_MODEL, buildRequest(input));
					} catch {
						break;
					}
					const parsed = parseReply(reply);
					if (parsed) {
						return parsed;
					}
				}
			} catch {
				// Never throw from the extractor. Fall through to the passthrough result.
			}
			const fallback = await passthrough.extract(input);
			return { ...fallback, warning: "extractor_fallback" };
		},
	};
}

function splitFacilities(text: string): string[] {
	return text
		.split(/[,\n]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

const SYSTEM_PROMPT = [
	"You clean up hotel text for a Vietnamese travel website.",
	'Reply with JSON only, no prose, in the form {"descriptionVi": string or null, "facilities": string[]}.',
	"descriptionVi is a short Vietnamese description. facilities is a list of short facility names.",
	"Do not mention room prices, booking rules or image links.",
].join("\n");

// JSON mode: Workers AI constrains the reply to this schema.
const REPLY_SCHEMA = {
	type: "object",
	properties: {
		descriptionVi: { type: ["string", "null"] },
		facilities: { type: "array", items: { type: "string" } },
	},
	additionalProperties: false,
};

function buildRequest({ text, kind }: ExtractInput): unknown {
	return {
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: `Kind: ${kind}\nText:\n${text}` },
		],
		response_format: {
			type: "json_schema",
			json_schema: { name: "hotel_extraction", schema: REPLY_SCHEMA },
		},
	};
}

/** Returns the validated values, or null when the reply is unusable. */
function parseReply(reply: unknown): ExtractResult | null {
	let value: unknown = reply;
	if (reply && typeof reply === "object" && "response" in reply) {
		value = (reply as { response: unknown }).response;
	}
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return validateExtraction(value);
}

function validateExtraction(value: unknown): ExtractResult | null {
	if (!isPlainObject(value)) {
		return null;
	}
	const out: ExtractResult = {};

	if ("descriptionVi" in value && value.descriptionVi !== undefined) {
		const d = value.descriptionVi;
		if (d !== null && (typeof d !== "string" || d.length > MAX_TEXT)) {
			return null;
		}
		out.descriptionVi = d as string | null;
	}

	if ("facilities" in value && value.facilities !== undefined) {
		const f = value.facilities;
		if (!Array.isArray(f) || f.length > MAX_FACILITIES) {
			return null;
		}
		for (const item of f) {
			if (typeof item !== "string" || item.length > MAX_FACILITY_LENGTH) {
				return null;
			}
		}
		out.facilities = [...(f as string[])];
	}

	return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
