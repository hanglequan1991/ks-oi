// Validation of a ParsedHotel before it is written. Pure code: it imports only
// the shared fold helper and the record types.

import { foldText } from "../domain/fold";
import type { ParsedHotel } from "./record";

export type ValidationCode =
	| "price_invalid"
	| "stars_range"
	| "image_not_https"
	| "room_duplicate"
	| "room_name_empty"
	| "description_missing"
	| "facilities_missing";

export type ValidationIssue = {
	code: ValidationCode;
	/** Path of the offending value, e.g. `stars`, `images[0]`, `rooms[2].basePrice`. */
	field: string;
	message: string;
};

export type ValidationResult =
	| { ok: true; warnings: ValidationIssue[] }
	| { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

function isPresent(value: string | null | undefined): boolean {
	return value !== null && value !== undefined && value.trim().length > 0;
}

function isPositiveSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Check a parsed hotel. Every problem is collected (not just the first) in a
 * fixed order: stars, images by index, then rooms by index. Warnings never
 * make the record fail.
 */
export function validateHotel(h: ParsedHotel): ValidationResult {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	if (h.stars !== null && !(Number.isInteger(h.stars) && h.stars >= 1 && h.stars <= 5)) {
		errors.push({
			code: "stars_range",
			field: "stars",
			message: "Stars must be a whole number from 1 to 5, or empty.",
		});
	}

	h.images.forEach((url, i) => {
		if (!isHttpsUrl(url)) {
			errors.push({
				code: "image_not_https",
				field: `images[${i}]`,
				message: "Image URL must be a valid https URL.",
			});
		}
	});

	const seenRoomNames = new Set<string>();
	h.rooms.forEach((room, i) => {
		const key = foldText(room.name);
		if (key === "") {
			errors.push({
				code: "room_name_empty",
				field: `rooms[${i}].name`,
				message: "Room name must not be empty.",
			});
		} else if (seenRoomNames.has(key)) {
			errors.push({
				code: "room_duplicate",
				field: `rooms[${i}].name`,
				message: `Room name "${room.name}" is already used in this hotel.`,
			});
		} else {
			seenRoomNames.add(key);
		}

		if (room.basePrice !== null && room.basePrice !== undefined && !isPositiveSafeInteger(room.basePrice)) {
			errors.push({
				code: "price_invalid",
				field: `rooms[${i}].basePrice`,
				message: "Price must be a positive whole number, or empty.",
			});
		}
	});

	if (!isPresent(h.descriptionVi) && !isPresent(h.descriptionEn)) {
		warnings.push({
			code: "description_missing",
			field: "description",
			message: "No Vietnamese or English description.",
		});
	}

	if (h.facilities.length === 0) {
		warnings.push({
			code: "facilities_missing",
			field: "facilities",
			message: "No facilities listed.",
		});
	}

	if (errors.length === 0) {
		return { ok: true, warnings };
	}
	return { ok: false, errors, warnings };
}
