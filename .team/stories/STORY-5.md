# STORY-5: Facebook Messenger channel

- id: STORY-5
- status: blocked
- owner: product
- note: deferred by user: no accounts yet

## User need
As a guest, I want to chat with the hotel bot through a Facebook Page's Messenger, so that I can get help in the app I already use.

## Scope
- In: receiving guest messages from a connected Facebook Page; replying with text and images; connection setup and verification; per-guest conversations.
- Out: Zalo (STORY-6); Facebook comments or Instagram; the bot's reasoning and content (STORY-3); live-agent handoff.
- Dependencies: STORY-3 (channel-agnostic core, first delivered through STORY-10). Credentials and connection state are managed by the admin page (STORY-7).
- Status: deferred by user: no Facebook account or Page yet. Do not plan or dispatch until the user reactivates it.
- Assumption: one Facebook Page for the first release.

## Acceptance criteria
1. AC1: Given the Page is connected, when a guest sends a text message in Messenger, then the bot replies in the same conversation using STORY-3 behaviour.
2. AC2: Given the bot needs to show pictures, then the images are delivered in Messenger.
3. AC3: Given two guests chat at the same time, then each gets only their own conversation context and replies.
4. AC4: Given Facebook sends a message event, then the system acknowledges it so that the same message is not processed twice.
5. AC5: Given a request that does not genuinely come from Facebook (invalid signature), then it is rejected and not processed.
6. AC6: Given a guest sends something that is not text (a sticker, a file, a voice message), then the bot replies that it can only read text, without an error.
7. AC7: Given a reply is longer than Messenger allows, then it is split into several messages in correct order.
8. AC8: Given the bot cannot reach Facebook to reply, then the failure is recorded and visible to the admin.
9. AC9: Given the connection is not set up, then the admin sees the channel as "not connected" with what is missing.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Who owns the Facebook Page and app registration, and will they be approved for public use? Recommended default: the business owns them and handles Meta approval.
A: Deferred by user: no Facebook account yet. Revisit on reactivation. (answered by user)

Q2: Greeting on "Get Started"? Recommended default: yes, a short greeting (Vietnamese/English).
A: Deferred; default kept, unconfirmed.

Q3: Proactive messages? Recommended default: no, reply only.
A: Deferred; default kept, unconfirmed.

Q4: Multiple Pages or one? Recommended default: one Page.
A: Deferred; default kept, unconfirmed.
