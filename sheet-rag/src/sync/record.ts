// Contract between the sheet parser and the writer. Pure types, no runtime code.
// Hotel name, city and ids are not part of the record: they come from SheetTab.

export type ParsedRoom = {
	/** Room name as written in the sheet (verbatim). */
	name: string;
	/** Base price in VND; null when the sheet leaves it empty. */
	basePrice: number | null;
	bedType?: string;
	sizeM2?: number;
	view?: string;
	maxGuests?: number;
	description?: string | null;
	/** Rule strings, verbatim text. */
	rules: string[];
};

export type ParsedHotel = {
	stars: number | null;
	address: string | null;
	area: string | null;
	descriptionVi: string | null;
	descriptionEn: string | null;
	/** Image URLs, verbatim text. */
	images: string[];
	facilities: string[];
	rooms: ParsedRoom[];
	/** Hotel-level rule strings, verbatim text. */
	hotelRules: string[];
};
