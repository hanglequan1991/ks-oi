import { SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "../../src/sync/sheetSource";

/** Key of the csv map: `fileId:gid`. */
export function csvKey(fileId: string, gid: string): string {
	return `${fileId}:${gid}`;
}

export interface FakeSheetSource extends SheetSource {
	/** Mutable: tests may splice, push or reassign. */
	files: SheetFile[];
	/** Mutable flat list of all tabs; listTabs filters by fileId. */
	tabs: SheetTab[];
	/** Mutable csv text keyed by `fileId:gid`. */
	csv: Record<string, string>;
	/** When true, listFiles throws SheetReadError. */
	failList: boolean;
	/** Keys (`fileId:gid`) for which readCsv throws SheetReadError. */
	failRead: string[];
}

export type FakeSheetSourceOptions = {
	files: SheetFile[];
	tabs: SheetTab[];
	csv?: Record<string, string>;
	failList?: boolean;
	failRead?: string[];
};

export function createFakeSheetSource(opts: FakeSheetSourceOptions): FakeSheetSource {
	const source: FakeSheetSource = {
		files: opts.files,
		tabs: opts.tabs,
		csv: opts.csv ?? {},
		failList: opts.failList ?? false,
		failRead: opts.failRead ?? [],

		async listFiles(): Promise<SheetFile[]> {
			if (source.failList) {
				throw new SheetReadError("fake_list_failed");
			}
			return source.files.map((f) => ({ ...f }));
		},

		async listTabs(file: SheetFile): Promise<SheetTab[]> {
			return source.tabs.filter((t) => t.fileId === file.fileId).map((t) => ({ ...t }));
		},

		async readCsv(tab: SheetTab): Promise<string> {
			const key = csvKey(tab.fileId, tab.gid);
			if (source.failRead.includes(key)) {
				throw new SheetReadError("fake_read_failed");
			}
			if (!Object.prototype.hasOwnProperty.call(source.csv, key)) {
				throw new SheetReadError("fake_csv_missing");
			}
			return source.csv[key];
		},
	};
	return source;
}
