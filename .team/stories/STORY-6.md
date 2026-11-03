# STORY-6: Zalo channel

- id: STORY-6
- status: blocked
- owner: product
- note: deferred by user: no accounts yet

## User need
As a guest in Vietnam, I want to chat with the hotel bot through Zalo, so that I can get help on the app most people here use.

## Scope
- In: receiving guest messages from a connected Zalo Official Account; replying with text and images; connection setup and verification; per-guest conversations.
- Out: Facebook (STORY-5); Zalo personal accounts; Zalo mini apps and ZNS notifications; the bot's reasoning and content (STORY-3).
- Dependencies: STORY-3 (channel-agnostic core, first delivered through STORY-10). Credentials and connection state are managed by the admin page (STORY-7).
- Status: deferred by user: no Zalo Official Account yet. Do not plan or dispatch until the user reactivates it.
- Assumption: one Zalo Official Account for the first release.

## Acceptance criteria
1. AC1: Given the Official Account is connected, when a guest sends a text message, then the bot replies in the same conversation using STORY-3 behaviour.
2. AC2: Given the bot needs to show pictures, then the images are delivered in Zalo.
3. AC3: Given two guests chat at the same time, then each gets only their own context and replies.
4. AC4: Given Zalo sends the same message event more than once, then the guest gets only one reply.
5. AC5: Given a request that does not genuinely come from Zalo (invalid signature), then it is rejected and not processed.
6. AC6: Given a guest sends something that is not text, then the bot replies that it can only read text, without an error.
7. AC7: Given a reply is longer than Zalo allows, then it is split into several messages in correct order.
8. AC8: Given Zalo's access to the account expires, then the system renews it automatically; if renewal fails, the failure is visible to the admin.
9. AC9: Given the connection is not set up, then the admin sees the channel as "not connected" with what is missing.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Does the business already have a verified Zalo Official Account with API access?
A: No. Deferred by user: no accounts yet. (answered by user)

Q2: Proactive messages? Recommended default: no, reply only.
A: Deferred; default kept, unconfirmed.

Q3: Multiple Official Accounts or one? Recommended default: one.
A: Deferred; default kept, unconfirmed.
