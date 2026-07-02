/**
 * Entry point for the "Create Release" GitHub Actions workflow.
 *
 * Reads a JSON payload (the release form data + a duplicate-protection
 * mode) from PAYLOAD_JSON, builds the release + task schedule, checks for
 * existing calendar events by releaseId, and creates/updates/recreates
 * events accordingly. Writes its outcome to results/{REQUEST_ID}.json.
 *
 * Never run directly with secrets you don't trust — this script makes
 * real Google Calendar API calls unless DRY_RUN=true.
 */
import { buildEventResource, createEvent, deleteEvent, findEventsByReleaseId, updateEvent } from '../src/lib/calendar';
import { calendarConfigFromEnv, isDryRun, requireEnv } from './lib/env';
import { writeResult } from './lib/result';
import { writePendingManifestEntry } from './lib/manifest';
import { buildRelease } from '../src/lib/release';
import { NotAFridayError } from '../src/lib/scheduling';
import type { ReleaseInput } from '../src/lib/types';

type DuplicateMode = 'cancel' | 'create-missing' | 'recreate-all' | 'update-existing';

interface CreateReleasePayload {
  release: ReleaseInput;
  mode?: DuplicateMode;
  emailRemindersEnabled?: boolean;
}

async function main() {
  const requestId = requireEnv('REQUEST_ID');
  const payload: CreateReleasePayload = JSON.parse(requireEnv('PAYLOAD_JSON'));
  const mode: DuplicateMode = payload.mode ?? 'create-missing';
  const dryRun = isDryRun();

  let release;
  try {
    release = buildRelease(payload.release);
  } catch (err) {
    if (err instanceof NotAFridayError) {
      writeResult(requestId, { ok: false, error: err.message });
      return;
    }
    throw err;
  }

  const reminderSettings = { emailRemindersEnabled: Boolean(payload.emailRemindersEnabled) };
  const timeZone = 'Australia/Melbourne';

  const plans = release.tasks.map((task) => ({
    task,
    resource: buildEventResource(release, task, reminderSettings, timeZone),
  }));

  if (dryRun) {
    writeResult(requestId, {
      ok: true,
      dryRun: true,
      releaseId: release.releaseId,
      mode,
      plannedEvents: plans.map((p) => ({
        taskId: p.task.id,
        title: p.resource.summary,
        start: p.resource.start,
      })),
    });
    console.log('[DRY RUN] Would create/update calendar events:', JSON.stringify(plans, null, 2));
    return;
  }

  const calendarConfig = calendarConfigFromEnv();
  const existing = await findEventsByReleaseId(calendarConfig, release.releaseId);

  if (existing.length > 0 && mode === 'cancel') {
    writeResult(requestId, {
      ok: true,
      cancelled: true,
      releaseId: release.releaseId,
      existingEventCount: existing.length,
    });
    return;
  }

  const existingByTaskId = new Map(
    existing.map((e) => [e.extendedProperties?.private?.taskId ?? '', e])
  );

  const createdEvents: { taskId: string; eventId: string; htmlLink?: string }[] = [];

  for (const plan of plans) {
    const existingEvent = existingByTaskId.get(plan.task.id);

    if (existingEvent?.id) {
      if (mode === 'update-existing' || mode === 'recreate-all') {
        if (mode === 'recreate-all') {
          await deleteEvent(calendarConfig, existingEvent.id);
          const created = await createEvent(calendarConfig, plan.resource);
          createdEvents.push({ taskId: plan.task.id, eventId: created.id ?? '', htmlLink: created.htmlLink ?? undefined });
        } else {
          const updated = await updateEvent(calendarConfig, existingEvent.id, plan.resource);
          createdEvents.push({ taskId: plan.task.id, eventId: updated.id ?? '', htmlLink: updated.htmlLink ?? undefined });
        }
      }
      // mode === 'create-missing': leave the existing event untouched.
      continue;
    }

    const created = await createEvent(calendarConfig, plan.resource);
    createdEvents.push({ taskId: plan.task.id, eventId: created.id ?? '', htmlLink: created.htmlLink ?? undefined });
  }

  writeResult(requestId, {
    ok: true,
    releaseId: release.releaseId,
    mode,
    existingEventCountBeforeRun: existing.length,
    events: createdEvents,
  });

  // Write a pending manifest entry so publish-result can update releases/manifest.json
  // on the results branch. Only written for real (non-dry-run) successful runs so the
  // manifest reflects actual scheduled releases.
  writePendingManifestEntry(release);
}

main().catch((err) => {
  console.error(err);
  const requestId = process.env.REQUEST_ID;
  if (requestId) {
    writeResult(requestId, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  process.exitCode = 1;
});
