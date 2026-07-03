import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ReleaseState } from '../../src/lib/types';

/**
 * Writes a partial state update to releases/pending-state.json in the working
 * directory. The publish-result action deep-merges this into
 * state/{catalogueNumber}.json on the results branch after the script finishes.
 */
export function writePendingState(partial: Partial<ReleaseState> & { catalogueNumber: string }): void {
  const dir = join(process.cwd(), 'releases');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pending-state.json'), JSON.stringify(partial, null, 2) + '\n');
}
