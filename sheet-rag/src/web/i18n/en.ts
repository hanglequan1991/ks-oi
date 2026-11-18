import type { Dict } from "./t";

// English dictionary. Same keys as vi.ts; TypeScript fails here if one is missing.
export const en: Dict = {
	common: {
		siteName: "Sheet RAG",
		langVi: "Vietnamese",
		langEn: "English",
		switchToVi: "Chuyển sang tiếng Việt",
		switchToEn: "Switch to English",
		skipToContent: "Skip to main content",
	},
	price: {
		feeNote: "Includes {percent}% service fee",
		currencyUnit: "VND",
		perNight: "per night",
	},
	errors: {
		tooManyRequests: "You have sent too many requests. Please try again in a few minutes.",
		inputTooLong: "The input is too long. Please shorten it and try again.",
		notFound: "This page could not be found.",
		generic: "Something went wrong. Please try again later.",
	},
};
