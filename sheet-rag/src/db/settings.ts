// Read-only access to the settings table (technical-design.html section 9,
// STORY-13 AC10). Imports only src/domain/. The database is passed in, so
// tests can use the fake D1 from test/fakes/.

import { parseBoolSetting, parseFeePercent } from "../domain/pricing";

export type SiteSettings = {
	serviceFeePercent: number; // 0..100
	showFeeNote: boolean;
	disclaimerVi: string;
	disclaimerEn: string;
};

interface SettingRow {
	key: string;
	value: string;
}

/**
 * Reads all settings in one query. A missing or invalid fee falls back to 10
 * and reports a warning through `onWarn`. A missing fee note flag is shown
 * (true). Missing disclaimers are empty strings; the seed holds the wording.
 */
export async function getSettings(
	db: D1Database,
	onWarn: (msg: string) => void = (msg) => console.warn(msg),
): Promise<SiteSettings> {
	const { results } = await db
		.prepare("SELECT key, value FROM settings")
		.all<SettingRow>();

	const values = new Map<string, string>();
	for (const row of results) values.set(row.key, row.value);

	const fee = parseFeePercent(values.get("service_fee_percent"));
	if (fee.warning !== undefined) onWarn(fee.warning);

	return {
		serviceFeePercent: fee.percent,
		showFeeNote: parseBoolSetting(values.get("show_fee_note"), true),
		disclaimerVi: values.get("disclaimer_vi") ?? "",
		disclaimerEn: values.get("disclaimer_en") ?? "",
	};
}
