import { vi } from "./vi";
import { en } from "./en";

export type Lang = "vi" | "en";

export const LANGS = ["vi", "en"] as const satisfies readonly Lang[];

export const DEFAULT_LANG: Lang = "vi";

// Replaces every string leaf of T with `string`, keeping the nested shape.
export type DeepStrings<T> = T extends string
	? string
	: { -readonly [K in keyof T]: DeepStrings<T[K]> };

export type Dict = DeepStrings<typeof vi>;

const DICTS: Record<Lang, Dict> = { vi, en };

// Looks up a dot-path key (e.g. "price.feeNote"). Unknown keys return the key itself.
export function t(lang: Lang, key: string): string {
	let node: unknown = DICTS[lang];
	for (const part of key.split(".")) {
		if (node === null || typeof node !== "object") return key;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === "string" ? node : key;
}

// Replaces {name} placeholders with the matching value. Unknown placeholders are kept.
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
	);
}

// "/en" and "/en/..." are English; everything else (including "/english") is Vietnamese.
export function langFromPath(path: string): Lang {
	return path === "/en" || path.startsWith("/en/") ? "en" : "vi";
}

// Removes the /en prefix from a pathname. "/en" and "/en/" become "/".
export function stripLangPrefix(path: string): string {
	if (path === "/en" || path === "/en/") return "/";
	if (path.startsWith("/en/")) return path.slice(3);
	return path;
}

// Returns the pathname for the given language. Vietnamese has no prefix.
export function pathForLang(path: string, lang: Lang): string {
	const base = stripLangPrefix(path);
	if (lang === "vi") return base;
	return base === "/" ? "/en/" : `/en${base}`;
}
