import { eq } from "drizzle-orm";
import { classes } from "@/db/schema";
import { hoursUntil } from "./time";
import type { db as DB } from "@/db";

type Db = typeof DB;

type ClassBookableResult =
  | { ok: true; cls: typeof classes.$inferSelect }
  | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST"; message: string };

/**
 * Checks whether a class exists, isn't cancelled, and hasn't already started.
 * Identical logic was previously duplicated in bookings.ts and
 * corporate-bookings.ts's `book` procedures — see behavior-spec.md.
 *
 * Deliberately does NOT check credits/capacity here: personal bookings check
 * membership credits, corporate bookings check a company credit pool — those
 * are genuinely different rules, not duplication, and are kept separate in
 * each router (see decisions.md).
 */
export async function checkClassBookable(
  db: Db,
  classId: number,
): Promise<ClassBookableResult> {
  const cls = await db.select().from(classes).where(eq(classes.id, classId)).get();

  if (!cls) {
    return { ok: false, code: "NOT_FOUND", message: "Class not found." };
  }
  if (cls.cancelled) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    };
  }
  if (hoursUntil(cls.startsAt) <= 0) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This class has already started.",
    };
  }

  return { ok: true, cls };
}