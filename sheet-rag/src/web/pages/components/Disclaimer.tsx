import type { SiteSettings } from "../../../db/settings";
import type { Lang } from "../../i18n/t";

type Props = { lang: Lang; settings: SiteSettings };

// Shows the call-to-confirm notice in the page language. Falls back to the other
// language when the chosen text is empty; throws when both are empty so a broken
// seed is noticed instead of silently dropping the notice.
export function Disclaimer({ lang, settings }: Props) {
	const chosen = lang === "vi" ? settings.disclaimerVi : settings.disclaimerEn;
	const other = lang === "vi" ? settings.disclaimerEn : settings.disclaimerVi;
	const text = chosen.trim() !== "" ? chosen : other;
	if (text.trim() === "") throw new Error("disclaimer text missing");
	return (
		<p class="disclaimer" data-disclaimer role="note">
			{text}
		</p>
	);
}
