import type { SiteSettings } from "../../db/settings";
import { pathForLang, t, type Lang } from "../i18n/t";
import { Disclaimer } from "./components/Disclaimer";

type Props = {
	lang: Lang;
	path: string;
	origin: string;
	title: string;
	settings: SiteSettings;
	showsPrice: boolean;
	children?: unknown;
};

// Shared page shell for every Version 1 page. Declares the language, the
// language alternates and noindex, loads /lang.js synchronously (no defer, no
// inline script) and prints the disclaimer once when the page shows a price.
// The language toggle is a plain link so it works without JavaScript.
export function Layout({ lang, path, origin, title, settings, showsPrice, children }: Props) {
	const other: Lang = lang === "vi" ? "en" : "vi";
	const toggleText = other === "en" ? t(lang, "common.switchToEn") : t(lang, "common.switchToVi");
	const canonical = origin + pathForLang(path, lang);

	return (
		<html lang={lang}>
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="robots" content="noindex, nofollow" />
				<title>{title}</title>
				<link rel="canonical" href={canonical} />
				<link rel="alternate" hreflang="vi" href={origin + pathForLang(path, "vi")} />
				<link rel="alternate" hreflang="en" href={origin + pathForLang(path, "en")} />
				<link rel="alternate" hreflang="x-default" href={origin + pathForLang(path, "vi")} />
				<link rel="stylesheet" href="/app.css" />
				<script src="/lang.js"></script>
			</head>
			<body>
				<header>
					<nav>
						<a href={pathForLang(path, other)} data-lang={other} hreflang={other}>
							{toggleText}
						</a>
					</nav>
				</header>
				<main id="main">{children}</main>
				<footer>{showsPrice && <Disclaimer lang={lang} settings={settings} />}</footer>
			</body>
		</html>
	);
}
