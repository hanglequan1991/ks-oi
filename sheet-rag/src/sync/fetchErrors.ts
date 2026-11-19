/**
 * Cause codes for a thrown fetch (STORY-14, TASK-63).
 *
 * Only `error.name` and `error.message` are looked at, case-insensitively.
 * The text is never stored or returned, so a URL inside it cannot leak.
 * This module has no imports on purpose (types only, none needed).
 */

/** Closed set of causes; the error code is `<reason>_<cause>`. */
export const NETWORK_CAUSES = [
	"subrequest_limit",
	"illegal_invocation",
	"timeout",
	"redirect_error",
	"network_other",
] as const;

export type NetworkCause = (typeof NETWORK_CAUSES)[number];

const TIMEOUT_NAMES = new Set(["timeouterror", "aborterror"]);

/** Maps a thrown value from fetch to one cause. Anything unknown is network_other. */
export function classifyFetchError(error: unknown): NetworkCause {
	if (!(error instanceof Error)) {
		return "network_other";
	}
	const name = String(error.name ?? "").toLowerCase();
	const message = String(error.message ?? "").toLowerCase();
	if (message.includes("too many subrequests")) return "subrequest_limit";
	if (message.includes("illegal invocation")) return "illegal_invocation";
	if (TIMEOUT_NAMES.has(name) || message.includes("timed out") || message.includes("timeout")) {
		return "timeout";
	}
	if (message.includes("redirect")) return "redirect_error";
	return "network_other";
}
