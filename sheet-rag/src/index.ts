export interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  SHEET_CSV_URL: string;
}

const EMBED_MODEL = "@cf/baai/bge-m3"; // 768 dims, matches the index

// Minimal CSV parser that handles quoted fields with commas/newlines
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

async function ingest(env: Env) {
  const csv = await (await fetch(env.SHEET_CSV_URL)).text();
  const [header, ...data] = parseCsv(csv);
  const records = data
    .filter(r => r.some(Boolean))
    .map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));

  // Turn each row into one readable text chunk
  const docs = records.map(r => ({
    id: String(r.id),
    text: header.map(h => `${h}: ${r[h.trim()]}`).join("\n"),
    category: r.category ?? "",
  }));

  for (let i = 0; i < docs.length; i += 50) {
    const batch = docs.slice(i, i + 50);
    const { data: vectors } = await env.AI.run(EMBED_MODEL, { text: batch.map(d => d.text) });
    await env.VECTORIZE.upsert(batch.map((d, j) => ({
      id: d.id,
      values: vectors[j],
      metadata: { text: d.text, category: d.category },
    })));
  }
  return { ingested: docs.length };
}

async function search(env: Env, query: string, topK = 4) {
  const { data } = await env.AI.run(EMBED_MODEL, { text: [query] });
  const res = await env.VECTORIZE.query(data[0], { topK, returnMetadata: "all" });
  return res.matches.map(m => ({ score: m.score, text: m.metadata?.text as string }));
}