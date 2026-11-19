/** Scripted stand-in for the Workers AI binding used by the AI extractor. */
export type FakeAiCall = { model: string; input: unknown };

export interface FakeAi {
	run(model: string, input: unknown): Promise<unknown>;
	/** Every call made so far, in order. Mutable only through run(). */
	readonly calls: FakeAiCall[];
}

/**
 * Each entry of `replies` answers one call, in order. An Error instance is
 * thrown instead of returned. Calls beyond the script throw, so an
 * unexpected extra call fails loudly.
 */
export function createFakeAi(replies: Array<unknown | Error>): FakeAi {
	const queue = [...replies];
	const calls: FakeAiCall[] = [];
	return {
		calls,
		async run(model: string, input: unknown): Promise<unknown> {
			calls.push({ model, input });
			if (queue.length === 0) {
				throw new Error("fake AI: no scripted reply left");
			}
			const next = queue.shift();
			if (next instanceof Error) {
				throw next;
			}
			return next;
		},
	};
}
