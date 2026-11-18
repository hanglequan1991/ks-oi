// Shared types and limits for the JSON API (src/web/api/). Types only, plus
// the numeric limits from technical-design.html section 3.3. No Hono, no D1 calls.

import type { SiteSettings } from "../../db/settings";

export interface ApiDeps {
	db: D1Database;
	getSettings(): Promise<SiteSettings>;
}

export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; code: string; message: string };

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
export const SUGGEST_MAX_CHARS = 60;
export const SUGGEST_MAX_LIMIT = 10;
export const SUGGEST_DEFAULT_LIMIT = 8;
