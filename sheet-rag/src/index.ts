interface Bindings {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  SHEET_CSV_URL: string;
}

const EMBED_MODEL = "@cf/baai/bge-m3"; // multilingual, 1024 dims
const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ROWS_PER_CHUNK = 8;
const HEADER_ROWS = 2;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// The sheet is a layout, not a table: blank rows separate sections, and the
// first column is only filled on the first row of each group.
function sheetToChunks(csv: string): { id: string; text: string }[] {
  const rows = parseCsv(csv).map(r => r.map(clean));
  const title = rows.find(r => r.some(Boolean))?.find(Boolean) ?? "";

  const blocks: string[][][] = [];
  let current: string[][] = [];
  for (const r of rows) {
    if (r.some(Boolean)) current.push(r);
    else if (current.length) { blocks.push(current); current = []; }
  }
  if (current.length) blocks.push(current);

  const chunks: { id: string; text: string }[] = [];
  blocks.forEach((block, b) => {
    let group = "";
    const lines = block.map(r => {
      if (r[0]) group = r[0];
      else if (group) r = [group, ...r.slice(1)];
      return r.filter(Boolean).join(" | ");
    });
    const header = lines.slice(0, HEADER_ROWS);
    const body = lines.slice(HEADER_ROWS);
    if (!body.length) {
      chunks.push({ id: `b${b}-0`, text: `${title}\n${header.join("\n")}` });
      return;
    }
    for (let i = 0; i < body.length; i += ROWS_PER_CHUNK) {
      chunks.push({
        id: `b${b}-${i / ROWS_PER_CHUNK}`,
        text: [title, ...header, ...body.slice(i, i + ROWS_PER_CHUNK)].join("\n"),
      });
    }
  });
  return chunks;
}

async function embed(env: Bindings, texts: string[]): Promise<number[][]> {
  const out = (await env.AI.run(EMBED_MODEL as any, { text: texts } as any)) as any;
  return out.data;
}

async function ingest(env: Bindings) {
  const res = await fetch(env.SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const chunks = sheetToChunks(await res.text());

  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const vectors = await embed(env, batch.map(c => c.text));
    await env.VECTORIZE.upsert(batch.map((c, j) => ({
      id: c.id,
      values: vectors[j],
      metadata: { text: c.text },
    })));
  }
  return { ingested: chunks.length, preview: chunks.map(c => c.text.slice(0, 120)) };
}

async function search(env: Bindings, query: string, topK = 5) {
  const [vector] = await embed(env, [query]);
  const res = await env.VECTORIZE.query(vector, { topK, returnMetadata: "all" });
  return res.matches.map(m => ({ id: m.id, score: m.score, text: String(m.metadata?.text ?? "") }));
}

async function chat(env: Bindings, question: string, history: { role: string; content: string }[] = []) {
  const hits = (await search(env, question)).filter(h => h.score > 0.4);
  const context = hits.map((h, i) => `[${i + 1}]\n${h.text}`).join("\n\n");
  const messages = [
    {
      role: "system",
      content:
        "You are a hotel booking assistant. Answer ONLY using the context below. " +
        "If the answer is not in the context, say you don't know. " +
        "Reply in the same language as the user's question. Prices are in VND.\n\n" +
        `Context:\n${context || "(no relevant data found)"}`,
    },
    ...history.slice(-6),
    { role: "user", content: question },
  ];
  const out = (await env.AI.run(CHAT_MODEL as any, { messages } as any)) as any;
  return { answer: out.response, sources: hits.map(h => ({ id: h.id, score: h.score })) };
}

export default {
  async fetch(req: Request, env: Bindings): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/ingest" && req.method === "POST") return Response.json(await ingest(env));
      if (url.pathname === "/search") return Response.json(await search(env, url.searchParams.get("q") ?? ""));
      if (url.pathname === "/chat" && req.method === "POST") {
        const { question, history } = (await req.json()) as any;
        return Response.json(await chat(env, question, history));
      }
      return new Response("POST /ingest · GET /search?q=... · POST /chat {question}");
    } catch (e: any) {
      return Response.json({ error: e.message ?? String(e) }, { status: 500 });
    }
  },
};