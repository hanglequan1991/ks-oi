/**
 * Source of the hotel-dictionary sync (STORY-14, TASK-46).
 *
 * A sheet file is a city (Drive file name minus `.xlsx`); each tab is a hotel.
 * `fileId` + `gid` are the stable identity, so renaming a tab or a file does
 * not create a duplicate by itself.
 *
 * This module has no runtime imports on purpose: it must not depend on Cloudflare
 * bindings, so the sync logic stays testable with fakes. The only import is a
 * type-only one (the network cause set), erased at build time.
 */
import type { NetworkCause } from "./fetchErrors";

export type SheetFile = { fileId: string; fileName: string };

export type SheetTab = {
	fileId: string;
	fileName: string;
	gid: string;
	tabName: string;
};

export interface SheetSource {
	listFiles(): Promise<SheetFile[]>;
	listTabs(file: SheetFile): Promise<SheetTab[]>;
	readCsv(tab: SheetTab): Promise<string>;
}

/**
 * A read from the sheet source failed or returned something that is not a
 * usable page. `reason` is a short code (for example `folder_parse_empty`).
 * Callers must treat it as "unknown", never as "removed".
 */
export class SheetReadError extends Error {
	readonly reason: string;
	/** Set only for a thrown fetch (never for HTTP status failures). Read by the circuit breaker. */
	readonly networkCause?: NetworkCause;

	constructor(reason: string, networkCause?: NetworkCause) {
		super(reason);
		this.name = "SheetReadError";
		this.reason = reason;
		this.networkCause = networkCause;
	}
}

/** Configuration (folder id, SKIP_TABS) is missing or malformed. */
export class SheetConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SheetConfigError";
	}
}

/** Every tab of every file, in listing order. Any throw propagates. */
export async function listAllTabs(source: SheetSource): Promise<SheetTab[]> {
	const all: SheetTab[] = [];
	for (const file of await source.listFiles()) {
		for (const tab of await source.listTabs(file)) {
			all.push(tab);
		}
	}
	return all;
}
