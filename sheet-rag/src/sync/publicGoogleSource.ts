/**
 * Public Google pages source for the hotel-dictionary sync (STORY-14, TASK-46).
 *
 * The Drive folder and its sheets are link-shared, so the sync reads the same
 * public pages with no credentials:
 *   - folder listing:  embeddedfolderview?id=<folderId>
 *   - tab list:        spreadsheets/d/<fileId>/htmlview
 *   - tab CSV:         spreadsheets/d/<fileId>/export?format=csv&gid=<gid>
 *
 * The tab list shape follows the real htmlview page (items.push({name, pageUrl,
 * gid})). Fixtures in test/fixtures/google/ mirror it. Page reads that fail
 * with HTTP 429 or HTTP 5xx are retried up to 3 tries. A thrown fetch is
 * classified into a cause (fetchErrors.ts) and reported as `<reason>_<cause>`:
 * subrequest_limit and illegal_invocation fail at once (no retry); timeout,
 * redirect_error and network_other are retried up to 3 tries. The owner must verify against the real pages on each first run (compare the
 * run's file and tab counts with the Drive folder).
 *
 * Safety: a page that does not parse is an error (SheetReadError), never an
 * empty list. A Google format change must never be read as a deletion.
 */
import { SheetConfigError, SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "./sheetSource";
import { classifyFetchError, type NetworkCause } from "./fetchErrors";

/** One entry of the folder page: a link carrying the file id, then the title. */
const FOLDER_ENTRY_RE =
	/href="https:\/\/[^"]*?(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})[^"]*"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;

/**
 * One tab entry of the htmlview page, real shape (verified on the live folder):
 *   items.push({name: "<js-escaped name>", pageUrl: "<url>", gid: "<digits>"...
 * pageUrl is optional here (older pages), and the entry is not closed by `})`
 * right after gid, so only name and gid are required.
 */
const TAB_ITEM_RE = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"(?:,\s*pageUrl:\s*"[^"]*")?,\s*gid:\s*"(\d+)"/g;

/** Retry policy for the public pages: 3 tries, backoff 1s and 2s, plus jitter. */
const MAX_TRIES = 3;
const BACKOFF_MS = [1000, 2000];
const MAX_JITTER_MS = 500;

/** Thrown-fetch causes that are never retried (one call, no sleep). */
const NO_RETRY_CAUSES: ReadonlySet<NetworkCause> = new Set<NetworkCause>(["subrequest_limit", "illegal_invocation"]);

/** Trailing `.xlsx` of a Drive file name (the city is the name without it). */
const XLSX_SUFFIX_RE = /\.xlsx$/i;

/** Escape sequences in the htmlview JS string literal (\", \\, \xNN, \uXXXX, ...). */
const JS_ESCAPE_RE = /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g;

/** HTML character references in a folder title (named, decimal, hex). */
const HTML_ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

const NAMED_ENTITIES = new Map<string, string>([
	["amp", "&"],
	["lt", "<"],
	["gt", ">"],
	["quot", '"'],
	["apos", "'"],
	["nbsp", " "],
]);

const JS_SIMPLE_ESCAPES = new Map<string, string>([
	["n", "\n"],
	["t", "\t"],
	["r", "\r"],
]);

/** A CSV body that is really an HTML page (sheet not link-shared, login page). */
const HTML_PAGE_RE = /^\s*(<!DOCTYPE|<html)/i;

export type PublicGoogleSourceOptions = {
	folderId: string;
	/** SKIP_TABS entries: "File name/Tab name" or a tab name alone (see buildSkipMatcher). */
	skipTabs?: string[];
	fetchFn?: typeof fetch;
	/** Waits between tries; tests inject a fake so they run instantly. */
	sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createPublicGoogleSource(opts: PublicGoogleSourceOptions): SheetSource {
	const folderId = typeof opts.folderId === "string" ? opts.folderId.trim() : "";
	if (folderId === "") {
		throw new SheetConfigError("folder id is missing");
	}
	const skip = buildSkipMatcher(opts.skipTabs ?? []);
	const fetchFn: typeof fetch = opts.fetchFn ?? fetch;
	const sleep = opts.sleep ?? realSleep;

	/**
	 * GET a page as text. Up to MAX_TRIES tries on HTTP 429, HTTP >= 500 or a
	 * thrown fetch (subrequest_limit and illegal_invocation fail at once);
	 * other statuses fail at once. Errors carry only a sanitized
	 * reason code, never the URL.
	 */
	async function getText(url: string, failReason: string): Promise<string> {
		for (let attempt = 1; ; attempt++) {
			if (attempt > 1) {
				const jitter = Math.floor(Math.random() * (MAX_JITTER_MS + 1));
				await sleep(BACKOFF_MS[attempt - 2] + jitter);
			}
			const last = attempt === MAX_TRIES;
			let res: Response;
			try {
				res = await fetchFn(url);
			} catch (err) {
				// Only the cause is kept: the error text may contain the URL.
				const cause = classifyFetchError(err);
				// Retrying a subrequest limit or an illegal invocation is pointless.
				if (last || NO_RETRY_CAUSES.has(cause)) {
					throw new SheetReadError(`${failReason}_${cause}`, cause);
				}
				continue;
			}
			if (res.ok) {
				return res.text();
			}
			const retryable = res.status === 429 || res.status >= 500;
			if (!retryable || last) {
				throw new SheetReadError(`${failReason}_http_${res.status}`);
			}
		}
	}

	return {
		async listFiles(): Promise<SheetFile[]> {
			const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;
			const html = await getText(url, "folder_fetch");
			const files = parseFolderFiles(html);
			if (files.length === 0) {
				throw new SheetReadError("folder_parse_empty");
			}
			return files;
		},

		async listTabs(file: SheetFile): Promise<SheetTab[]> {
			const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.fileId)}/htmlview`;
			const html = await getText(url, "tab_list_fetch");
			const parsed = parseTabs(html);
			if (parsed.length === 0) {
				throw new SheetReadError("tab_list_parse_empty");
			}
			return parsed
				.filter((t) => !skip(file.fileName, t.tabName))
				.map((t) => ({ fileId: file.fileId, fileName: file.fileName, gid: t.gid, tabName: t.tabName }));
		},

		async readCsv(tab: SheetTab): Promise<string> {
			const url =
				`https://docs.google.com/spreadsheets/d/${encodeURIComponent(tab.fileId)}` +
				`/export?format=csv&gid=${encodeURIComponent(tab.gid)}`;
			const text = await getText(url, "csv");
			if (HTML_PAGE_RE.test(text)) {
				throw new SheetReadError("csv_html_page");
			}
			if (text.trim() === "") {
				throw new SheetReadError("csv_empty");
			}
			return text;
		},
	};
}

/** Comparison key: NFC-normalised, trimmed, lower-cased. */
function skipKey(text: string): string {
	return text.normalize("NFC").trim().toLowerCase();
}

/**
 * Builds the SKIP_TABS test. An entry is either "File name/Tab name" or a tab
 * name alone. A tab is skipped when its normalised entry equals either
 * "<fileName>/<tabName>" or "<tabName>" (both compared as whole strings, so a
 * tab name containing "/" still matches its own whole-name entry). Matching is
 * case-insensitive and NFC-normalised. Blank entries match nothing.
 */
export function buildSkipMatcher(entries: string[]): (fileName: string, tabName: string) => boolean {
	const keys = new Set<string>();
	for (const entry of entries) {
		const key = skipKey(entry);
		if (key !== "") keys.add(key);
	}
	return (fileName: string, tabName: string): boolean => {
		if (keys.size === 0) return false;
		return keys.has(skipKey(`${fileName}/${tabName}`)) || keys.has(skipKey(tabName));
	};
}

/** Parses SKIP_TABS: unset or blank gives []; anything else must be a JSON array of strings. */
export function parseSkipTabs(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === "") {
		return [];
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new SheetConfigError("SKIP_TABS is not valid JSON");
	}
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
		throw new SheetConfigError("SKIP_TABS must be a JSON array of strings");
	}
	return value as string[];
}

/** Unique files (first id wins) with the .xlsx suffix removed and entities decoded. */
function parseFolderFiles(html: string): SheetFile[] {
	const seen = new Set<string>();
	const files: SheetFile[] = [];
	for (const m of html.matchAll(FOLDER_ENTRY_RE)) {
		const fileId = m[1];
		if (seen.has(fileId)) continue;
		seen.add(fileId);
		const fileName = decodeHtml(m[2]).replace(XLSX_SUFFIX_RE, "").trim();
		files.push({ fileId, fileName });
	}
	return files;
}

function parseTabs(html: string): Array<{ tabName: string; gid: string }> {
	const tabs: Array<{ tabName: string; gid: string }> = [];
	for (const m of html.matchAll(TAB_ITEM_RE)) {
		tabs.push({ tabName: decodeJsString(m[1]), gid: m[2] });
	}
	return tabs;
}

function decodeJsString(raw: string): string {
	return raw.replace(JS_ESCAPE_RE, (_all, esc: string) => {
		if ((esc.length === 5 && esc[0] === "u") || (esc.length === 3 && esc[0] === "x")) {
			return String.fromCharCode(parseInt(esc.slice(1), 16));
		}
		return JS_SIMPLE_ESCAPES.get(esc) ?? esc;
	});
}

function decodeHtml(raw: string): string {
	return raw.replace(HTML_ENTITY_RE, (whole, body: string) => {
		if (body[0] === "#") {
			const hex = body[1] === "x" || body[1] === "X";
			const cp = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
		}
		return NAMED_ENTITIES.get(body) ?? whole;
	});
}
