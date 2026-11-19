import { describe, expect, it } from "vitest";
import { parseCsv } from "../../src/sync/csv";

describe("parseCsv", () => {
	it("parseCsv handles quotes, embedded newlines, CRLF, BOM", () => {
		const text = '﻿a,"b ""q"" c","line1\nline2",d\r\n"x\r\ny",z\r\n';
		expect(parseCsv(text)).toEqual([
			["a", 'b "q" c', "line1\nline2", "d"],
			["x\r\ny", "z"],
		]);
	});

	it("parseCsv handles bare CR and LF row endings", () => {
		expect(parseCsv("a,b\rc,d\ne,f")).toEqual([
			["a", "b"],
			["c", "d"],
			["e", "f"],
		]);
	});

	it("parseCsv keeps leading and trailing spaces and Vietnamese text", () => {
		const text = "  Phòng Đôi  , giá: 1.200.000đ ,\"  Ghi chú  \"\n";
		expect(parseCsv(text)).toEqual([
			["  Phòng Đôi  ", " giá: 1.200.000đ ", "  Ghi chú  "],
		]);
	});

	it("parseCsv unterminated quote does not throw; empty text gives empty array", () => {
		expect(() => parseCsv('a,"never closed\nb,c')).not.toThrow();
		expect(parseCsv('a,"never closed\nb,c')).toEqual([["a", 'never closed\nb,c']]);
		expect(parseCsv("")).toEqual([]);
	});

	it("parseCsv does not add an empty row for a trailing newline", () => {
		expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
		expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
	});
});
