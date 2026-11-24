# TASK-32: Worker entry wiring (fetch handler and KV source)

- id: TASK-32
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-31 (and TASK-17 for `DirectorySource`)
- size: fits ~8k tokens with context (existing `src/index.ts` is 59 lines; one complete file call)

## Acceptance criteria
Covers STORY-11: AC42 (new data on next load; reading from the store on each request), AC37 (non-lookup paths are not hijacked), wiring of AC1..AC43 to the Worker.
1. `/hotels` and `/hotels/<id>` are served by `handleLookup`; every other request gets a plain 404 (`Not found`) for now (the chatbot, STORY-3/10, will add its routes later).
2. The directory store is the optional KV binding `DIRECTORY_KV`; when it is not bound the directory renders its empty state without error.

Notes for the reviewer: `src/index.ts` currently has NO default export (no `fetch` handler), so the existing `test/index.spec.ts` ("Hello World!") already fails before this task; this task replaces that stale spec. The KV namespace binding in `wrangler.jsonc` and the data writer belong to STORY-2 and are intentionally NOT done here. Existing `ingest` and `search` functions must stay unchanged.

## Spec for local-dev (copy into the spec file)
Target: `sheet-rag/src/index.ts` (complete file; keep ALL existing code exactly: `Env`, `EMBED_MODEL`, `parseCsv`, `ingest`, `search`). Make these changes only:
1. Add `import { handleLookup } from "./lookup/router";` at the top.
2. Add an optional field to `Env`: `DIRECTORY_KV?: KVNamespace;` (type from workers types; do not touch the other fields).
3. Append at the end of the file:
```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const source = env.DIRECTORY_KV
      ? { get: (key: string) => env.DIRECTORY_KV!.get(key) }
      : null;
    const lookup = await handleLookup(request, source);
    if (lookup) return lookup;
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```
Test file (written by local-dev test-first, replaces the stale Hello World spec): `sheet-rag/test/index.spec.ts`, using `import worker from "../src/index"`, `import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test"`, `const IncomingRequest = Request<unknown, IncomingRequestCfProperties>`:
- `GET http://example.com/hotels` with the test env (no DIRECTORY_KV unless the test env provides it) -> status 200, `content-type` contains `text/html`, body contains `Hotel Dictionary` or the Vietnamese empty text `Hiện chưa có khách sạn nào.`.
- With a fake env `{ ...env, DIRECTORY_KV: { get: async () => JSON.stringify({ hotels: [{ id: "1", name: "Sunrise", city: "Huế", rooms: [{ type: "Std", basePrice: 1000000 }] }] }) } as any }` -> `/hotels` body contains `Sunrise`; `/hotels/1` -> 200; `/hotels/zzz` -> 404.
- `GET /unknown` -> 404 with body `Not found`.

## Unit tests to write
- [ ] `/hotels returns the HTML directory (empty state when KV is not bound)`: covers AC22
- [ ] `/hotels lists hotels from the KV store`: covers AC42
- [ ] `/hotels/<id> found vs not found`: covers AC37
- [ ] `other paths return 404 Not found`: covers routing

## Files this task may touch
- `sheet-rag/src/index.ts`
- `sheet-rag/test/index.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/index.spec.ts` (full suite: `npx vitest run`).

## Dev notes

## Review

## Questions
