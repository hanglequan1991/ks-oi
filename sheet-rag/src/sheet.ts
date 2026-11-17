export type Chunk = { key: string; text: string };

const ROWS_PER_CHUNK = 15;
const HEADER_ROWS = 2;
// Vectorize allows 10 KiB of metadata per vector; leave room for the other fields.
const MAX_CHUNK_BYTES = 9000;

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [],
		field = "",
		inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') inQuotes = false;
			else field += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function truncateBytes(text: string, max: number): string {
	const bytes = new TextEncoder().encode(text);
	if (bytes.length <= max) return text;
	return new TextDecoder().decode(bytes.slice(0, max)).replace(/�$/, "") + "…";
}

// The sheets are layouts, not tables: blank rows separate sections, the first
// column is only filled on the first row of each group, and a lone one-cell
// block is a heading for the blocks after it.
export function sheetToChunks(csv: string, label: string): Chunk[] {
	const rows = parseCsv(csv).map((r) => r.map(clean));
	const title = rows.find((r) => r.some(Boolean))?.find(Boolean) ?? "";

	const blocks: string[][][] = [];
	let current: string[][] = [];
	for (const r of rows) {
		if (r.some(Boolean)) current.push(r);
		else if (current.length) {
			blocks.push(current);
			current = [];
		}
	}
	if (current.length) blocks.push(current);

	const chunks: Chunk[] = [];
	let section = "";
	blocks.forEach((block, b) => {
		const isHeading = block.length === 1 && block[0].filter(Boolean).length === 1;
		if (isHeading) section = block[0].find(Boolean)!;

		let group = "";
		const lines = block.map((r) => {
			if (r[0]) group = r[0];
			else if (group) r = [group, ...r.slice(1)];
			return r.filter(Boolean).join(" | ");
		});
		const context = [label];
		if (title) context.push(title);
		if (section && section !== title && !isHeading) context.push(section);
		const header = lines.slice(0, HEADER_ROWS).filter((l) => l !== title);
		const body = lines.slice(HEADER_ROWS);

		const parts = body.length ? Math.ceil(body.length / ROWS_PER_CHUNK) : 1;
		for (let p = 0; p < parts; p++) {
			const rowsInPart = body.slice(p * ROWS_PER_CHUNK, (p + 1) * ROWS_PER_CHUNK);
			chunks.push({
				key: `b${b}-${p}`,
				text: truncateBytes([...context, ...header, ...rowsInPart].join("\n"), MAX_CHUNK_BYTES),
			});
		}
	});
	return chunks;
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
