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

async function putState(cat: string, state: ReleaseState, sha: string | null, token: string): Promise<Response> {
  return fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${statePath(cat)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `Update task completion for ${cat}`,
      content: toBase64(JSON.stringify(state, null, 2)),
      branch: RESULTS_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

/**
 * Reads state/{cat}.json from the results branch, applies a batch of task
 * completion changes (taskId -> done) in one go, and writes the merged
 * result back. Preserves every other field (coverArtUrl, dropbox, calendar,
 * email) written by the GitHub Actions scripts.
 *
 * Applying a whole batch per write — rather than one write per checkbox
 * click — is what makes this safe to call from a debounced queue: clicking
 * several checkboxes in quick succession only ever produces one write, so
 * there's no stale-sha race between two overlapping read-modify-write
 * cycles for the same file. If the file was changed elsewhere between our
 * read and write (e.g. a GitHub Actions script ran concurrently), the PUT
 * comes back 409 and we retry once with a fresh sha — good enough for
 * eventual consistency without blocking the UI on it.
 */
export async function setTaskCompletions(
  cat: string,
  changes: Record<string, boolean>,
  token: string
): Promise<ReleaseState> {
  const attempt = async (): Promise<{ state: ReleaseState; res: Response }> => {
    const { state, sha } = await fetchStateWithSha(cat, token);
    let completedTasks = state.completedTasks;
    for (const [taskId, done] of Object.entries(changes)) {
      completedTasks = applyTaskCompletion(completedTasks, taskId, done);
    }
    const updated: ReleaseState = { ...state, catalogueNumber: cat, completedTasks };
    const res = await putState(cat, updated, sha, token);
    return { state: updated, res };
  };

  let { state, res } = await attempt();
  if (!res.ok && res.status === 409) {
    ({ state, res } = await attempt());
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `GitHub API error ${res.status}`);
  }
  return state;
}
