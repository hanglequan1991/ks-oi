// Hash helpers built on Web Crypto. Pure code, no imports.

/** SHA-256 of the UTF-8 text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable 16-hex-char hotel id derived from the sheet file id and tab gid. */
export async function hotelIdFor(fileId: string, gid: string): Promise<string> {
	return (await sha256Hex(`${fileId}:${gid}`)).slice(0, 16);
}

/** Content hash of a CSV tab. Bumping `version` (the parser version) changes it. */
export function contentHash(csv: string, version: string): Promise<string> {
	return sha256Hex(`${version}\n${csv}`);
}
