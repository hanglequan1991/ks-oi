import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
	listAllTabs,
	SheetReadError,
	type SheetFile,
	type SheetTab,
	type SheetSource,
} from "../../src/sync/sheetSource";
import { createFakeSheetSource, csvKey } from "./sheetSource";

const ROOT = join(__dirname, "..", "..");

const FILES: SheetFile[] = [
	{ fileId: "F1", fileName: "Hanoi" },
	{ fileId: "F2", fileName: "Nha Trang" },
];
const TABS: SheetTab[] = [
	{ fileId: "F1", fileName: "Hanoi", gid: "0", tabName: "Mong Hotel" },
	{ fileId: "F1", fileName: "Hanoi", gid: "11", tabName: "Sunrise" },
	{ fileId: "F2", fileName: "Nha Trang", gid: "0", tabName: "Lotus" },
];

describe("sheetSource types compile via the fake and listAllTabs walks all files", () => {
	it("listAllTabs returns the tabs of every file in order", async () => {
		const source: SheetSource = createFakeSheetSource({ files: FILES, tabs: TABS });
		const all = await listAllTabs(source);
		expect(all).toEqual(TABS);
	});

	it("listAllTabs propagates a listFiles failure", async () => {
		const source = createFakeSheetSource({ files: FILES, tabs: TABS, failList: true });
		await expect(listAllTabs(source)).rejects.toBeInstanceOf(SheetReadError);
	});

	it("SheetReadError is an Error with a reason", () => {
		const err = new SheetReadError("folder_parse_empty");
		expect(err).toBeInstanceOf(Error);
		expect(err.reason).toBe("folder_parse_empty");
	});
});

describe("fake source lists, edits, removes and fails on demand", () => {
	it("lists files and tabs filtered by file", async () => {
		const source = createFakeSheetSource({ files: FILES, tabs: TABS });
		expect(await source.listFiles()).toEqual(FILES);
		expect(await source.listTabs(FILES[0])).toEqual(TABS.slice(0, 2));
		expect(await source.listTabs(FILES[1])).toEqual(TABS.slice(2));
	});

	it("reads csv by fileId:gid key", async () => {
		const source = createFakeSheetSource({
			files: FILES,
			tabs: TABS,
			csv: { [csvKey("F1", "0")]: "a,b\n1,2\n" },
		});
		expect(await source.readCsv(TABS[0])).toBe("a,b\n1,2\n");
	});

	it("edits, removes and adds files and tabs in place", async () => {
		const source = createFakeSheetSource({
			files: [...FILES],
			tabs: [...TABS],
			csv: { [csvKey("F1", "0")]: "x" },
		});
		source.tabs.splice(1, 1);
		expect(await source.listTabs(FILES[0])).toEqual([TABS[0]]);

		source.files.splice(1, 1);
		expect(await source.listFiles()).toEqual([FILES[0]]);

		source.csv[csvKey("F1", "0")] = "edited";
		expect(await source.readCsv(TABS[0])).toBe("edited");

		source.tabs.push({ fileId: "F1", fileName: "Hanoi", gid: "5", tabName: "New" });
		expect((await source.listTabs(FILES[0])).map((t) => t.tabName)).toEqual([
			"Mong Hotel",
			"New",
		]);
	});

	it("fails listFiles when failList is set, and readCsv for failRead keys", async () => {
		const source = createFakeSheetSource({
			files: FILES,
			tabs: TABS,
			csv: { [csvKey("F1", "0")]: "x", [csvKey("F1", "11")]: "y" },
			failRead: [csvKey("F1", "11")],
		});
		await expect(source.readCsv(TABS[1])).rejects.toBeInstanceOf(SheetReadError);
		expect(await source.readCsv(TABS[0])).toBe("x");

		source.failList = true;
		await expect(source.listFiles()).rejects.toBeInstanceOf(SheetReadError);
		source.failList = false;
		expect(await source.listFiles()).toEqual(FILES);
	});

	it("readCsv throws for a key with no csv", async () => {
		const source = createFakeSheetSource({ files: FILES, tabs: TABS });
		await expect(source.readCsv(TABS[0])).rejects.toBeInstanceOf(SheetReadError);
	});
});

describe("fixtures exist and are the ones used", () => {
	const names = [
		"folder.html",
		"folder-empty.html",
		"htmlview.html",
		"htmlview-empty.html",
		"sheet.csv",
		"not-shared.html",
	];

	it("every required fixture exists under test/fixtures/google", () => {
		for (const name of names) {
			expect(existsSync(join(ROOT, "test", "fixtures", "google", name))).toBe(true);
		}
	});

	it("the public source spec loads exactly these fixtures", () => {
		const spec = readFileSync(join(ROOT, "test", "sync", "publicGoogleSource.spec.ts"), "utf8");
		for (const name of names) {
			expect(spec).toContain(name);
		}
	});
});

describe("no forbidden imports in sheetSource.ts and publicGoogleSource.ts", () => {
	const files = ["src/sync/sheetSource.ts", "src/sync/publicGoogleSource.ts"];

	it("imports only from src/sync or src/domain, never Cloudflare or other modules", () => {
		for (const rel of files) {
			const src = readFileSync(join(ROOT, rel), "utf8");
			const specifiers = [...src.matchAll(/(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']/g)].map(
				(m) => m[1],
			);
			const dynamic = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
			for (const spec of [...specifiers, ...dynamic]) {
				expect(spec.startsWith("./") || spec.startsWith("../../src/domain/") || spec.startsWith("../domain/"), `${rel} imports ${spec}`).toBe(true);
				expect(spec).not.toMatch(/hash/);
				expect(spec).not.toMatch(/cloudflare|wrangler|env/i);
			}
		}
	});
});
