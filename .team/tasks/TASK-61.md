# TASK-61: Replace deprecated extractor model and use Workers AI JSON mode

- id: TASK-61
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-57 (done)
- size: fits a 100k-token context (two files, one behaviour)

## Background
Verified on 2026-11-19 against Cloudflare docs (search_cloudflare_documentation connector): `@cf/meta/llama-3.1-8b-instruct` is listed as Deprecated in the Workers AI model catalog, and `@cf/meta/llama-3.1-8b-instruct-fp8` has a planned deprecation date of 11/20/2026. Replacement: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, which the owner's sheet-rag chat already uses and which supports JSON mode per the docs. Extraction runs only on changed tabs, so volume (and cost) is small.

Review of `src/sync/extract.ts`: `buildRequest` only sends `messages` and relies on the prompt for JSON. Workers AI JSON mode takes `response_format: { type: 'json_schema', json_schema: {...} }`. Adding it is a small, local change to `buildRequest`. `parseReply` already accepts both a string and an already-parsed object in `response`, so JSON mode replies (object) and legacy string replies both work. The existing single retry on invalid JSON and the fallback on throw stay unchanged.

## Acceptance criteria
1. AC1: `EXTRACTOR_MODEL` in `sheet-rag/src/sync/extract.ts` equals `'@cf/meta/llama-3.3-70b-instruct-fp8-fast'`.
2. AC2: every `ai.run` call (including the retry) receives `EXTRACTOR_MODEL` as the model and an input containing `messages` plus `response_format: { type: 'json_schema', json_schema: { name, schema } }`. The schema is an object with optional `descriptionVi` (string or null) and `facilities` (array of strings), `additionalProperties: false`. Check the current Workers AI JSON mode docs for the exact `json_schema` field shape before coding.
3. AC3: behaviour is otherwise unchanged: validation limits, one retry on invalid JSON then fallback with `warning: "extractor_fallback"`, immediate fallback when the binding throws, never throws. A reply whose `response` is already an object (JSON mode) is accepted.
4. AC4: `EXTRACTOR_VERSION` is bumped to `"extract-v2"` because model and request shape changed (keeps the cached extraction results from being reused across models). If any other file asserts `"extract-v1"`, do not edit it; report it in Dev notes instead.

## Unit tests to write
- [ ] `extractor model constant is the llama 3.3 70b fp8 fast model`: covers AC1 (asserts the literal string, not just the import)
- [ ] `ai extractor sends the model and json_schema response_format`: covers AC2 (inspects `ai.calls[0].model` and `ai.calls[0].input.response_format.type === 'json_schema'` and the schema properties)
- [ ] `retry call also sends response_format`: covers AC2 and AC3 (invalid reply then valid reply, both calls carry the model and response_format)
- [ ] `ai extractor accepts an object response from json mode`: covers AC3 (`{ response: { facilities: ['Gym'] } }`)
- [ ] existing tests in `extract.spec.ts` stay green: cover AC3
- [ ] `extractor version is extract-v2`: covers AC4

## Files this task may touch
- `sheet-rag/src/sync/extract.ts`
- `sheet-rag/test/sync/extract.spec.ts`

No other file may change (the fake at `sheet-rag/test/fakes/extractor.ts` is read-only here; `calls[].input` is already exposed).

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->

## Operational note
The model deprecation check must be repeated before each deploy: confirm in the Workers AI model catalog (developers.cloudflare.com/workers-ai/models/) that `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is not Deprecated and has no near planned deprecation date. Deprecation status is time-sensitive and was only verified on 2026-11-19.
