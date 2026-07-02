import { generateReleaseId } from './releaseId';
import { assertFriday, generateTasks } from './scheduling';
import type { Release, ReleaseInput } from './types';

/**
 * Builds a full Release object from form input: validates the release date
 * is a Friday, generates the task schedule, and computes the stable
 * release ID used for duplicate protection.
 *
 * Throws NotAFridayError if releaseDateISO isn't a Friday — callers in the
 * UI should catch this and show the validation message inline.
 */
export function buildRelease(input: ReleaseInput): Release {
  assertFriday(input.releaseDateISO);
  return {
    ...input,
    releaseId: generateReleaseId(input),
    tasks: generateTasks(input.releaseDateISO),
  };
}
