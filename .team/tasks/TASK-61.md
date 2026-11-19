# TASK-61: Replace deprecated extractor model and use Workers AI JSON mode

- id: TASK-61
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 1
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
- Red: 4 new tests failed as expected (model constant, version, json_schema request, retry request). The object-response test passed already because parseReply already accepts objects; kept as a guard.
- Green: `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/sync`: extract.spec.ts all green (14 tests in file). Full sync run: 74 tests passed; test/sync/syncHotel.spec.ts fails at import (another dev's concurrent file, ignored).
- Could not verify the Workers AI JSON mode docs: developers.cloudflare.com is blocked by the sandbox proxy. Implemented the `json_schema: { name, schema }` shape exactly as AC2 specifies. Reviewer/pm should confirm against the live docs before deploy (the json_schema field shape is the one thing not checked).
- Grep: no `extract-v1` or `llama-3.1-8b` strings remain under sheet-rag/src or sheet-rag/test, so no other file asserts the old version.

## Review
Verdict: rework

Model constant, version bump, single retry, fallback and object-reply parsing are all correct and tested. One defect, from the Cloudflare docs check of 2026-11-19: for Workers AI text models such as `@cf/meta/llama-3.3-70b-instruct-fp8-fast` the documented JSON mode request is `response_format: { type: 'json_schema', json_schema: <the JSON Schema object itself> }`. The `{ name, schema }` wrapper is the OpenAI-style shape the docs show only for other model families (xai/grok, reflection-ai/beam). AC2's wording `json_schema: { name, schema }` was wrong for this model and is superseded by this note.
1. In `sheet-rag/src/sync/extract.ts` `buildRequest`, pass the schema directly: `response_format: { type: "json_schema", json_schema: REPLY_SCHEMA }`. Drop the `name` wrapper. Keep `REPLY_SCHEMA` (type object, `descriptionVi` string or null, `facilities` array of strings, `additionalProperties: false`), the model, `EXTRACTOR_VERSION = "extract-v2"`, the single retry and the fallback.
2. In `extract.spec.ts` update the assertions so that `input.response_format.json_schema` equals the schema object itself (has `type: 'object'`, `properties.descriptionVi`, `properties.facilities`, `additionalProperties: false`) and has no `schema` or `name` key; apply this to both the first call and the retry call test.
3. Reply shape: docs show the reply as an object under `response`; parseReply already accepts it (test exists), no change.
4. Update the Dev notes line about the unverified docs shape (now verified) and keep the Operational note (re-check deprecation before deploy).

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->

## Operational note
The model deprecation check must be repeated before each deploy: confirm in the Workers AI model catalog (developers.cloudflare.com/workers-ai/models/) that `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is not Deprecated and has no near planned deprecation date. Deprecation status is time-sensitive and was only verified on 2026-11-19.
