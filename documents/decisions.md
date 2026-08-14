# Architecture decisions

Written before refactoring, to record *why* the new structure looks the way it does — not as after-the-fact justification.

## Problem with the current structure

All 13 backend router files sit flat in `src/server/routers/`, with no grouping by feature. Finding "everything related to bookings" requires already knowing three unrelated filenames (`bookings.ts`, `corporate-bookings.ts`, `reschedules.ts`). This was discovered while building `documents/behavior-spec.md`: the codebase was mapped feature by feature, and the file layout didn't match how the app is actually organized conceptually.

Two confirmed instances of duplicated logic were found during that mapping (details and evidence in `behavior-spec.md`):
1. `reschedules.ts` — the `reschedule` mutation and `validateReschedule` query run the same sequence of checks, written out twice, nearly line-for-line identical.
2. `bookings.ts` and `corporate-bookings.ts` — their `book` procedures follow the identical shape (class validity checks → duplicate-booking check → payer credit check → capacity count → insert → deduct credit), differing only in *who pays* (personal membership credits vs. a company's shared credit pool) and which table is written to.

## New structure

```
src/server/
├── routers/
│   ├── booking/
│   │   ├── bookings.ts
│   │   ├── corporate-bookings.ts
│   │   └── reschedules.ts
│   ├── scheduling/
│   │   ├── classes.ts
│   │   └── trainers.ts
│   ├── people/
│   │   ├── auth.ts
│   │   └── members.ts
│   ├── admin/
│   │   ├── admin.ts
│   │   └── admin-companies.ts
│   ├── payments.ts
│   ├── plans.ts
│   ├── notifications.ts
│   └── _app.ts
├── services/
│   ├── booking-validation.ts
│   └── reschedule-validation.ts
└── trpc.ts
```

## Decision 1: group routers by feature domain

Routers are grouped into `booking/`, `scheduling/`, `people/`, `admin/` — folders that mirror the app's actual feature areas, discovered through the behavior mapping. `app/` (the Next.js pages) is left as-is; it's already organized by role/route (`admin/`, `trainer/`) and restructuring it further offered no clear benefit for real risk.

## Decision 2: extract shared validation logic into `services/`, not a full data-model merge

Three options were considered for the booking duplication:

- **Merge `bookings` and `corporateBookings` into one table** (e.g. a nullable `companyId` column) would be the most complete fix, but touches the database schema and every place that reads from either table — personal dashboard, attendance, reports, kiosk, reschedule. That's a large surface area to re-verify against `behavior-spec.md` within the project timeline, for a change the brief doesn't require. Declined for this project; noted here as the correct next step with more time.
- **Do nothing** was rejected — the duplication is clearly evidenced (see behavior-spec.md) and a low-risk reduction is available; leaving it undone for no time saved doesn't hold up.
- **Extract only the genuinely identical logic** (class-validity checks, capacity counting, and the reschedule eligibility checks) into shared functions in a new `services/` folder, while keeping the parts that are legitimately different (personal membership credit deduction vs. company credit pool deduction) separate in each router. This is pure internal code reuse — no schema change, no change to any existing data flow or table — so it carries very little risk of altering behavior, while directly addressing the brief's instruction to "pull repeated logic into one place instead of four."

**Chosen: the third option.** Each duplicated block moves to one shared function; both routers call it instead of repeating the checks. The parts that differ (which credits get deducted) stay where they are, because they're genuinely different business logic, not duplication.

## Outcome

The refactor was completed as planned:
- `bookings.ts`, `corporate-bookings.ts`, `reschedules.ts` moved into `routers/booking/`; `classes.ts`, `trainers.ts` into `routers/scheduling/`; `auth.ts`, `members.ts` into `routers/people/`; `admin.ts`, `admin-companies.ts` into `routers/admin/`.
- Three shared functions extracted into `services/`: `hoursUntil` (was duplicated identically in 3 files), `checkRescheduleEligibility` (was duplicated between `reschedule` and `validateReschedule`), and `checkClassBookable` (was duplicated between personal and corporate booking).
- The genuinely different logic — personal membership credits vs. corporate credit pool, and the different cancellation-window constants (12h vs 24h) — was deliberately left separate in each router, consistent with the reasoning above: not everything that looks similar is actually duplication.

Every step was verified with a full `pnpm build` (zero errors, all 17 routes compiling) plus, for the logic-rewriting steps (not the pure file moves), a live re-test of the affected feature in the running app to confirm behavior matched what was documented in `behavior-spec.md` before the change.