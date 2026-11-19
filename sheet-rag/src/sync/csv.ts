// RFC 4180 CSV parser. Pure code, never throws.
// Cell text is returned verbatim (no trimming). A leading BOM is stripped.
// Row endings: CRLF, LF or bare CR, unless inside quotes.
// An unterminated quote consumes the rest of the text.

export function parseCsv(text: string): string[][] {
	const src = text.startsWith("﻿") ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	let i = 0;

	while (i < src.length) {
		const c = src[i];
		if (inQuotes) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
			} else {
				field += c;
			}
			i++;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\r" || c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			if (c === "\r" && src[i + 1] === "\n") i++;
		} else {
			field += c;
		}
		i++;
	}

	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
