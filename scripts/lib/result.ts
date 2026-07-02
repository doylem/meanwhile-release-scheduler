import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Writes a JSON result file to results/{requestId}.json. The workflow that
 * calls this script commits the file to the dedicated `results` branch
 * (see .github/workflows/*.yml) right after the script finishes. The
 * frontend polls that file over the GitHub Contents API / raw.githubusercontent.com
 * using the requestId it generated when it dispatched the workflow.
 */
export function writeResult(requestId: string, payload: unknown): string {
  const dir = join(process.cwd(), 'results');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${requestId}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        requestId,
        completedAt: new Date().toISOString(),
        ...((payload as object) ?? {}),
      },
      null,
      2
    )
  );
  return path;
}
