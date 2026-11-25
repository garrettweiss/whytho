/** ISO week helpers. Week number format is YYYY * 100 + ISO_WEEK, matching the database. */

const DAY_MS = 86_400_000;

export function isoWeekOf(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return d.getUTCFullYear() * 100 + week;
}

/** Monday 00:00 UTC of the given week. January 4 is always in ISO week 1. */
export function mondayOf(week: number): Date {
  const year = Math.floor(week / 100);
  const number = week % 100;
  const monday = new Date(Date.UTC(year, 0, 4));
  const sinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - sinceMonday + (number - 1) * 7);
  return monday;
}

export function nextWeek(week: number): number {
  const monday = mondayOf(week);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return isoWeekOf(monday);
}

export function weekLabel(week: number): string {
  return `${Math.floor(week / 100)}-W${String(week % 100).padStart(2, "0")}`;
}

export function parseWeekArg(value: string | undefined): number | null {
  if (!value) return null;
  const compact = /^(\d{4})(\d{2})$/.exec(value);
  const labelled = /^(\d{4})-W(\d{2})$/i.exec(value);
  const match = compact ?? labelled;
  if (!match) return null;
  const week = Number(match[1]) * 100 + Number(match[2]);
  return week % 100 >= 1 && week % 100 <= 53 ? week : null;
}

/** dayIndex 0 = Monday … 6 = Sunday. */
export function slot(week: number, dayIndex: number, hourUtc: number, minuteUtc = 0): string {
  const at = mondayOf(week);
  at.setUTCDate(at.getUTCDate() + dayIndex);
  at.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return at.toISOString();
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
