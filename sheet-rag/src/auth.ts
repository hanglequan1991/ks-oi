// Google Identity Services gives the browser a signed ID token (JWT). We verify it
// against Google's public keys, check the email against an allowlist, then issue
// our own short HMAC-signed session cookie so Google isn't called on every request.

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const SESSION_COOKIE = "ksoi_session";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface AuthConfig {
	GOOGLE_CLIENT_ID: string;
	// An array from wrangler.jsonc, or a comma-separated string from a secret / .dev.vars
	ALLOWED_EMAILS: string[] | string;
	SESSION_SECRET?: string;
}

type JwtHeader = { alg: string; kid: string };
type GoogleClaims = { iss: string; aud: string; exp: number; email?: string; email_verified?: boolean; name?: string };
type Session = { email: string; name: string; exp: number };

const encoder = new TextEncoder();

function base64UrlToBytes(s: string): Uint8Array {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));

let certCache: { keys: Map<string, CryptoKey>; expires: number } | undefined;

async function googleKey(kid: string): Promise<CryptoKey | undefined> {
	if (!certCache || certCache.expires < Date.now() || !certCache.keys.has(kid)) {
		const res = await fetch(GOOGLE_CERTS_URL);
		if (!res.ok) throw new Error(`Google certs fetch failed: ${res.status}`);
		const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
		const map = new Map<string, CryptoKey>();
		for (const jwk of keys) {
			map.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
		}
		const maxAge = Number(res.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
		certCache = { keys: map, expires: Date.now() + maxAge * 1000 };
	}
	return certCache.keys.get(kid);
}

export function isEmailAllowed(email: string, allowed: string[] | string): boolean {
	const rules = (Array.isArray(allowed) ? allowed : String(allowed ?? "").split(","))
		.map((r) => r.trim().toLowerCase())
		.filter(Boolean);
	const e = email.toLowerCase();
	return rules.some((r) => (r.startsWith("@") ? e.endsWith(r) : e === r));
}

export async function verifyGoogleIdToken(token: string, cfg: AuthConfig): Promise<{ email: string; name: string }> {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Malformed token");
	const header = decodeJson<JwtHeader>(parts[0]);
	if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

	const key = await googleKey(header.kid);
	if (!key) throw new Error("Unknown signing key");
	const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
	if (!valid) throw new Error("Bad token signature");

	const claims = decodeJson<GoogleClaims>(parts[1]);
	if (!GOOGLE_ISSUERS.includes(claims.iss)) throw new Error("Wrong issuer");
	if (!cfg.GOOGLE_CLIENT_ID || claims.aud !== cfg.GOOGLE_CLIENT_ID) throw new Error("Token is for another app");
	if (claims.exp * 1000 < Date.now()) throw new Error("Token expired");
	if (!claims.email || !claims.email_verified) throw new Error("Email not verified");
	if (!isEmailAllowed(claims.email, cfg.ALLOWED_EMAILS)) throw new Error("not_allowed");
	return { email: claims.email, name: claims.name ?? claims.email };
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionCookie(user: { email: string; name: string }, secret: string): Promise<string> {
	const session: Session = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
	const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload)));
	return `${SESSION_COOKIE}=${payload}.${bytesToBase64Url(sig)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readSession(req: Request, cfg: AuthConfig): Promise<Session | null> {
	if (!cfg.SESSION_SECRET) return null;
	const cookie = req.headers.get("cookie") ?? "";
	const raw = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
	if (!raw) return null;
	const [payload, sig] = raw.split(".");
	if (!payload || !sig) return null;
	try {
		const ok = await crypto.subtle.verify("HMAC", await hmacKey(cfg.SESSION_SECRET), base64UrlToBytes(sig), encoder.encode(payload));
		if (!ok) return null;
		const session = decodeJson<Session>(payload);
		if (session.exp * 1000 < Date.now()) return null;
		// Re-check so removing someone from ALLOWED_EMAILS takes effect without waiting for expiry.
		return isEmailAllowed(session.email, cfg.ALLOWED_EMAILS) ? session : null;
	} catch {
		return null;
	}
}
