// Hotel JSON routes (STORY-15 AC1 to AC11). Thin glue: validate the query,
// run the query, read the settings once, serialize. Base prices never leave
// this layer: the serializers in src/domain/hotelView.ts turn them into final
// prices. Rate limiting, security headers and noindex are applied by createApp.

import type { Hono } from "hono";
import { listPublishedHotels } from "../../db/hotelList";
import { getPublishedHotelDetail } from "../../db/hotelDetail";
import { toHotelDetail, toHotelListItem } from "../../domain/hotelView";
import type { WebEnv } from "../app";
import { parseLang, parseListParams } from "./params";
import type { ApiDeps } from "./types";

const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const CACHE_CONTROL = "public, max-age=60";

function invalidParam(message: string) {
	return { error: { code: "invalid_param", message } };
}

function notFound() {
	return { error: { code: "not_found", message: "Hotel not found" } };
}

export function registerHotelRoutes(app: Hono<WebEnv>, deps: ApiDeps): void {
	app.get("/api/hotels", async (c) => {
		const parsed = parseListParams(new URL(c.req.url).searchParams);
		if (!parsed.ok) return c.json(invalidParam(parsed.message), 400);
		const params = parsed.value;

		const { rows, total } = await listPublishedHotels(deps.db, {
			city: params.city,
			q: params.q,
			stars: params.stars,
			facilities: params.facilities,
			sort: params.sort,
			page: params.page,
			limit: params.limit,
		});

		const settings = await deps.getSettings();
		const opts = {
			feePercent: settings.serviceFeePercent,
			showFeeNote: settings.showFeeNote,
		};
		const items = rows.map((row) => toHotelListItem(row, params.lang, opts));

		c.header("Cache-Control", CACHE_CONTROL);
		return c.json({
			items,
			page: params.page,
			limit: params.limit,
			total,
			totalPages: total === 0 ? 0 : Math.ceil(total / params.limit),
		});
	});

	app.get("/api/hotels/:slug", async (c) => {
		const lang = parseLang(new URL(c.req.url).searchParams);
		if (!lang.ok) return c.json(invalidParam(lang.message), 400);

		const slug = c.req.param("slug");
		if (!SLUG_RE.test(slug)) return c.json(notFound(), 404);

		const detail = await getPublishedHotelDetail(deps.db, slug);
		if (detail === null) return c.json(notFound(), 404);

		const settings = await deps.getSettings();
		const view = toHotelDetail(detail, lang.value, {
			feePercent: settings.serviceFeePercent,
			showFeeNote: settings.showFeeNote,
			disclaimerVi: settings.disclaimerVi,
			disclaimerEn: settings.disclaimerEn,
		});

		c.header("Cache-Control", CACHE_CONTROL);
		return c.json(view, 200);
	});
}
