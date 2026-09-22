// Helpers for treating `session_date` (a timestamptz column) as a plain
// calendar date rather than a precise instant.
//
// Session logs never collect or display a time-of-day — the coach just picks
// a day in an `<input type="date">`. That input gives us a bare
// "YYYY-MM-DD" string, which `new Date(str)` parses as UTC MIDNIGHT. If we
// stored that directly and later displayed it with `toLocaleDateString()`
// (which renders in the *browser's local* timezone), anyone west of UTC
// (e.g. America/Los_Angeles) would see the date roll back a day — midnight
// UTC on the 11th is still the 10th in the evening in Pacific time.
//
// Fix: store the calendar date as UTC **noon** instead of UTC midnight, and
// always format it back out in UTC too. Noon UTC is >=12h away from the UTC
// day boundary in both directions, so it lands on the same calendar day for
// every real-world timezone (all of which are within UTC-12..UTC+14).
// Formatting in UTC (rather than local time) then guarantees we display
// whatever calendar day was actually picked, regardless of the viewer's
// timezone.

/** Convert a bare "YYYY-MM-DD" date-input value into the timestamptz string we store. */
export function dateOnlyToTimestamp(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`
}

/** Format a stored `session_date` timestamptz back into a plain "YYYY-MM-DD" string, in UTC. */
export function timestampToDateOnly(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Format a stored `session_date` timestamptz for display, e.g. "Sep 11, 2026".
 * Always renders in UTC so the displayed calendar day matches what was
 * picked, independent of the viewer's local timezone.
 */
export function formatSessionDate(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
