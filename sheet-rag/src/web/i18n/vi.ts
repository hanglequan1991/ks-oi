// Vietnamese dictionary (default language). en.ts must carry the same keys.
export const vi = {
	common: {
		siteName: "Sheet RAG",
		langVi: "Tiếng Việt",
		langEn: "English",
		switchToVi: "Chuyển sang tiếng Việt",
		switchToEn: "Switch to English",
		skipToContent: "Bỏ qua và đi tới nội dung chính",
	},
	price: {
		feeNote: "Đã bao gồm {percent}% phí dịch vụ",
		currencyUnit: "₫",
		perNight: "mỗi đêm",
	},
	errors: {
		tooManyRequests: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
		inputTooLong: "Nội dung quá dài. Vui lòng rút gọn và thử lại.",
		notFound: "Không tìm thấy trang này.",
		generic: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
	},
} as const;
