/**
 * Calendar dates stored as "YYYY-MM-DD" (the schema `date` field type).
 *
 * Parsed by their parts on purpose: `new Date("2026-11-05")` is read as UTC midnight, which is
 * still the previous day anywhere west of UTC.
 */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-midnight Date for a "YYYY-MM-DD" string, or null when the text is not one. */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  const match = CALENDAR_DATE.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD" for a Date, read in local time. */
export function formatCalendarDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A stored date as the player reads it ("Nov 5, 2026"), in the given locale. Unparseable text is returned as is. */
export function displayCalendarDate(value: string | null | undefined, locale?: string): string {
  const date = parseCalendarDate(value);
  if (!date) return value || '';
  try {
    return new Intl.DateTimeFormat(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }
}
