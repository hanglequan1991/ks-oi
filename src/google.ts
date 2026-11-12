// Uses Google's public, unauthenticated pages instead of the Drive/Sheets APIs,
// so no API key is needed. These pages are undocumented and could change; the
// parsers throw rather than return an empty list so a format change never
// looks like "every file was deleted".

export type DriveFile = { id: string; name: string; modified: string };
export type SheetTab = { gid: string; name: string };

const decodeJsString = (s: string) =>
	s
		.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
		.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
		.replace(/\\\//g, "/")
		.replace(/\\"/g, '"');

const decodeHtml = (s: string) =>
	s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();

export async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
	let last: Response | undefined;
	for (let i = 0; i < tries; i++) {
		last = await fetch(url, { redirect: "follow" });
		if (last.status !== 429 && last.status < 500) return last;
		await new Promise((r) => setTimeout(r, 2 ** i * 1000 + Math.random() * 500));
	}
	return last!;
}

export async function listFolder(folderId: string): Promise<DriveFile[]> {
	const res = await fetchWithRetry(`https://drive.google.com/embeddedfolderview?id=${folderId}`);
	if (!res.ok) throw new Error(`Folder fetch failed: ${res.status}`);
	const html = await res.text();
	const files: DriveFile[] = [];
	const entry = /href="https:\/\/(?:docs|drive)\.google\.com\/(?:spreadsheets|file)\/d\/([\w-]+)[^"]*"[\s\S]*?flip-entry-title">([^<]+)<[\s\S]*?flip-entry-last-modified"><div>([^<]*)</g;
	for (const m of html.matchAll(entry)) files.push({ id: m[1], name: decodeHtml(m[2]), modified: m[3].trim() });
	if (!files.length) throw new Error("No files found in folder page; Google may have changed its format");
	return files;
}

export async function listTabs(fileId: string): Promise<SheetTab[]> {
	const res = await fetchWithRetry(`https://docs.google.com/spreadsheets/d/${fileId}/htmlview`);
	if (!res.ok) throw new Error(`Tab list fetch failed for ${fileId}: ${res.status}`);
	const html = await res.text();
	const tabs: SheetTab[] = [];
	const item = /items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*", gid: "(\d+)"/g;
	for (const m of html.matchAll(item)) tabs.push({ name: decodeJsString(m[1]), gid: m[2] });
	if (!tabs.length) throw new Error(`No tabs found for ${fileId}; Google may have changed its format`);
	return tabs;
}

export async function fetchTabCsv(fileId: string, gid: string): Promise<string> {
	const res = await fetchWithRetry(`https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}`);
	if (!res.ok) throw new Error(`CSV fetch failed for ${fileId}/${gid}: ${res.status}`);
	return res.text();
}
