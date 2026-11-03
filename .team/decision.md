# Decision log

Owned by `pm`. Append one row per significant answer or decision.

| Date | Decision | Made by | Reason | Links |
|---|---|---|---|---|
| 2026-11-03 | Add-on fees are percentage only and charged per night (no fixed VND, no per-booking). | user | User choice; keeps fee model simple. | .team/stories/STORY-4.md, .team/stories/STORY-8.md |
| 2026-11-03 | Booking is out of scope; booking happens by phone outside the system; bot hands over contacts. | user | Keep the system to information and pricing answers. | .team/stories/STORY-3.md |
| 2026-11-03 | Bot answers in Vietnamese and English; when it does not know it apologises and shows the contacts. | user | Serve guests in both languages with a safe fallback. | .team/stories/STORY-3.md, .team/stories/STORY-10.md |
| 2026-11-03 | Chatbot is public with no guest login; only one admin role, needed only to access the admin page (no Super admin/Viewer). | user | Simplify access model. | .team/stories/STORY-7.md, .team/stories/STORY-10.md |
| 2026-11-03 | Docs and Sheets refresh hourly; admin stale warning after 24 h without a successful import, bot keeps answering; one flat VND price per room type (no seasonal); images are public URLs in sheet cells only. | user | Simplify data import and pricing. | .team/stories/STORY-1.md, .team/stories/STORY-2.md |
| 2026-11-03 | Facebook and Zalo channels deferred; deliver a public web page with chatbot widget first (new STORY-10); STORY-5 and STORY-6 set to blocked. | user | User has no Facebook/Zalo accounts yet. | .team/stories/STORY-3.md, .team/stories/STORY-5.md, .team/stories/STORY-6.md, .team/stories/STORY-10.md |
| 2026-11-03 | One global contact set only; no per-hotel contacts shown anywhere. | user | Simplify contact handling. | .team/stories/STORY-9.md, .team/stories/STORY-2.md, .team/stories/STORY-3.md |
| 2026-11-03 | UNCONFIRMED defaults accepted by omission: fee scope global or selected hotels; no compounding; guest sees final price only, rounded to nearest 1,000 VND, max fee 100%; first admin created at setup with email/password, admin UI in Vietnamese; 90-day conversation retention; no human handoff; standalone web page (widget not embeddable elsewhere yet). | product (status: unconfirmed) | User did not object; needs explicit user confirmation. | .team/stories/STORY-4.md, .team/stories/STORY-7.md, .team/stories/STORY-8.md, .team/stories/STORY-3.md, .team/stories/STORY-10.md |
