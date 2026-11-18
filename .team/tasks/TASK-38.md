# TASK-38: Billing routes, hidden-page checks (src/web/routes/bill.ts)

- id: TASK-38
- story: [STORY-11](../stories/STORY-11.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-37 (`BillPage`), TASK-14 (`createApp`, `WebEnv`, `mount` hook; the route is registered by the `mount` callback, `src/web/app.ts` is not edited), TASK-9 (`renderPage`), TASK-5 (`getSettings`)
- size: fits a 100k-token context (one route file and its test)

## Why
Registers `GET /bill` and `GET /en/bill` on the app passed in, like `registerMetaRoutes` (TASK-24); `src/web/app.ts` and `src/index.ts` stay untouched (TASK-15 later calls this function from the Worker entry). The route takes its own `getSettings` dependency. It checks that the page is hidden and public: noindex, not linked, not in a sitemap or robots.txt, no cookies, no admin.

`sheet-rag/src/web/routes/bill.ts`:
```ts
export function registerBillRoutes(app: Hono<WebEnv>, deps: { getSettings(): Promise<SiteSettings> }): void;
```
- `GET /bill` renders `BillPage` in Vietnamese, `GET /en/bill` in English, through `renderPage`. Settings are read once per request.
- Response headers added by this route: `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600` (the shell has no personal data and can be edge-cached); no `Set-Cookie`. Noindex and the five security headers come from `createApp` (TASK-11) and are asserted here as a regression check.
- Only GET: `POST /bill` is not registered (404 or 405 from the app).
- No registration of `/sitemap.xml` or `/robots.txt` here (they do not exist in Version 1; when they are built in Version 2 they must exclude `/bill`).
- A failing `getSettings` gives the app's 500 (handled by `onError` in TASK-14).

## Acceptance criteria
1. AC1: `GET /bill` returns 200 HTML with `<html lang="vi"` and Vietnamese labels, with no cookie, no `Authorization` header and no storage involved.
2. AC2: `GET /en/bill` returns 200 with `<html lang="en"`, English labels, the English disclaimer and `Includes 10% service fee`.
3. AC3: a sample page rendered with `Layout` through the same app (the header, footer and language toggle, plus a second sample page) contains no `href` to `/bill` or `/en/bill` other than the canonical and alternate link tags of the billing page itself; the billing page output has no `<a href>` pointing to `/bill`.
4. AC4: with the app from `createApp` and only this route mounted, `GET /sitemap.xml` and `GET /robots.txt` do not return text containing `bill` (they answer 404 in Version 1); the route file source contains no sitemap or robots registration.
5. AC5: both responses carry `X-Robots-Tag: noindex, nofollow` and the HTML has `<meta name="robots" content="noindex, nofollow">`.
6. AC6: the responses contain no link to `/admin`, no `Set-Cookie` header, and no admin endpoint is registered by this module (a test lists the routes registered through the mount hook: only `GET /bill` and `GET /en/bill`).
7. AC34: `POST /bill` with a body (a note-like text) is not handled (status 404 or 405) and the body is not echoed in the response.
8. Caching: the 200 responses carry the `Cache-Control` value above; changing the fake settings between two requests changes the output (the route itself does not memoise).
9. A rejecting `getSettings` gives a 500 with security headers and `noindex` (not a crash).

## Unit tests to write
In `test/web/routes/bill.spec.tsx` (uses `createApp({ getSettings, mount })`, fake settings, `app.request`; no D1, no Cloudflare).
- [ ] `bill page is Vietnamese without any sign-in or cookie`: covers AC1
- [ ] `en bill page is English with disclaimer and fee note`: covers AC2
- [ ] `no page links to the billing page`: covers AC3
- [ ] `sitemap and robots do not mention the billing page`: covers AC4
- [ ] `bill pages are noindex in header and meta`: covers AC5
- [ ] `no admin link, no cookie, only the two bill routes`: covers AC6
- [ ] `post is not accepted and nothing is echoed`: covers AC7
- [ ] `edge cache header and settings change`: covers AC8
- [ ] `settings failure gives a safe 500`: covers AC9

## Files this task may touch
- `sheet-rag/src/web/routes/bill.ts` (new)
- `sheet-rag/test/web/routes/bill.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
