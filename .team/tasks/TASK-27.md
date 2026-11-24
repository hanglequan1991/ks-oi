# TASK-27: Image gallery markup

- id: TASK-27
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-18
- size: fits ~8k tokens with context (one tiny render function)

## Acceptance criteria
Covers STORY-11: AC30 (gallery of image URLs; a broken image is hidden without breaking the page), AC31 (placeholder when no images).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/view/gallery.ts`. Imports: `import { escapeHtml } from "../escape";`, `import { bi } from "../i18n";` (key `noImage`). Exports exactly:
```ts
export function renderGallery(images: string[], name: string): string
```
- `images.length === 0` -> `<div class="gallery placeholder">${bi("noImage")}</div>`.
- Else `<div class="gallery">` + for each url `<img src="${e(url)}" alt="${e(name)}" loading="lazy" onerror="this.style.display='none'">` + `</div>` (`e` = escapeHtml; urls are already filtered as safe http(s) by the caller).
- Examples: `renderGallery([], "A")` = `<div class="gallery placeholder"><span class="vi">Chưa có hình ảnh</span><span class="en">No image available</span></div>`; `renderGallery(["https://x/a.jpg","https://x/b.jpg"], 'Hotel "Q"')` has two `<img` tags, `alt="Hotel &quot;Q&quot;"`, and each contains `onerror="this.style.display='none'"`; a URL containing `"` or `&` is escaped inside `src`.

## Unit tests to write
- [ ] `renders one img per image URL with lazy loading`: covers AC30
- [ ] `each image hides itself on error`: covers AC30
- [ ] `empty list renders the placeholder and no img`: covers AC31
- [ ] `alt and src are escaped`: covers AC30

## Files this task may touch
- `sheet-rag/src/lookup/view/gallery.ts`
- `sheet-rag/test/lookup/view/gallery.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/view/gallery.spec.ts`

## Dev notes

## Review

## Questions
