import { describe, it, expect } from "vitest";
import { NETWORK_CAUSES, classifyFetchError, type NetworkCause } from "../../src/sync/fetchErrors";

describe("classifyFetchError maps each message to its cause", () => {
	it("maps subrequest, invocation, timeout, redirect and unknown errors", () => {
		expect(classifyFetchError(new TypeError("Too many subrequests"))).toBe("subrequest_limit");
		expect(classifyFetchError(new TypeError("Illegal invocation"))).toBe("illegal_invocation");
		expect(classifyFetchError(new TypeError("TOO MANY SUBREQUESTS by this worker"))).toBe("subrequest_limit");
		expect(classifyFetchError(new Error("request timed out"))).toBe("timeout");
		expect(classifyFetchError(new Error("Connection timeout"))).toBe("timeout");
		const named = new Error("operation was aborted");
		named.name = "TimeoutError";
		expect(classifyFetchError(named)).toBe("timeout");
		const abort = new Error("aborted");
		abort.name = "AbortError";
		expect(classifyFetchError(abort)).toBe("timeout");
		expect(classifyFetchError(new TypeError("Too many redirects"))).toBe("redirect_error");
		expect(classifyFetchError(new TypeError("socket hang up"))).toBe("network_other");
	});

	it("maps non-Error values to network_other", () => {
		expect(classifyFetchError("Too many subrequests")).toBe("network_other");
		expect(classifyFetchError(undefined)).toBe("network_other");
		expect(classifyFetchError(null)).toBe("network_other");
		expect(classifyFetchError(42)).toBe("network_other");
	});
});

describe("classifyFetchError output is always a member of NETWORK_CAUSES", () => {
	it("returns only the five closed codes", () => {
		expect([...NETWORK_CAUSES].sort()).toEqual(
			["illegal_invocation", "network_other", "redirect_error", "subrequest_limit", "timeout"].sort(),
		);
		const samples: unknown[] = [
			new TypeError("Too many subrequests"),
			new TypeError("Illegal invocation"),
			new Error("timed out"),
			new Error("redirect loop"),
			new Error("something else"),
			"plain string",
			undefined,
		];
		for (const sample of samples) {
			const cause: NetworkCause = classifyFetchError(sample);
			expect(NETWORK_CAUSES).toContain(cause);
		}
	});
});
