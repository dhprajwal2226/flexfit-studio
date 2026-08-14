/**
 * Hours remaining until the given ISO timestamp, relative to `now`
 * (defaults to the current time). Negative if the timestamp is in the past.
 */
export function hoursUntil(iso: string, now = new Date()): number {
    return (new Date(iso).getTime() - now.getTime()) / 36e5;
  }