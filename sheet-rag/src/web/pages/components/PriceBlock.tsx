import type { SiteSettings } from "../../../db/settings";
import { t, type Lang } from "../../i18n/t";
import { FeeNote } from "./FeeNote";

type Props = {
	lang: Lang;
	settings: SiteSettings;
	amount: number | null;
	edited?: boolean;
};

const LOCALES: Record<Lang, string> = { vi: "vi-VN", en: "en-US" };

// Formats a VND amount for the page language, e.g. "1.375.000 ₫" (vi) or "1,375,000 VND" (en).
export function formatPrice(amount: number, lang: Lang): string {
	const digits = new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 0 }).format(amount);
	return `${digits} ${t(lang, "price.currencyUnit")}`;
}

// Prints a price with its fee note. The disclaimer is not printed here; the page prints it once.
export function PriceBlock({ lang, settings, amount }: Props) {
	if (amount === null) return null;
	return (
		<span class="price" data-price>
			{formatPrice(amount, lang)} <FeeNote lang={lang} settings={settings} />
		</span>
	);
}
