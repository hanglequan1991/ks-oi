import type { Context } from "hono";
import type { JSXNode } from "hono/jsx";

// Matches a data-price / data-disclaimer attribute as a whole token in the markup.
const PRICE_ATTR = /\sdata-price(?=[\s>/=])/;
const DISCLAIMER_ATTR = /\sdata-disclaimer(?=[\s>/=])/;

// Renders a full page and responds with it. Guard: a page that prints a price
// must also print the disclaimer. Throws before any response is sent, so the
// request fails instead of showing a price without the notice.
export function renderPage(c: Context, element: JSXNode) {
	const html = "<!DOCTYPE html>" + String(element);
	if (PRICE_ATTR.test(html) && !DISCLAIMER_ATTR.test(html)) {
		throw new Error("page shows a price without a disclaimer");
	}
	return c.html(html);
}
