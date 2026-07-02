/**
 * Server-only Google Calendar client wrapper. Imports the real `googleapis`
 * runtime, so this file must NEVER be imported from frontend
 * components/pages — only from scripts/*.ts (which run inside GitHub
 * Actions, not the browser). Frontend code should import the pure builders
 * from ./calendarEvents instead.
 */
import { google, calendar_v3 } from 'googleapis';

export {
  buildEventTitle,
  buildEventDescription,
  buildReminders,
  getConfiguredAttendees,
  buildEventResource,
  type ReminderSettings,
} from './calendarEvents';

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface CalendarClientConfig extends GoogleAuthConfig {
  calendarId: string;
}

function createCalendarClient(config: CalendarClientConfig): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/** Finds existing events for a release by its releaseId (exact-date match). */
export async function findEventsByReleaseId(
  config: CalendarClientConfig,
  releaseId: string
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = createCalendarClient(config);
  const res = await calendar.events.list({
    calendarId: config.calendarId,
    privateExtendedProperty: [`releaseId=${releaseId}`],
    maxResults: 50,
  });
  return res.data.items ?? [];
}

/** Finds existing events for a release by its date-independent catalogue key (used when moving dates). */
export async function findEventsByCatalogueKey(
  config: CalendarClientConfig,
  catalogueKey: string
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = createCalendarClient(config);
  const res = await calendar.events.list({
    calendarId: config.calendarId,
    privateExtendedProperty: [`catalogueKey=${catalogueKey}`],
    maxResults: 50,
  });
  return res.data.items ?? [];
}

export async function deleteEvent(config: CalendarClientConfig, eventId: string): Promise<void> {
  const calendar = createCalendarClient(config);
  await calendar.events.delete({ calendarId: config.calendarId, eventId, sendUpdates: 'all' });
}

export async function createEvent(
  config: CalendarClientConfig,
  resource: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event> {
  const calendar = createCalendarClient(config);
  const res = await calendar.events.insert({
    calendarId: config.calendarId,
    requestBody: resource,
    sendUpdates: 'all',
  });
  return res.data;
}

export async function updateEvent(
  config: CalendarClientConfig,
  eventId: string,
  resource: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event> {
  const calendar = createCalendarClient(config);
  const res = await calendar.events.update({
    calendarId: config.calendarId,
    eventId,
    requestBody: resource,
    sendUpdates: 'all',
  });
  return res.data;
}
