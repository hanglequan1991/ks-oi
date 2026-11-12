export type ChatTurn = { role: "user" | "assistant"; content: string };

export const EMBED_MODEL = "@cf/baai/bge-m3"; // multilingual, 1024 dims
const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MIN_SCORE = 0.4;

export async function embed(ai: Ai, texts: string[]): Promise<number[][]> {
	const out = (await ai.run(EMBED_MODEL as any, { text: texts } as any)) as any;
	return out.data;
}

export async function search(ai: Ai, index: VectorizeIndex, query: string, topK = 6) {
	const [vector] = await embed(ai, [query]);
	const res = await index.query(vector, { topK, returnMetadata: "all" });
	return res.matches.map((m) => ({
		id: m.id,
		score: m.score,
		file: String(m.metadata?.file ?? ""),
		tab: String(m.metadata?.tab ?? ""),
		text: String(m.metadata?.text ?? ""),
	}));
}

export async function chat(ai: Ai, index: VectorizeIndex, question: string, history: ChatTurn[] = []) {
	const hits = (await search(ai, index, question)).filter((h) => h.score > MIN_SCORE);
	const context = hits.map((h, i) => `[${i + 1}] (${h.file} › ${h.tab})\n${h.text}`).join("\n\n");
	const messages = [
		{
			role: "system",
			content:
				"You are Khách Sạn Ơi, a hotel booking assistant for a Vietnamese travel agency. " +
				"Answer ONLY using the context below; each item is labelled with its city file and hotel tab. " +
				"If the answer is not in the context, say you don't know. Always name the hotel you are quoting. " +
				"Reply in the same language as the user's question. Prices are in VND unless stated otherwise.\n\n" +
				`Context:\n${context || "(no relevant data found)"}`,
		},
		...history.filter((t) => t.role === "user" || t.role === "assistant").slice(-6),
		{ role: "user", content: question },
	];
	const out = (await ai.run(CHAT_MODEL as any, { messages } as any)) as any;
	return { answer: String(out.response ?? ""), sources: hits };
}
