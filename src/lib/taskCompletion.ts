import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import type { ReleaseState } from './types';

const RESULTS_BRANCH = 'results';

function statePath(cat: string): string {
  return `state/${cat}.json`;
}

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function fetchStateWithSha(cat: string, token: string): Promise<{ state: ReleaseState; sha: string | null }> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${statePath(cat)}?ref=${RESULTS_BRANCH}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    }
  );
  if (!res.ok) return { state: { catalogueNumber: cat }, sha: null };
  const json = (await res.json()) as { sha: string; content: string };
  return { state: JSON.parse(fromBase64(json.content)) as ReleaseState, sha: json.sha };
}

/** Pure — adds or removes a task ID from a completed-tasks list, de-duplicated. */
export function applyTaskCompletion(existing: string[] | undefined, taskId: string, done: boolean): string[] {
  const set = new Set(existing ?? []);
  if (done) set.add(taskId);
  else set.delete(taskId);
  return [...set];
}

/**
 * Reads state/{cat}.json from the results branch, toggles a single task ID
 * in completedTasks, and writes the merged result back. Preserves every
 * other field (coverArtUrl, dropbox, calendar, email) written by the
 * GitHub Actions scripts.
 */
export async function setTaskCompletion(
  cat: string,
  taskId: string,
  done: boolean,
  token: string
): Promise<ReleaseState> {
  const { state, sha } = await fetchStateWithSha(cat, token);
  const updated: ReleaseState = {
    ...state,
    catalogueNumber: cat,
    completedTasks: applyTaskCompletion(state.completedTasks, taskId, done),
  };
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${statePath(cat)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `Update task completion for ${cat}`,
        content: toBase64(JSON.stringify(updated, null, 2)),
        branch: RESULTS_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `GitHub API error ${res.status}`);
  }
  return updated;
}
