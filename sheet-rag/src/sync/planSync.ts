// Decides which sheet tabs need applying on this run (STORY-14 AC10, AC11, AC13, TASK-49).
// Pure: no I/O. Imports only types.

import type { SyncStateRow } from "../db/syncState";
import type { SheetTab } from "./sheetSource";

export interface PlanSyncInput {
	/** Tabs listed on this run. */
	tabs: SheetTab[];
	/** Stored sync state, keyed by `fileId:gid`. */
	state: Map<string, SyncStateRow>;
	/** Content hash of each listed tab this run, keyed by `fileId:gid`. */
	hashes: Map<string, string>;
	/** Mark every tab changed. */
	force?: boolean;
}

export interface SyncPlan {
	changed: SheetTab[];
	unchanged: SheetTab[];
	removed: SyncStateRow[];
	restored: SheetTab[];
}

export function planSync({ tabs, state, hashes, force = false }: PlanSyncInput): SyncPlan {
	const plan: SyncPlan = { changed: [], unchanged: [], removed: [], restored: [] };
	const listed = new Set<string>();

	for (const tab of tabs) {
		const key = `${tab.fileId}:${tab.gid}`;
		listed.add(key);
		const row = state.get(key);

		if (row?.missing_since) {
			plan.restored.push(tab);
			plan.changed.push(tab);
		} else if (!row || force || row.last_error || row.hash !== hashes.get(key)) {
			plan.changed.push(tab);
		} else {
			plan.unchanged.push(tab);
		}
	}

	// An empty listing is treated as unknown, not as "every tab was removed" (AC3).
	if (tabs.length === 0) return plan;

	for (const [key, row] of state) {
		if (!row.missing_since && !listed.has(key)) plan.removed.push(row);
	}

	return plan;
}
