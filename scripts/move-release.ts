/**
 * Entry point for the "Move Release" GitHub Actions workflow.
 *
 * Finds existing events for a release by its date-independent catalogue
 * key (label + catalogue number + artist), recalculates the task schedule
 * against the new release date, and updates each existing event's time,
 * title, description and extendedProperties.releaseId in place — never
 * creates duplicates.
 */
import {
  buildEventResource,
  createEvent,
  findEventsByCatalogueKey,
  updateEvent,
} from '../src/lib/calendar';
import { calendarConfigFromEnv, isDryRun, requireEnv } from './lib/env';
import { writeResult } from './lib/result';
import { generateCatalogueKey } from '../src/lib/releaseId';
import { buildRelease } from '../src/lib/release';
import { NotAFridayError } from '../src/lib/scheduling';
import type { ReleaseInput } from '../src/lib/types';

interface MoveReleasePayload {
  /** The release as it currently stands, with the OLD release date. */
  currentRelease: ReleaseInput;
  /** New release date (must be a Friday). */
  newReleaseDateISO: string;
  emailRemindersEnabled?: boolean;
}

async function main() {
  const requestId = requireEnv('REQUEST_ID');
  const payload: MoveReleasePayload = JSON.parse(requireEnv('PAYLOAD_JSON'));
  const dryRun = isDryRun();

  let updatedRelease;
  try {
    updatedRelease = buildRelease({ ...payload.currentRelease, releaseDateISO: payload.newReleaseDateISO });
  } catch (err) {
    if (err instanceof NotAFridayError) {
      writeResult(requestId, { ok: false, error: err.message });
      return;
    }
    throw err;
  }

  const catalogueKey = generateCatalogueKey(payload.currentRelease);
  const reminderSettings = { emailRemindersEnabled: Boolean(payload.emailRemindersEnabled) };
  const timeZone = 'Australia/Melbourne';

  const plans = updatedRelease.tasks.map((task) => ({
    task,
    resource: buildEventResource(updatedRelease, task, reminderSettings, timeZone),
  }));

  if (dryRun) {
    writeResult(requestId, {
      ok: true,
      dryRun: true,
      catalogueKey,
      newReleaseId: updatedRelease.releaseId,
      plannedUpdates: plans.map((p) => ({ taskId: p.task.id, title: p.resource.summary, start: p.resource.start })),
    });
    return;
  }

  const calendarConfig = calendarConfigFromEnv();
  const existing = await findEventsByCatalogueKey(calendarConfig, catalogueKey);
  const existingByTaskId = new Map(existing.map((e) => [e.extendedProperties?.private?.taskId ?? '', e]));

  const updated: { taskId: string; eventId: string }[] = [];
  const created: { taskId: string; eventId: string }[] = [];

  for (const plan of plans) {
    const existingEvent = existingByTaskId.get(plan.task.id);
    if (existingEvent?.id) {
      const res = await updateEvent(calendarConfig, existingEvent.id, plan.resource);
      updated.push({ taskId: plan.task.id, eventId: res.id ?? '' });
    } else {
      // No existing event for this task (e.g. the release was only
      // partially created before) — create it rather than skip it.
      const res = await createEvent(calendarConfig, plan.resource);
      created.push({ taskId: plan.task.id, eventId: res.id ?? '' });
    }
  }

  writeResult(requestId, {
    ok: true,
    catalogueKey,
    oldReleaseDateISO: payload.currentRelease.releaseDateISO,
    newReleaseDateISO: payload.newReleaseDateISO,
    newReleaseId: updatedRelease.releaseId,
    existingEventCountBeforeRun: existing.length,
    updatedEvents: updated,
    createdEvents: created,
  });
}

main().catch((err) => {
  console.error(err);
  const requestId = process.env.REQUEST_ID;
  if (requestId) {
    writeResult(requestId, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  process.exitCode = 1;
});
