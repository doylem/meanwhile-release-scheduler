import { DateTime } from 'luxon';
import { DEFAULT_TIMEZONE, EVENT_TIME, TASK_RULES } from '../../config/labels.config';
import type { ScheduledTask } from './types';

/**
 * Parses a YYYY-MM-DD date string as a local calendar date in the given
 * IANA timezone (default Australia/Melbourne). This deliberately avoids
 * UTC offsets — luxon resolves AEST/AEDT from the timezone's own rules,
 * so this is correct year-round without manual DST handling.
 */
export function parseLocalDate(dateISO: string, zone: string = DEFAULT_TIMEZONE): DateTime {
  const dt = DateTime.fromISO(dateISO, { zone });
  if (!dt.isValid) {
    throw new Error(`Invalid date "${dateISO}": ${dt.invalidReason} — ${dt.invalidExplanation}`);
  }
  return dt.startOf('day');
}

/** Luxon weekday: 1 = Monday ... 5 = Friday ... 7 = Sunday. */
const FRIDAY = 5;

export function isFriday(dateISO: string, zone: string = DEFAULT_TIMEZONE): boolean {
  return parseLocalDate(dateISO, zone).weekday === FRIDAY;
}

export class NotAFridayError extends Error {
  constructor(dateISO: string) {
    const dt = parseLocalDate(dateISO);
    super(
      `${dateISO} is a ${dt.toFormat('cccc')}, not a Friday. Release dates must fall on a Friday (Australia/Melbourne).`
    );
    this.name = 'NotAFridayError';
  }
}

/** Throws NotAFridayError if the date is not a Friday. Returns the date unchanged otherwise. */
export function assertFriday(dateISO: string, zone: string = DEFAULT_TIMEZONE): string {
  if (!isFriday(dateISO, zone)) {
    throw new NotAFridayError(dateISO);
  }
  return dateISO;
}

/**
 * Suggests the next Friday on/after a given date — handy for surfacing a
 * sensible default in the UI when a user picks a non-Friday date.
 */
export function nextFriday(dateISO: string, zone: string = DEFAULT_TIMEZONE): string {
  let dt = parseLocalDate(dateISO, zone);
  while (dt.weekday !== FRIDAY) {
    dt = dt.plus({ days: 1 });
  }
  return dt.toISODate()!;
}

/**
 * Generates the full task schedule for a release date, using the rules in
 * config/labels.config.ts. Pure function — no external calls, no validation
 * side effects beyond requiring a parseable date. Callers should validate
 * Friday-ness separately (assertFriday) so this can also be used to preview
 * "what would this look like" before the date is finalized.
 */
export function generateTasks(releaseDateISO: string, zone: string = DEFAULT_TIMEZONE): ScheduledTask[] {
  const releaseDate = parseLocalDate(releaseDateISO, zone);
  return TASK_RULES.map((rule) => {
    const due = releaseDate.minus({ days: rule.daysBeforeRelease });
    return {
      id: rule.id,
      title: rule.title,
      owner: rule.owner,
      dueDateISO: due.toISODate()!,
      daysBeforeRelease: rule.daysBeforeRelease,
      ...(rule.startHour !== undefined ? { startHour: rule.startHour } : {}),
    };
  });
}

/**
 * Builds the Google Calendar-ready start/end datetimes for a task due date.
 * Uses the configured timed window (default 9:00-9:15am) in the given
 * timezone. Luxon's toISO() includes the correct UTC offset for that exact
 * date, so AEST/AEDT transitions are handled automatically.
 */
export function buildEventTimes(
  dueDateISO: string,
  zone: string = DEFAULT_TIMEZONE,
  startHourOverride?: number
): { startDateTime: string; endDateTime: string; timeZone: string } {
  const day = parseLocalDate(dueDateISO, zone);
  const hour = startHourOverride ?? EVENT_TIME.startHour;
  const start = day.set({ hour, minute: EVENT_TIME.startMinute, second: 0, millisecond: 0 });
  const end = start.plus({ minutes: 15 });
  return {
    startDateTime: start.toISO()!,
    endDateTime: end.toISO()!,
    timeZone: zone,
  };
}

export function tasksToEventTimePlans(tasks: ScheduledTask[], zone: string = DEFAULT_TIMEZONE) {
  return tasks.map((task) => ({
    task,
    ...buildEventTimes(task.dueDateISO, zone),
  }));
}

/** Human-friendly date for emails: "Friday June 26th". */
export function formatFridayLong(dateISO: string, zone: string = DEFAULT_TIMEZONE): string {
  const dt = parseLocalDate(dateISO, zone);
  const day = dt.day;
  const suffix = ordinalSuffix(day);
  return `${dt.toFormat('cccc LLLL')} ${day}${suffix}`;
}

function ordinalSuffix(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st';
  if (day % 10 === 2 && day !== 12) return 'nd';
  if (day % 10 === 3 && day !== 13) return 'rd';
  return 'th';
}
