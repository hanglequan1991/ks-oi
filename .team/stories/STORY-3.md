# STORY-3: Chatbot Q&A and hotel recommendation

- id: STORY-3
- status: todo
- owner: product

## User need
As a guest looking for a hotel in Vietnam, I want to ask any question in natural language, in Vietnamese or English, and get helpful answers, recommendations, pictures and prices, so that I can find the best hotel for me.

## Scope
- In: answering questions about hotels from imported data; recommending hotels based on stated needs (city/area, budget, number of nights if given, guests, amenities); returning images; showing prices (final price from STORY-4); asking a clarifying question when needed; a fallback with contact details when the bot does not know; Vietnamese and English conversation; short-term conversation context; handing over the contacts when a guest wants to book.
- Out: any channel connection (web chat is STORY-10; Facebook STORY-5 and Zalo STORY-6 are deferred); price calculation rules (STORY-4); making bookings, availability checks or payments (booking is done by phone outside this system); live-agent handoff; admin screens.
- Dependencies: STORY-1 and STORY-2 for data; STORY-4 for prices; STORY-9 for contact details. This story is the channel-agnostic core: it receives a guest message plus a conversation identity and returns text, images and contacts. STORY-10 (web chat) is the first channel; later channels reuse it unchanged.
- Assumption: the bot answers only from imported data and never invents hotels, prices or facts.

## Acceptance criteria
1. AC1: Given imported hotel data, when a guest asks a factual question that the data answers (address, amenities, room types, policies), then the bot answers correctly based on that data.
2. AC2: Given a guest states needs (for example city, budget, guests, amenities), when they ask for suggestions, then the bot recommends matching hotels and says briefly why each fits.
3. AC3: Given no hotel matches the criteria, then the bot says so and suggests the closest alternatives or asks the guest to relax a criterion.
4. AC4: Given a request is too vague to recommend (for example no city), then the bot asks a clarifying question.
5. AC5: Given a guest asks to see pictures of a hotel or room that has images, then the bot returns those images.
6. AC6: Given a hotel or room has no images, when pictures are requested, then the bot says none are available and returns nothing broken.
7. AC7: Given a guest asks about price, then the bot replies with the final price from STORY-4 and never the raw base price.
8. AC8: Given the answer is not in the data, or the question is off-topic, then the bot apologises, says it does not know, does not make up an answer, and shows the configured contact details.
9. AC9: Given a guest writes in Vietnamese (including without diacritics) or in English, then the bot replies in the same language.
10. AC10: Given a follow-up that depends on the previous message (for example "how much is the second one?"), then the bot uses the conversation context to answer.
11. AC11: Given the data source is marked stale or failed, then the bot still answers from the last good data.
12. AC12: Given a hotel has data from both a Doc and a Sheet, then the bot's answer uses both without contradiction, with price always taken from the Sheet.
13. AC13: Given a guest asks to book, check availability or pay, then the bot explains that booking is done by phone, shows the configured contact details, and does not take a reservation.
14. AC14: Given a guest asks for general chat unrelated to hotels, then the bot politely declines and steers back to hotels.
15. AC15: Given two conversations at the same time, then each uses only its own context.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Is booking in scope?
A: No. Booking is done by phone call outside this system; the bot hands over the contacts. (answered by user)

Q2: Which languages?
A: Vietnamese and English; the bot replies in the guest's language. (answered by user)

Q3: What should the bot do when it does not know?
A: Apologise and show the contacts. (answered by user)

Q4: Human handoff (live agent inbox)? Recommended default: out of scope.
A: Default, unconfirmed: out of scope.

Q5: Conversation retention and privacy? Recommended default: keep conversations 90 days for quality review; store no personal data beyond an anonymous conversation id (guests do not sign in).
A: Default, unconfirmed.

Q6: Refuse unrelated topics?
A: Default, unconfirmed: politely decline and steer back to hotels (AC14).
