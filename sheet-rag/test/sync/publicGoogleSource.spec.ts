import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SheetConfigError, SheetReadError } from "../../src/sync/sheetSource";
import { createPublicGoogleSource, parseSkipTabs } from "../../src/sync/publicGoogleSource";

const FIXTURES = join(__dirname, "..", "fixtures", "google");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

type Call = string;

/** Fake fetch: answers by URL prefix, records every URL it was asked for. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
	const calls: Call[] = [];
	const fetchFn = async (input: string | URL | Request): Promise<Response> => {
		const url = String(input);
		calls.push(url);
		for (const prefix of Object.keys(routes)) {
			if (url.startsWith(prefix)) return routes[prefix]();
		}
		throw new TypeError("no route for " + url);
	};
	return { fetchFn, calls };
}

const FOLDER_URL = "https://drive.google.com/embeddedfolderview?id=FOLDER123";

describe("createPublicGoogleSource rejects a blank folder id", () => {
	it("throws SheetConfigError for undefined, empty and blank folder ids", () => {
		expect(() => createPublicGoogleSource({ folderId: undefined as unknown as string })).toThrow(SheetConfigError);
		expect(() => createPublicGoogleSource({ folderId: "" })).toThrow(SheetConfigError);
		expect(() => createPublicGoogleSource({ folderId: "   " })).toThrow(SheetConfigError);
	});

	it("accepts a real-looking folder id", () => {
		expect(() => createPublicGoogleSource({ folderId: "FOLDER123", fetchFn: fakeFetch({}).fetchFn })).not.toThrow();
	});
});

describe("parseSkipTabs reads valid json, returns empty for unset, rejects bad json", () => {
	it("returns [] for unset, undefined-like and blank values", () => {
		expect(parseSkipTabs(undefined)).toEqual([]);
		expect(parseSkipTabs("")).toEqual([]);
		expect(parseSkipTabs("   ")).toEqual([]);
	});

	it("parses a JSON array of strings", () => {
		expect(parseSkipTabs('["Hanoi/Mong Hotel", "Nha Trang/Lotus"]')).toEqual([
			"Hanoi/Mong Hotel",
			"Nha Trang/Lotus",
		]);
		expect(parseSkipTabs("[]")).toEqual([]);
	});

	it("rejects invalid json, non-arrays and arrays with non-strings", () => {
		expect(() => parseSkipTabs("[not json")).toThrow(SheetConfigError);
		expect(() => parseSkipTabs('{"a":1}')).toThrow(SheetConfigError);
		expect(() => parseSkipTabs('"Hanoi/Mong Hotel"')).toThrow(SheetConfigError);
		expect(() => parseSkipTabs('["ok", 5]')).toThrow(SheetConfigError);
	});
});

describe("listFiles parses ids and names, strips .xlsx, decodes entities, calls the embeddedfolderview url", () => {
	it("returns the three files from folder.html", async () => {
		const { fetchFn, calls } = fakeFetch({ [FOLDER_URL]: () => new Response(fixture("folder.html"), { status: 200 }) });
		const source = createPublicGoogleSource({ folderId: "FOLDER123", fetchFn });
		const files = await source.listFiles();
		expect(calls).toEqual([FOLDER_URL]);
		expect(files).toEqual([
			{ fileId: "1HanoiSheetFileId0000000001", fileName: "Hanoi" },
			{ fileId: "1DaNangHoiAnSheetFileId0002", fileName: "Da Nang & Hoi An" },
			{ fileId: "1NhaTrangSheetFileId00003", fileName: "Nha Trang" },
		]);
	});

	it("drops duplicate ids, keeping the first", async () => {
		const html = `
<a href="https://docs.google.com/spreadsheets/d/DUPID0000000000001/edit"></a>
<div class="flip-entry-title">Hanoi.xlsx</div>
<a href="https://docs.google.com/spreadsheets/d/DUPID0000000000001/edit"></a>
<div class="flip-entry-title">Hanoi copy.xlsx</div>`;
		const { fetchFn } = fakeFetch({ [FOLDER_URL]: () => new Response(html, { status: 200 }) });
		const files = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn }).listFiles();
		expect(files).toEqual([{ fileId: "DUPID0000000000001", fileName: "Hanoi" }]);
	});
});

describe("listFiles throws folder_parse_empty on the empty page and on a fetch failure", () => {
	it("throws folder_parse_empty for the empty folder page", async () => {
		const { fetchFn } = fakeFetch({ [FOLDER_URL]: () => new Response(fixture("folder-empty.html"), { status: 200 }) });
		const err = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn })
			.listFiles()
			.catch((e) => e);
		expect(err).toBeInstanceOf(SheetReadError);
		expect(err.reason).toBe("folder_parse_empty");
	});

	it("throws SheetReadError on a 500 and on a network error, never returns []", async () => {
		const bad = fakeFetch({ [FOLDER_URL]: () => new Response("boom", { status: 500 }) });
		await expect(createPublicGoogleSource({ folderId: "FOLDER123", fetchFn: bad.fetchFn }).listFiles()).rejects.toBeInstanceOf(SheetReadError);

		const down = fakeFetch({});
		await expect(createPublicGoogleSource({ folderId: "FOLDER123", fetchFn: down.fetchFn }).listFiles()).rejects.toBeInstanceOf(SheetReadError);
	});
});

describe("listTabs parses names and gids including escapes and honours skipTabs", () => {
	const HTMLVIEW = "https://docs.google.com/spreadsheets/d/FILE1/htmlview";
	const file = { fileId: "FILE1", fileName: "Hanoi" };

	it("parses the three tabs with escaped quote and \\uXXXX decoded", async () => {
		const { fetchFn, calls } = fakeFetch({ [HTMLVIEW]: () => new Response(fixture("htmlview.html"), { status: 200 }) });
		const tabs = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn }).listTabs(file);
		expect(calls).toEqual([HTMLVIEW]);
		expect(tabs).toEqual([
			{ fileId: "FILE1", fileName: "Hanoi", gid: "0", tabName: "Mong Hotel" },
			{ fileId: "FILE1", fileName: "Hanoi", gid: "1234567", tabName: 'Hotel "Sunrise" Villa' },
			{ fileId: "FILE1", fileName: "Hanoi", gid: "98765", tabName: "Café Lotus" },
		]);
	});

	it("leaves out tabs in skipTabs, matched as File/Tab after the xlsx strip", async () => {
		const { fetchFn } = fakeFetch({ [HTMLVIEW]: () => new Response(fixture("htmlview.html"), { status: 200 }) });
		const source = createPublicGoogleSource({
			folderId: "FOLDER123",
			fetchFn,
			skipTabs: ["Hanoi/Mong Hotel", "Other/Café Lotus", "hanoi/Hotel \"Sunrise\" Villa"],
		});
		const tabs = await source.listTabs(file);
		expect(tabs.map((t) => t.tabName)).toEqual(['Hotel "Sunrise" Villa', "Café Lotus"]);
	});

	it("allows skipping every tab by configuration and returns []", async () => {
		const { fetchFn } = fakeFetch({ [HTMLVIEW]: () => new Response(fixture("htmlview.html"), { status: 200 }) });
		const source = createPublicGoogleSource({
			folderId: "FOLDER123",
			fetchFn,
			skipTabs: ["Hanoi/Mong Hotel", 'Hanoi/Hotel "Sunrise" Villa', "Hanoi/Café Lotus"],
		});
		expect(await source.listTabs(file)).toEqual([]);
	});
});

describe("listTabs throws tab_list_parse_empty on the empty page", () => {
	it("throws tab_list_parse_empty when the page has no tabs", async () => {
		const { fetchFn } = fakeFetch({
			"https://docs.google.com/spreadsheets/d/FILE1/htmlview": () => new Response(fixture("htmlview-empty.html"), { status: 200 }),
		});
		const err = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn })
			.listTabs({ fileId: "FILE1", fileName: "Hanoi" })
			.catch((e) => e);
		expect(err).toBeInstanceOf(SheetReadError);
		expect(err.reason).toBe("tab_list_parse_empty");
	});
});

describe("readCsv returns text and throws SheetReadError on 500, network error, html page and empty body", () => {
	const tab = { fileId: "FILE1", fileName: "Hanoi", gid: "0", tabName: "Mong Hotel" };
	const CSV = "https://docs.google.com/spreadsheets/d/FILE1/export?format=csv&gid=0";

	it("returns the csv text and requests the export url", async () => {
		const { fetchFn, calls } = fakeFetch({ [CSV]: () => new Response(fixture("sheet.csv"), { status: 200 }) });
		const text = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn }).readCsv(tab);
		expect(calls).toEqual([CSV]);
		expect(text).toBe(fixture("sheet.csv"));
	});

	it("throws SheetReadError on 500, network error, html page and empty body", async () => {
		const cases: Array<() => Response | Promise<Response>> = [
			() => new Response("boom", { status: 500 }),
			() => { throw new TypeError("socket hang up"); },
			() => new Response(fixture("not-shared.html"), { status: 200 }),
			() => new Response("<html><body>x</body></html>", { status: 200 }),
			() => new Response("", { status: 200 }),
			() => new Response("   \n", { status: 200 }),
		];
		for (const body of cases) {
			const fetchFn = async (input: string | URL | Request) => {
				void input;
				return body();
			};
			const err = await createPublicGoogleSource({ folderId: "FOLDER123", fetchFn: fetchFn as typeof fetch })
				.readCsv(tab)
				.catch((e) => e);
			expect(err).toBeInstanceOf(SheetReadError);
			expect(String(err.message)).not.toContain("https://");
			expect(String(err.message)).not.toContain("export?format");
		}
	});
});
