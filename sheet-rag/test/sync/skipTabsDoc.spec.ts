import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const DOC = readFileSync(join(ROOT, "DEPLOY-hotel-dictionary.md"), "utf8").normalize("NFC");

const RECOMMENDED = [
	"DS KS TOÀN QUỐC",
	"QUY TRÌNH BOOK KS",
	"Trang tính1",
	"Trang tính4",
	"Weekday Pricelist",
	"Weekend Pricelist",
	"Landtour Đà Nẵng",
	"Khách Sạn Và Vé",
	"Đầu Mối Khách Sạn",
	"DU THUYỀN ELITE OF SAIGON",
].map((n) => n.normalize("NFC"));

/** All files under a folder, skipping node_modules and hidden folders. */
function walk(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else out.push(path);
	}
	return out;
}

describe("deploy doc lists the ten recommended tab names and src has none of them", () => {
	it("documents the new SKIP_TABS forms", () => {
		expect(DOC).toMatch(/Tab name/);
		expect(DOC).toMatch(/case-insensitive/i);
		expect(DOC).toMatch(/NFC/);
	});

	it("has a clearly marked recommended default that is a JSON array of the ten names", () => {
		const marker = DOC.indexOf("Recommended default, owner to confirm");
		expect(marker).toBeGreaterThanOrEqual(0);
		const after = DOC.slice(marker);
		const block = after.match(/```json\s*([\s\S]*?)```/);
		expect(block).not.toBeNull();
		const parsed: unknown = JSON.parse(block![1]);
		expect(parsed).toEqual(RECOMMENDED);
	});

	it("says a newly skipped tab is treated as removed by the next run", () => {
		expect(DOC).toMatch(/removed/i);
		expect(DOC).toMatch(/hidden|hide/i);
	});

	it("src/ contains none of the recommended tab names", () => {
		const files = walk(join(ROOT, "src"));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const text = readFileSync(file, "utf8").normalize("NFC");
			for (const name of RECOMMENDED) {
				expect(text.includes(name), `${file} contains ${name}`).toBe(false);
			}
		}
	});
});
