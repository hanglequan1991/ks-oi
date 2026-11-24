# TASK-17: Directory data loader with last-good cache

- id: TASK-17
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-15
- size: fits ~8k tokens with context (one small module)

## Acceptance criteria
Covers STORY-11: AC42 (new data on next load; last good data when the refresh failed), AC22, AC43.
1. AC42: every call reads the source again (no stale in-memory data when the source works).
2. AC42: when the source throws, returns null or unparsable JSON, the last good data is returned.
3. AC22: with no source and no last good data, returns empty data and never throws.

Tech decision: the store is abstracted as `DirectorySource` (`get(key)`); the Worker wires it to Workers KV in TASK-32. Creating the KV binding and writing the data is STORY-2's job (intentionally not in this story).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/store.ts`. Imports only `import { EMPTY_DATA, parseDirectoryData } from "./data"; import type { DirectoryData } from "./data";`. Exports exactly:
```ts
export const DIRECTORY_KEY = "directory:v1";
export interface DirectorySource { get(key: string): Promise<string | null> }
export interface DirectoryCache { lastGood: DirectoryData | null }
export function createCache(): DirectoryCache          // { lastGood: null }
export const defaultCache: DirectoryCache               // = createCache()
export async function loadDirectory(source: DirectorySource | null | undefined, cache: DirectoryCache = defaultCache): Promise<DirectoryData>
```
- `fallback()` = `cache.lastGood ?? { hotels: [], fees: [], contact: null }` (do not return the shared `EMPTY_DATA` object itself).
- No source -> `fallback()`. Else `try { text = await source.get(DIRECTORY_KEY); if (text === null || text === undefined) return fallback(); data = parseDirectoryData(JSON.parse(text)); cache.lastGood = data; return data; } catch { return fallback(); }`.
- Examples: source returns `JSON.stringify({hotels:[{id:"1",name:"A"}]})` -> 1 hotel and `cache.lastGood` set; next call source returns `{hotels:[{id:"2",name:"B"}]}` -> hotel "2" (new data); next call source throws -> hotel "2" (last good); source returns `"not json"` -> last good; fresh cache + null source -> `{hotels:[],fees:[],contact:null}`; fresh cache + `get` returns null -> empty.

## Unit tests to write
- [ ] `loads and parses data from the source and stores last good`: covers AC42
- [ ] `second call picks up changed data`: covers AC42
- [ ] `source error, null or invalid JSON returns last good data`: covers AC42
- [ ] `no source or nothing stored returns empty data without throwing`: covers AC22
- [ ] `invalid hotel rows in stored JSON are dropped`: covers AC43

## Files this task may touch
- `sheet-rag/src/lookup/store.ts`
- `sheet-rag/test/lookup/store.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/store.spec.ts`

## Dev notes

## Review

## Questions
