# STORY-8: Admin settings for add-on fees

- id: STORY-8
- status: todo
- owner: product

## User need
As an admin, I want to create and maintain percentage add-on fees on the admin page, so that the prices the chatbot quotes are always correct without a developer.

## Scope
- In: listing, creating, editing, activating/deactivating and deleting fees; each fee has a name, a percentage value, and a scope (global or selected hotels); optional start and end dates; validation; a preview of the final price for a sample base price.
- Out: the calculation itself (STORY-4); sign-in (STORY-7); fixed-VND fees and per-booking fees; discounts and taxes as separate concepts.
- Dependencies: STORY-7 for access; defines the fee data used by STORY-4. For hotel selection, STORY-1/2 data is needed.
- Decided by user: fees are percentage only and charged per night, so there is no type or basis setting.
- Defaults, unconfirmed: global or selected-hotel scope; optional validity dates; maximum 100%; immediate effect.

## Acceptance criteria
1. AC1: Given a signed-in admin, when they open fee settings, then they see all fees with name, percentage, scope, validity dates (if any) and status.
2. AC2: Given valid input, when the admin creates a fee, then it is saved and appears in the list.
3. AC3: Given invalid input (empty name, negative or zero percentage, percentage above 100, end date before start date, no hotel selected for a hotel-limited fee), then saving is refused with an error message next to the field.
4. AC4: Given an existing fee, when the admin edits it, then the change is saved and the next price quote uses it.
5. AC5: Given an existing fee, when the admin deactivates it, then it is no longer applied but remains in the list and can be reactivated.
6. AC6: Given a fee, when the admin deletes it after confirming, then it is removed and no longer applied.
7. AC7: Given a sample base price and number of nights entered in the preview, then the page shows the resulting final price using the current fees.
8. AC8: Given a user who is not signed in, then they cannot see or change fees.
9. AC9: Given any fee change, then an audit entry is recorded (STORY-7 AC10).

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Who can edit fees?
A: Any signed-in admin (single admin role). (answered by user)

Q2: Validity period?
A: Default, unconfirmed: optional start and end dates.

Q3: Maximum percentage?
A: Default, unconfirmed: 100%.

Q4: Immediate effect or approval step?
A: Default, unconfirmed: immediate.
