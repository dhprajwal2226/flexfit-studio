import { and, eq, sql } from "drizzle-orm";
import { bookings, classes, memberships } from "@/db/schema";
import { hoursUntil } from "./time";
import type { db as DB } from "@/db";

/**
 * Members may reschedule free of charge up to this many hours before the
 * original class starts. This is more generous than cancellation policy.
 */
export const FREE_RESCHEDULE_HOURS = 4;

type Db = typeof DB;

type RescheduleCheckResult =
  | {
      ok: true;
      originalBooking: typeof bookings.$inferSelect;
      originalClass: typeof classes.$inferSelect;
      targetClass: typeof classes.$inferSelect;
      targetIsFull: boolean;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT";
      message: string;
    };

/**
 * Runs every eligibility check for rescheding `fromBookingId` to `toClassId`,
 * for the given user. Used by both the `reschedule` mutation (which needs to
 * throw on failure) and `validateReschedule` (which needs to report failure
 * without throwing) — see behavior-spec.md for why this was extracted.
 */
export async function checkRescheduleEligibility(
  db: Db,
  userId: number,
  fromBookingId: number,
  toClassId: number,
): Promise<RescheduleCheckResult> {
  const originalRow = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, fromBookingId))
    .get();

  if (!originalRow) {
    return { ok: false, code: "NOT_FOUND", message: "Booking not found." };
  }

  const originalBooking = originalRow.booking;
  const originalClass = originalRow.cls;

  if (originalBooking.userId !== userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You cannot reschedule this booking.",
    };
  }

  if (
    originalBooking.status !== "booked" &&
    originalBooking.status !== "waitlisted"
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This booking is no longer active.",
    };
  }

  const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
  if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
    };
  }

  const targetClass = await db
    .select()
    .from(classes)
    .where(eq(classes.id, toClassId))
    .get();

  if (!targetClass) {
    return { ok: false, code: "NOT_FOUND", message: "Target class not found." };
  }

  if (targetClass.name !== originalClass.name) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "You can only reschedule to a class with the same name.",
    };
  }

  if (targetClass.id === originalClass.id) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "You are already booked for this class.",
    };
  }

  if (hoursUntil(targetClass.startsAt) <= 0) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This class has already started.",
    };
  }

  if (targetClass.cancelled) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    };
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, targetClass.id),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existingBooking) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "You already have an active booking for this class.",
    };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(eq(bookings.classId, targetClass.id), eq(bookings.status, "booked")),
    );

  const targetIsFull = Number(count) >= targetClass.capacity;

  return { ok: true, originalBooking, originalClass, targetClass, targetIsFull };
}
