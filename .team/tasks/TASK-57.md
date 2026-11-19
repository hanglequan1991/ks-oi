# TASK-57: Optional free-text extractor interface (Workers AI) with fake

- id: TASK-57
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-59 (vitest include for test/sync, must run first), TASK-48
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/extract.ts` exports `interface FreeTextExtractor { extract(input: { text: string; kind: 'description' | 'facilities' }): Promise<{ descriptionVi?: string | null; facilities?: string[] }> }`, `createPassthroughExtractor()` (raw text as is, no facilities split beyond commas/newlines) and `createAiExtractor(ai: AiLike, opts?)` where `AiLike = { run(model: string, input: unknown): Promise<unknown> }`.
2. AC2: `pickExtractor(env: { AI?: AiLike })` returns the AI extractor when the binding exists, else the passthrough (raw text stored as is, STORY-14 default 4).
3. AC3: the AI extractor never touches booking rules, prices or image URLs (its input type has no such kinds). The model name and `EXTRACTOR_VERSION` are exported constants.
4. AC4: the AI reply is parsed as JSON and checked by a hand-written validator (string max 4000, facilities max 80 items of max 80 chars). On invalid JSON or a schema failure it retries once, then falls back to the passthrough result and returns `warning: 'extractor_fallback'`; it never throws.
5. AC5: `test/fakes/extractor.ts` exports a fake AI (`createFakeAi(replies)`) returning scripted replies or throwing.

## Unit tests to write
- [ ] `passthrough returns raw text and splits facilities`: covers AC1
- [ ] `pickExtractor chooses by binding`: covers AC2
- [ ] `ai extractor returns validated values`: covers AC3, AC4
- [ ] `invalid json twice falls back with warning`: covers AC4
- [ ] `ai throwing falls back and does not throw`: covers AC4
- [ ] `oversized fields rejected by validator`: covers AC4

## Files this task may touch
- `sheet-rag/src/sync/extract.ts`
- `sheet-rag/test/fakes/extractor.ts`
- `sheet-rag/test/sync/extract.spec.ts`

## Dev notes
- Red: spec failed with missing module `src/sync/extract`. Green: 9/9 extractor tests pass. Full unit suite: 58 files, 411 tests pass.
- Model name `EXTRACTOR_MODEL = "@cf/meta/llama-3.1-8b-instruct"` is my choice; no text model is named in the design or config. Confirm before deploy (one constant to change).
- A thrown error from the AI binding falls back at once (no retry). Only invalid JSON and schema failures are retried once.
- The `warning` field is an optional extra on the result type, needed for AC4.

## Review

Verdict: approve

- AC1-AC5 covered; tests use createFakeAi only, no real AI call. Suite green (420 tests). Only the three listed files are involved.
- Invalid JSON / schema failure retried once then passthrough with `warning: 'extractor_fallback'` (tested, 2 calls); a throwing binding falls back at once and never throws (tested); limits tested at 4000/80/80 and at the exact boundary.
- Input kinds are only 'description' | 'facilities'; the extractor has no path for booking rules, prices or image URLs (sheet-owned), and the prompt forbids mentioning them. This is enforced by types only, not by a test; acceptable.
- EXTRACTOR_MODEL `@cf/meta/llama-3.1-8b-instruct`: UNVERIFIED. No Cloudflare docs search tool was available in this session. To my knowledge it is a Workers AI text-generation model, but it may be deprecated or renamed; confirm against the current Workers AI model catalogue before deploy. It is a single constant.

## Questions
