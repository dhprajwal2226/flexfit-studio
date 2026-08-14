import { router } from "../trpc";
import { authRouter } from "./people/auth";
import { membersRouter } from "./people/members";
import { plansRouter } from "./plans";
import { classesRouter } from "./scheduling/classes";
import { bookingsRouter } from "./booking/bookings";
import { paymentsRouter } from "./payments";
import { adminRouter } from "./admin/admin";
import { notificationsRouter } from "./notifications";
import { trainersRouter } from "./scheduling/trainers";
import { corporateBookingsRouter } from "./booking/corporate-bookings";
import { adminCompaniesRouter } from "./admin/admin-companies";
import { reschedulesRouter } from "./booking/reschedules";

export const appRouter = router({
  auth: authRouter,
  members: membersRouter,
  plans: plansRouter,
  classes: classesRouter,
  bookings: bookingsRouter,
  reschedules: reschedulesRouter,
  corporateBookings: corporateBookingsRouter,
  payments: paymentsRouter,
  admin: adminRouter,
  adminCompanies: adminCompaniesRouter,
  notifications: notificationsRouter,
  trainers: trainersRouter,
});

export type AppRouter = typeof appRouter;