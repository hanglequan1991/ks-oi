# STORY-9: Admin settings for contact information

- id: STORY-9
- status: todo
- owner: product

## User need
As an admin, I want to set the business contact details (phone, Zalo, Facebook and others) on the admin page, so that the chatbot gives guests the right way to reach the hotel team.

## Scope
- In: viewing and editing one global set of contact details (phone number, Zalo link or number, Facebook page link, email, website, and other optional entries); validation; use of these details by the bot when it hands guests over for booking or cannot answer. The values are shown only as text or links in replies; Zalo and Facebook here are just contact values, not channel connections.
- Out: sign-in (STORY-7); per-hotel contact details; live chat handoff; showing contacts on channel profiles.
- Dependencies: STORY-7 for access. Used by STORY-3 (fallback and booking requests) and STORY-10 (error message).
- Decided by user: one global contact set only.

## Acceptance criteria
1. AC1: Given a signed-in admin, when they open contact settings, then they see the current values.
2. AC2: Given valid input, when the admin saves, then the contacts are stored and shown on the next visit.
3. AC3: Given an invalid value (phone not a valid Vietnamese number, Facebook or Zalo link not a valid link, malformed email), then saving is refused with an error next to the field.
4. AC4: Given contacts are saved, when the bot cannot answer or a guest asks how to book or contact the hotel, then the reply includes the saved contacts, and only those that are filled in.
5. AC5: Given an admin changes a contact, then the next bot reply uses the new value without restarting.
6. AC6: Given no contacts are configured, then the bot still replies to the fallback without placeholders or empty fields.
7. AC7: Given a user who is not signed in, then they cannot see or change contacts.
8. AC8: Given any contact change, then an audit entry is recorded (STORY-7 AC10).
9. AC9: Given hotel data imported from Sheets, then the bot never shows a hotel-specific contact; only the global contacts are used.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Global contacts or per hotel?
A: One global set only; no per-hotel contacts. (answered by user)

Q2: Which contact types are required?
A: Default, unconfirmed: phone, Zalo, Facebook page; optional email, website, address, opening hours.

Q3: Show contacts on channel profiles?
A: Not applicable: Messenger and Zalo are deferred; contacts appear only in bot replies.
