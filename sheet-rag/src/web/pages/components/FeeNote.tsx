import type { SiteSettings } from "../../../db/settings";
import { format, t, type Lang } from "../../i18n/t";

type Props = { lang: Lang; settings: SiteSettings };

// Renders the service-fee note only when the site setting is switched on.
export function FeeNote({ lang, settings }: Props) {
	if (!settings.showFeeNote) return null;
	const text = format(t(lang, "price.feeNote"), { percent: settings.serviceFeePercent });
	return <small class="fee-note" data-fee-note>{text}</small>;
}
