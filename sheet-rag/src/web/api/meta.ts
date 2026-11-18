// Metadata routes of the JSON API (STORY-15 AC11 to AC14): city list, hotel name
// suggestions and public site settings. Registered through the app's `mount` hook.
// Errors from the database or settings are left to the app's onError (500).
// Only fields listed in technical-design.html section 3.3 are returned; no price,
// no ids, and no contact data (phone and Zalo are not shown in Version 1).

import type { Context, Hono } from "hono";
import { listCitiesWithPublishedHotels } from "../../db/cities";
import { suggestHotels } from "../../db/suggest";
import { toCityItem } from "../../domain/hotelView";
import type { WebEnv } from "../app";
import { parseLang, parseSuggestParams } from "./params";
import type { ApiDeps } from "./types";

function badRequest(c: Context<WebEnv>, code: string, message: string) {
	return c.json({ error: { code, message } }, 400);
}

export function registerMetaRoutes(app: Hono<WebEnv>, deps: ApiDeps): void {
	app.get("/api/cities", async (c) => {
		const lang = parseLang(new URL(c.req.url).searchParams);
		if (!lang.ok) return badRequest(c, "invalid_param", lang.message);

		const rows = await listCitiesWithPublishedHotels(deps.db);
		return c.json({ items: rows.map((row) => toCityItem(row, lang.value)) });
	});

	app.get("/api/suggest", async (c) => {
		const parsed = parseSuggestParams(new URL(c.req.url).searchParams);
		if (!parsed.ok) return badRequest(c, parsed.code, parsed.message);
		const { q, limit, lang } = parsed.value;

		const rows = await suggestHotels(deps.db, q, limit);
		const items = rows.map((row) => ({
			slug: row.slug,
			name: row.name,
			city: toCityItem(
				{ slug: row.city_slug, name_vi: row.city_name_vi, name_en: row.city_name_en },
				lang,
			).name,
		}));

		c.header("Cache-Control", "public, max-age=30");
		return c.json({ items });
	});

	app.get("/api/config", async (c) => {
		const settings = await deps.getSettings();

		c.header("Cache-Control", "public, max-age=60");
		return c.json({
			disclaimer: { vi: settings.disclaimerVi, en: settings.disclaimerEn },
			showFeeNote: settings.showFeeNote,
			serviceFeePercent: settings.serviceFeePercent,
			languages: ["vi", "en"],
		});
	});
}
