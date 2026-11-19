// Sheet row parser for the hotel-dictionary sync (STORY-14, TASK-56 stub). The real body
// comes with TASK-58 and keeps this signature. Until then every tab fails closed: nothing is
// published and each tab is reported as parser_not_configured.

import type { ParseResult } from "./runSync";
import type { SheetTab } from "./sheetSource";

export function parseSheetRows(_csv: string, _tab: SheetTab): ParseResult {
	return { ok: false, reason: "parser_not_configured" };
}
