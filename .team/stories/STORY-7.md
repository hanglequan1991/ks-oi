# STORY-7: Admin sign-in

- id: STORY-7
- status: todo
- owner: product

## User need
As an admin, I want to sign in to a protected admin page, so that only authorised people can change data sources, fees and contacts.

## Scope
- In: admin sign-in and sign-out; a single admin role; the first admin account created at setup; creating, disabling and resetting the password of other admin accounts; protecting every admin page and call; an audit trail of who changed what.
- Out: guest sign-in (the chatbot is public, no login); multiple roles (Super admin, Viewer); social login; self-service email password reset; the settings pages themselves (STORY-8, STORY-9, source setup screens).
- Dependencies: none. Required by STORY-8 and STORY-9, and by the admin screens of STORY-1 and STORY-2.
- Decided by user: one admin role only; it is required only to access the admin page.
- Defaults, unconfirmed: the first admin is created at setup time by the operator; any admin can create further admin accounts, disable another admin and reset another admin's password; sign-in by email and password.

## Acceptance criteria
1. AC1: Given no user is signed in, when someone opens any admin page or admin endpoint, then they are sent to the sign-in page (or refused) and see no admin data.
2. AC2: Given valid admin credentials, when a user signs in, then they reach the admin page.
3. AC3: Given wrong credentials, when a user tries to sign in, then they are refused with a generic message that does not reveal which part was wrong.
4. AC4: Given repeated failed sign-ins for one account, then further attempts are temporarily blocked.
5. AC5: Given a signed-in admin, when they create another admin account, then that person can sign in.
6. AC6: Given a signed-in admin, when they disable another admin, then that account is refused on its next request, including when already signed in.
7. AC7: Given a signed-in admin, when they reset another admin's password, then the old password stops working and the new one works.
8. AC8: Given there is only one active admin, then that account cannot be disabled or deleted.
9. AC9: Given a user signs out or the session expires, then admin pages are no longer accessible.
10. AC10: Given any change to admin accounts, fees or contact settings, then an audit entry (who, what, when) is recorded and viewable by any admin.
11. AC11: Given passwords are stored, then they are never retrievable in plain text by anyone.
12. AC12: Given the chatbot web page, then it is reachable without signing in and exposes no admin function.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Which roles and permissions?
A: One admin role only, required only to access the admin page. Super admin and Viewer dropped. (answered by user)

Q2: Sign-in method?
A: Default, unconfirmed: email and password.

Q3: How is the first admin created; forgotten passwords?
A: Default, unconfirmed: first account created at setup time by the operator; another admin can reset a password; no self-service email reset.

Q4: Audit trail retention?
A: Default, unconfirmed: 12 months.

Q5: Admin UI language?
A: Default, unconfirmed: Vietnamese.
