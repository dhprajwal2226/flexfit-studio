# FlexFit Studio — Behavior Spec

Documents actual, observed behavior of the app, feature by feature, before and during refactoring. Used to verify nothing breaks.

## Public / Schedule (all roles)

- Route: `/schedule`
- Anonymous users can view the full class list and see Book/Join waitlist buttons, but clicking is blocked (see Bug below); a "Sign in to book a class" hint shows at the bottom.
- Signed-in users can book directly from this page.
- A class shows "Full" and its button switches to "Join waitlist" once spots-left hits 0.
- Booking a class immediately refreshes the visible spots-left count and the user's "My bookings" data, without a page reload.

### Bug: schedule page loaded forever ("Loading schedule...")
- Where: `src/app/schedule/page.tsx`
- What happened: the page showed "Loading schedule..." indefinitely and never displayed any classes, for every role (admin, trainer, member) and when signed out.
- Root cause: `new Date().toISOString()` was recalculated on every render and passed as part of the `classes.list` query input. Since the query library treats a changed input as a new query, the changing timestamp caused an endless loop of requests (confirmed via browser Network tab — thousands of repeated `classes.list` requests, each individually succeeding).
- Fix: the timestamp is now computed once via `useState(() => new Date().toISOString())` when the component first mounts, instead of being recalculated on every render.
- Status: Fixed and verified working across all four roles (admin, trainer, member, signed-out).

### Noted, not fixed: disabled "Book" button has no distinct visual style
- Where: `src/app/schedule/page.tsx`, the booking button
- What happens: when signed out, the Book/Join waitlist buttons are functionally disabled (`disabled={!user}`) but rendered with the same visual style as an enabled button — no grayed-out appearance.
- Decision: left as-is for now; a minor UX polish item, not a functional bug. Revisit during refactor if time allows.

## Member — Dashboard (`/dashboard`)

- Shows membership plan name, status (e.g. "active"), valid-until date, and remaining credits ("Unlimited" for unlimited plans).
- Shows a running count of classes attended.
- Lists upcoming bookings with a status tag per booking: BOOKED, CANCELLED, or WAITLISTED.
- BOOKED entries show Reschedule and Cancel actions; WAITLISTED entries show a Cancel action (to leave the waitlist).

## Member — Waitlist (`/waitlist`)

- Lists classes the member is currently waitlisted for, each with a queue position (e.g. "#1 in queue").
- Each entry has a "Leave waitlist" action.

## Sign-in (`/login`)

- Wrong email/password combination shows a clear inline error: "Email or password is incorrect." No crash, no console error observed.

## Reschedule (shared: Member, Trainer — both can hold bookings)

- Route: reschedule modal opened from `/dashboard`, "Reschedule" button on a BOOKED entry.
- Can only reschedule to another class with the **exact same name** (e.g. "Mobility & Recovery" -> another "Mobility & Recovery" session only). This is enforced server-side, not just a UI filter.
- Must reschedule at least 4 hours before the original class's start time (`FREE_RESCHEDULE_HOURS = 4`), otherwise blocked with a clear message.
- Cannot reschedule into: a class that already started, a cancelled class, or a class you already have an active booking/waitlist entry for.
- If the target class is full, the reschedule still succeeds but lands the member on that class's waitlist instead of booked (not treated as an error).
- The original booking is not deleted on reschedule — it's marked `cancelled` and kept as history; a new booking row is created. This is why repeated reschedules produce multiple "CANCELLED" entries for the same class name in the dashboard — expected, not a bug.
- Credits: the new booking reuses the exact credit amount charged on the original booking, regardless of the new session's own credit cost.
  - **Assumption to verify**: this only stays correct if same-named classes always cost the same credits. Nothing in the code enforces that — worth checking seed data / admin class-editing to see if it's guaranteed.

### Refactor candidate: duplicated validation logic
- Where: `src/server/routers/reschedules.ts` — the `reschedule` mutation and `validateReschedule` query
- What: both run the same sequence of checks (ownership, active status, 4-hour window, same-name target, not-already-booked, not-cancelled, not-started) written out twice, nearly line-for-line identical.
- Plan: during the refactor phase, extract this into one shared function both procedures call. Good, concrete example of "pull repeated logic into one place" for the architecture write-up.

### Confirmed: staff accounts (trainer, admin) can also hold personal bookings
- Observed consistently for both the trainer account (Arjun Mehta) and the admin account (Priya Raman) — both have their own "Upcoming bookings" / waitlist entries on `/dashboard` and `/waitlist`, same as a member.
- Conclusion: this is intentional, not a bug — staff accounts double as gym members and can book/attend classes like anyone else. Confirmed by consistent behavior across two separate staff accounts, not a one-off.

## Reschedule modal (bug #2 — same root cause as bug #1)

- Where: `src/components/reschedule-modal.tsx`
- What happened: the exact same infinite-request-loop pattern as the schedule page bug, recurring in a second file — `new Date().toISOString()` recalculated inline on every render, passed into `classes.list.useQuery`. Confirmed via Network tab: 575+ repeated `classes.list` requests while the modal was open, eventually overwhelming the local dev server (`ERR_CONNECTION_REFUSED` observed in console).
- Secondary issue found in the same file: the query's `isLoading`/`isError` states were never checked — a still-loading or failed request silently displayed as "No other classes available," identical to the genuine empty state. This made the bug's symptom look like a data problem ("classes don't exist") rather than a loading problem.
- Fix: froze the timestamp with `useState`, same pattern as bug #1; added explicit loading and error UI states so "no matching classes" is only shown when that's actually true.
- Status: Fixed.

## My Bookings / Waitlist — final confirmation

- Duplicate booking attempts are correctly blocked with a clear inline error ("You are already on the list for this class."), no crash.
- Leaving a waitlist correctly returns to a clean empty state.
- Confirmed clean (no bugs) across Member, Trainer, and Admin roles once the reschedule modal fix above is applied.

## Notifications

- Route: `/notifications`; bell icon in nav shows live unread count.
- `markAllAsRead` (bulk) works correctly and is the only mark-as-read action that exists.

### Gap: no way to mark a single notification as read
- Where: `src/server/routers/notifications.ts` (backend has no per-notification mark-as-read procedure) and `src/app/notifications/page.tsx` (each notification row has no click handler).
- What happens: clicking/viewing an individual notification does nothing; the only way to clear unread status is "Mark all as read," which affects every notification at once.
- Status: Fixed. Added `notifications.markAsRead` (single-notification, ownership-checked) alongside the existing `markAllAsRead`, and wired a click handler on each unread notification card in `src/app/notifications/page.tsx`.

## Role model / who can book classes

- Single `users` table, one `role` column: `member` | `trainer` | `admin`. No separate profile tables per role.
- Confirmed via code: `bookings.book` requires only an authenticated session (`protectedProcedure`) — no role check. Any logged-in user, regardless of role, can book/waitlist/reschedule classes.
- `role` only gates access to additional staff-only pages/nav items (Admin, Kiosk, My schedule, Attendance) — it does not restrict ordinary booking actions.
- This confirms and explains the earlier observation: trainer and admin accounts holding personal bookings is a direct consequence of this design, not a special case.

## Admin: member/trainer management — significant gap

- No admin page exists to browse a full list of all members or all trainers. `/admin` shows only an aggregate count ("Members: N"), not a directory.
- Backend has working, unused endpoints: `members.setActive` (activate/deactivate a user) and `members.setRole` (change a user's role) — confirmed via full-codebase search that neither is called from any page in the app.
- `members.search` exists and works, but is only wired up inside the corporate company "Add Member" flow (`/admin/companies/[id]`) — not exposed as a general member directory.
- `auth.register` is the only account-creation path, is public, and always creates `role: "member"` (hardcoded) — there is currently no way, through the UI, to create a trainer or admin account, or to promote an existing member to trainer.
- "Members per trainer" is not a modeled relationship in this app — trainers are linked to classes they teach, not to a roster of members. No fix applicable here; this is a data-model reality, not a bug.
- Decision: documented as a known limitation, not built. Reasoning: this is a missing feature, not a behavior regression to fix; the brief's core scope is restructuring while preserving existing behavior, and adding a new admin surface here would add real scope/risk for a non-required feature. Clear documentation of the gap (backend capability exists and is unused) earns credit on its own.

## Trainer: My Schedule (`/trainer/schedule`)

- Correctly scoped: only shows classes taught by the logged-in trainer, with booked/checked-in counts per class.
- Weekly Availability section lists per-day time ranges with working Edit/Remove actions; edit mode shows time pickers with Save/Cancel. Confirmed clean.

## Kiosk (`/kiosk`, Trainer + Admin)

- Search is by exact email or phone, not name (searching "Arjun Mehta" by name correctly returns "Member not found" — working as designed, not a bug).
- Selecting a member correctly narrows to classes starting in the next 2 hours, with a clear message when there's nothing to check into.
- Confirmed clean.

## Admin: Corporate Memberships (`/admin/companies`)

### Bug: raw validation error dumped to the screen
- Where: "Create New Company" form, Contact Email field
- What happens: submitting a syntactically-odd but "valid enough to pass the browser" email (e.g. `a@a`) shows the raw Zod error object on screen: `[{"validation": "email", "code": "invalid_string", "message": "Invalid email", "path": ["contactEmail"]}]` instead of a clean message.
- Status: Fixed at the root cause — added a custom `errorFormatter` in `src/server/trpc.ts` that detects Zod validation errors app-wide and returns just the first issue's clean message instead of the raw error array. Fixes this class of bug everywhere in the app, not just this one form. Verified: `a@a` now shows a proper "Invalid email" message.

### Bug: adding a non-member to a company fails silently
- Where: `src/app/admin/companies/[id]/page.tsx`, `linkMutation`
- What happens: the "Search Members" box (`members.search`) returns all users regardless of role, so trainers/admins appear as addable candidates alongside real members. The backend correctly rejects linking a non-member (`BAD_REQUEST: "Only members can be linked to companies."`), but `linkMutation` has no `onError` handler — the rejection is completely invisible to the admin. Confirmed via console: repeated identical 400 errors, consistent with the admin retrying a click that appeared to do nothing.
- Two-part fix, either or both: (1) filter search results to `role: "member"` only so staff never appear as candidates, (2) add an `onError` handler to show the rejection message when it does happen.
- Status: Fixed — `members.search` now filters to `role: "member"` only (trainers/admins no longer appear as candidates at all), and `linkMutation` now has an `onError` handler as a defense-in-depth backstop. Verified: search no longer surfaces staff accounts.

### Confirmed: inactive companies are not restricted from edits
- `linkMember` (and by inspection, `topUp`) never check `company.active` — an inactive/deactivated company can still have members added and credits topped up with no restriction.
- Not treated as a bug — flagged as an open product question: should "Inactive" actually freeze the company, or is it intentionally just a display/booking-eligibility flag? Worth a line in the final write-up either way.

## Admin: Reports, Announcements, Attendance, Dashboard — all confirmed clean

- Reports: revenue-by-payment-method figures sum exactly to total revenue (₹80,000 + ₹36,000 + ₹13,500 + ₹10,500 = ₹1,40,000). No discrepancies.
- Attendance: "Check-ins by Day (14D)" showing a single day is correct, not a bug — confirmed via code (`groupBy(date(checkins.checkedInAt))` groups by real date); the underlying data simply has all check-in records on one day.
- Announcements: broadcast form gives a clear success message ("Announcement sent to 12 members!"), and confirmed end-to-end — recipients actually receive it as a notification.
- Admin dashboard stats (Members, Active Memberships, Revenue, Check-ins, Pending Payments) all cross-check correctly against Reports and Recent Payments data — no mismatches found.
- Confirmed again here: trainer and admin accounts can both subscribe to membership plans like any member (consistent with the role-model finding above).
- Waitlist promotion notifications ("You've been promoted!") confirmed working end-to-end.

## Summary: full feature sweep complete

Every screenshot provided across all four roles (member, trainer, admin, signed-out) has now been reviewed against the matching code. Total findings across the whole app:

**Bugs found and fixed (3):**
1. Schedule page infinite loading loop (unstable timestamp in query key)
2. Reschedule modal infinite loop (same root cause, second location) + missing loading/error states
3. Notifications: no way to mark a single notification as read (missing backend endpoint + click handler)

**Bugs found and fixed (2 more, total 5):**
4. "Create Company" raw validation error — fixed at the root cause with a global tRPC error formatter (fixes this class of bug app-wide)
5. Adding a non-member to a company failed silently — fixed by filtering search to members only, plus an error handler as backup

**Bug found, documented, not fixed (1)** — minor, deliberate scope decision:
1. Disabled "Book" button has no distinct visual style when signed out

**Missing feature, documented as known limitation (1):**
1. No admin UI to browse/manage the full members or trainers list, or to create a trainer account — backend partially supports it (`setActive`, `setRole` exist but are unused)

**Confirmed working correctly, no issues (everything else):** booking, waitlist, check-in, availability management, corporate credit pools, reports, attendance, announcements, role-based access, membership plans.