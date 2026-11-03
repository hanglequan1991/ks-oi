# STORY-10: Public web chat page with embedded chatbot widget

- id: STORY-10
- status: todo
- owner: product

## User need
As a guest looking for a hotel in Vietnam, I want to open a public web page and chat with the hotel bot in Vietnamese or English, so that I can get answers, pictures and prices without installing an app or signing in.

## Scope
- In: a public web page with an embedded chat widget; sending text messages and showing the bot's replies; showing images and prices in the conversation; per-visitor conversation; Vietnamese and English interface texts; a clear message when the bot is unreachable.
- Out: guest sign-in; Facebook Messenger (STORY-5, deferred); Zalo (STORY-6, deferred); embedding the widget on third-party websites (can be a later story); the bot's reasoning and content (STORY-3); bookings or payments; live-agent handoff.
- Dependencies: STORY-3 (the channel-agnostic bot core). STORY-3 and STORY-10 are delivered together as the first usable release.
- Assumption (default, unconfirmed): one page, no login; a visitor's conversation is kept only for their browser session and is separate from every other visitor's.

## Acceptance criteria
1. AC1: Given any visitor, when they open the web chat page, then the chat widget is visible and usable without signing in.
2. AC2: Given the widget is open, when the guest sends a text message, then the bot's reply appears in the same conversation using STORY-3 behaviour.
3. AC3: Given the bot replies with hotel pictures, then the images are displayed in the conversation, and an image that fails to load does not break the conversation.
4. AC4: Given the bot quotes a price, then it is shown in the conversation as the final price from STORY-4.
5. AC5: Given the bot's reply contains contact details, then they are readable and phone numbers and links are tappable.
6. AC6: Given two visitors chat at the same time, then each sees only their own conversation and replies.
7. AC7: Given a guest writes in Vietnamese or English, then the interface texts (greeting, placeholder, error messages) and bot replies are in that language; the guest can switch the interface language.
8. AC8: Given a guest sends an empty message or only spaces, then nothing is sent.
9. AC9: Given the bot is waiting for a reply, then the guest sees a clear "typing/working" indicator, and cannot cause the same message to be sent twice by repeated clicking.
10. AC10: Given the bot service is unreachable or fails, then the guest sees a friendly error message in their language, with the configured contact details if available, and can retry.
11. AC11: Given a very long message is entered, then it is refused or shortened with a clear notice instead of failing silently.
12. AC12: Given the page is opened on a phone-sized screen, then the chat remains usable without horizontal scrolling.
13. AC13: Given the guest reloads the page within the same browser session, then the earlier messages of that session are still shown.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Is a standalone page sufficient for the first release, or must the widget also be embeddable on an existing hotel website? Default, unconfirmed: standalone page only; the widget is built as a self-contained component so embedding can be added later.
A: Default, unconfirmed (user asked only for "a web page with an embedded chatbot widget").
