# STORY-4: Final price calculation with add-on fees

- id: STORY-4
- status: todo
- owner: product

## User need
As a hotel business owner, I want the system to add configured percentage fees to the Sheet base price before the guest sees it, so that the guest is always quoted the correct final price.

## Scope
- In: computing the final per-night price from a base price and the applicable percentage fees; stacking rule; rounding; a price breakdown available internally; using the fee configuration set in STORY-8.
- Out: the admin UI that edits fees (STORY-8); fixed-VND fees; per-booking fees; per-guest or per-room-type fees; taxes and invoicing; discounts or promotions; date-based pricing; booking totals with payment.
- Dependencies: STORY-2 (base price); STORY-8 (fee configuration). Used by STORY-3.
- Decided by user: fees are percentage only and charged per night.
- Defaults, unconfirmed: a fee is global or limited to selected hotels; percentages are not compounding; the guest sees only the final price, rounded to the nearest 1,000 VND.

## Acceptance criteria
1. AC1: Given a base price and no active fees, then the final nightly price equals the base price (after rounding).
2. AC2: Given an active percentage fee of p%, then the final nightly price includes base price x p%.
3. AC3: Given a stay of N nights, then the total is the final nightly price x N, because each fee applies to every night.
4. AC4: Given several active fees, then all applicable percentages are applied to the base price (not compounded on each other, default, unconfirmed), and the result is independent of the order fees were created in.
5. AC5: Given a fee limited to specific hotels, then it applies only to those hotels; a global fee applies to all.
6. AC6: Given a fee is inactive, or outside its validity period if one is set, then it is not applied.
7. AC7: Given a computed price, then it is rounded to the nearest 1,000 VND by one documented rule (default, unconfirmed).
8. AC8: Given the guest gave no number of nights, then the bot quotes the per-night final price and states that the price is per night.
9. AC9: Given an admin changes a fee, then the next price quote uses the new value without restarting the system.
10. AC10: Given a price is quoted, then the exact amounts used (base, each fee, final) can be reviewed internally, and the guest sees only the final price (default, unconfirmed).
11. AC11: Given a hotel has no valid base price, then no price is quoted and the bot says the price is unavailable.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Which fee types exist?
A: Percentage only. No fixed-VND fees. (answered by user)

Q2: How do fees stack?
A: Default, unconfirmed: every percentage is calculated on the base price (no compounding), then summed.

Q3: Per night or per booking?
A: Per night only; no per-booking fees. (answered by user)

Q4: Per hotel or global?
A: Default, unconfirmed: each fee is global or restricted to selected hotels; per room-type fees are out of scope.

Q5: Breakdown or final price only?
A: Default, unconfirmed: final price only, written as "from X VND per night".

Q6: Rounding rule?
A: Default, unconfirmed: nearest 1,000 VND.

Q7: Per guest or per room fees?
A: Out of scope (follows from "percentage per night only").

Q8: Taxes and VAT?
A: Default, unconfirmed: not handled by the system; any tax is configured as an ordinary percentage fee.
