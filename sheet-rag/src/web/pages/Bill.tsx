import type { SiteSettings } from "../../db/settings";
import { MAX_NIGHTS, MAX_NOTE, MAX_ROWS } from "../../domain/money";
import { en } from "../i18n/en";
import { pathForLang, t, type Lang } from "../i18n/t";
import { vi } from "../i18n/vi";
import { Disclaimer } from "./components/Disclaimer";
import { FeeNote } from "./components/FeeNote";
import { Layout } from "./Layout";

type Props = {
	lang: Lang;
	path: string;
	origin: string;
	settings: SiteSettings;
};

// Serialises a value for an inline <script type="application/json">. The
// characters that could close the tag or start markup, plus the two line
// separators that some JSON parsers treat as line breaks, are written as
// \u escapes. The result is still valid JSON.
function scriptJson(value: unknown): string {
	const escaped = new Set(["<", ">", "&", " ", " "]);
	let out = "";
	for (const c of JSON.stringify(value)) {
		out += escaped.has(c) ? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0") : c;
	}
	return out;
}

// Billing page shell (technical design 18.1, 18.5, 18.9). The server renders the
// static parts and the header row; the client bundle fills the grid. The page
// has no price, so Layout does not print the disclaimer: this page prints it
// itself, inside main, so the printed bill still carries it. The page supplies
// its own language toggle (hideLangNav), so the bill has one language link.
export function BillPage({ lang, path, origin, settings }: Props) {
	const group = lang === "vi" ? vi.bill : en.bill;
	const config = {
		lang,
		labels: { ...group },
		maxRows: MAX_ROWS,
		maxNights: MAX_NIGHTS,
		maxNote: MAX_NOTE,
	};
	const switchAria = t(lang, lang === "vi" ? "common.switchToEn" : "common.switchToVi");
	// VI always comes first, then EN: the current language is a span, the other a link.
	const viToggle =
		lang === "vi" ? (
			<span class="lang-current" aria-current="true">VI</span>
		) : (
			<a class="lang-link" href={pathForLang(path, "vi")} data-lang="vi" hreflang="vi" aria-label={switchAria}>
				VI
			</a>
		);
	const enToggle =
		lang === "en" ? (
			<span class="lang-current" aria-current="true">EN</span>
		) : (
			<a class="lang-link" href={pathForLang(path, "en")} data-lang="en" hreflang="en" aria-label={switchAria}>
				EN
			</a>
		);

	return (
		<Layout
			lang={lang}
			path={path}
			origin={origin}
			title={t(lang, "bill.title")}
			settings={settings}
			showsPrice={false}
			hideLangNav
		>
			<link rel="stylesheet" href="/bill.css" />
			<div class="bill-page">
				<div class="bill-header">
					<div class="bill-titlebox">
						<h1>{t(lang, "bill.title")}</h1>
						<p class="bill-intro">{t(lang, "bill.intro")}</p>
					</div>
					<div class="bill-tools no-print">
						<p class="bill-status no-print" data-bill-status role="status"></p>
						<div class="lang-toggle">
							{viToggle}
							{enToggle}
						</div>
					</div>
				</div>
				<div class="bill-print-head">
					<span class="bill-print-title">{t(lang, "bill.title")}</span>{" "}
					<span data-bill-date></span>
				</div>
				<noscript>
					<p class="bill-noscript">{t(lang, "bill.noscript")}</p>
				</noscript>
				<div class="bill-card">
					<div id="bill-app" class="bill-grid">
						<div class="bill-head" role="row">
							<span>{t(lang, "bill.colIndex")}</span>
							<span>{t(lang, "bill.colHotel")}</span>
							<span>{t(lang, "bill.colRoom")}</span>
							<span>{t(lang, "bill.colNight")}</span>
							<span>{t(lang, "bill.colPricing")}</span>
							<span>{t(lang, "bill.colTotal")}</span>
						</div>
					</div>
					<div class="bill-foot">
						<div class="bill-actions no-print">
							<button type="button" class="btn btn-outline no-print" data-action="add">
								{t(lang, "bill.addRow")}
							</button>
							<button type="button" class="btn no-print" data-action="clear">
								{t(lang, "bill.clearAll")}
							</button>
						</div>
						<div class="bill-summary">
							<span class="summary-label">{t(lang, "bill.grandTotal")}</span>{" "}
							<span class="summary-total" data-bill-summary></span>
						</div>
					</div>
				</div>
				<div class="bill-bottom">
					<div class="bill-notes">
						<FeeNote lang={lang} settings={settings} />
						<Disclaimer lang={lang} settings={settings} />
						<p class="bill-privacy">{t(lang, "bill.privacyNote")}</p>
					</div>
					<div class="bill-tools-actions no-print">
						<button type="button" class="btn btn-primary no-print" data-action="print">
							{t(lang, "bill.print")}
						</button>
						<button type="button" class="btn no-print" data-action="clear-draft">
							{t(lang, "bill.clearDraft")}
						</button>
					</div>
				</div>
				<script
					type="application/json"
					id="bill-config"
					dangerouslySetInnerHTML={{ __html: scriptJson(config) }}
				/>
				<script src="/bill.js" defer></script>
			</div>
		</Layout>
	);
}
