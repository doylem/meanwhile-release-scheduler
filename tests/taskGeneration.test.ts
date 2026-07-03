import { describe, expect, it } from 'vitest';
import { generateTasks, buildEventTimes } from '../src/lib/scheduling';
import { TASK_RULES } from '../config/labels.config';

describe('task generation', () => {
  const releaseDate = '2026-07-17'; // Friday

  it('generates one task per configured rule', () => {
    const tasks = generateTasks(releaseDate);
    expect(tasks).toHaveLength(TASK_RULES.length);
  });

  it('computes correct due dates relative to the release date', () => {
    const tasks = generateTasks(releaseDate);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

    expect(byId['prepare-masters']!.dueDateISO).toBe('2026-06-26'); // 21 days before
    expect(byId['artwork-ideation']!.dueDateISO).toBe('2026-06-26'); // 21 days before
    expect(byId['artwork-due']!.dueDateISO).toBe('2026-06-28'); // 19 days before
    expect(byId['liner-notes-due']!.dueDateISO).toBe('2026-07-01'); // 16 days before
    expect(byId['inflyte-upload']!.dueDateISO).toBe('2026-07-02'); // 15 days before
    expect(byId['video-promos-due']!.dueDateISO).toBe('2026-07-12'); // 5 days before
    expect(byId['teaser-1']!.dueDateISO).toBe('2026-07-14'); // 3 days before
    expect(byId['teaser-2']!.dueDateISO).toBe('2026-07-16'); // 1 day before
    expect(byId['release-announcement']!.dueDateISO).toBe('2026-07-18'); // day after release
    expect(byId['soundcloud-upload']!.dueDateISO).toBe('2026-07-18'); // day after release
  });

  it('assigns the configured owner to each task', () => {
    const tasks = generateTasks(releaseDate);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    expect(byId['prepare-masters']!.owner).toBe('Gavin');
    expect(byId['artwork-due']!.owner).toBe('Matty');
    expect(byId['liner-notes-due']!.owner).toBe('James');
  });

  it('builds a 9:00-9:15am Australia/Melbourne event window for each due date', () => {
    const times = buildEventTimes('2026-07-17');
    expect(times.startDateTime).toContain('T09:00:00');
    expect(times.endDateTime).toContain('T09:15:00');
    expect(times.timeZone).toBe('Australia/Melbourne');
    // July is AEST (+10:00) in Melbourne — confirms no hardcoded UTC offset drift.
    expect(times.startDateTime.endsWith('+10:00')).toBe(true);
  });

  it('uses the startHour override for tasks that specify one', () => {
    const tasks = generateTasks('2026-07-17');
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    expect(byId['release-announcement']!.startHour).toBe(12);
    expect(byId['soundcloud-upload']!.startHour).toBe(12);
    const times = buildEventTimes('2026-07-18', undefined, 12);
    expect(times.startDateTime).toContain('T12:00:00');
    expect(times.endDateTime).toContain('T12:15:00');
  });

  it('uses the AEDT offset for due dates that fall in daylight saving', () => {
    const times = buildEventTimes('2026-01-09');
    expect(times.startDateTime.endsWith('+11:00')).toBe(true);
  });
});
